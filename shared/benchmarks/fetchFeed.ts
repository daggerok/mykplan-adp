/// <reference lib="esnext" />
// Benchmark feeds of the daggerok brand repos (the plan section 8): meta.json, then only the history pages
// the asked range needs. Source chain daggerok.github.io -> raw.githubusercontent.com -> cdn.jsdelivr.net,
// cors without credentials, 15 s timeout, 2 retries, at most 4 requests in flight, pages cached by
// URL + asOf + totalRows. fetch is injected, so tests run offline
import { daysBetween, parseDate } from '../dates';
import { adapterFor } from './adapters';
import { dateOf, toRecord } from './adapters/common';
import type { AdaptResult, AdapterName, Cell, FeedMeta, RawRow, RawTable } from './types';

export interface FeedSpec {
  brand: string;
  slug: string;
  adapter?: AdapterName;
}

export type FetchFn = typeof fetch;

// A source turns the repo path "api/<slug>/funds/<T>/meta.json" into a URL
export type Source = (brand: string, path: string) => string;

export const SOURCES: Source[] = [
  (brand, path) => `https://daggerok.github.io/${brand}/${path}`,
  (brand, path) => `https://raw.githubusercontent.com/daggerok/${brand}/main/${path}`,
  (brand, path) => `https://cdn.jsdelivr.net/gh/daggerok/${brand}@main/${path}`,
];

// Pluggable cache: in memory here, IndexedDB in the viewer later. Values are parsed JSON
export interface FeedCache {
  get(key: string): unknown | Promise<unknown>;
  set(key: string, value: unknown): void | Promise<void>;
}

export class MemoryCache implements FeedCache {
  private readonly map = new Map<string, unknown>();
  get(key: string): unknown { return this.map.get(key); }
  set(key: string, value: unknown): void { this.map.set(key, value); }
  get size(): number { return this.map.size; }
}

// At most n tasks run at once; a limiter can be shared by several feeds loaded together
export type Limiter = <T>(task: () => Promise<T>) => Promise<T>;

export function createLimiter(n: number): Limiter {
  let active = 0;
  const queue: Array<() => void> = [];
  const next = () => {
    if (active >= n || !queue.length) return;
    active++;
    queue.shift()!();
  };
  return <T>(task: () => Promise<T>) => new Promise<T>((resolve, reject) => {
    queue.push(() => {
      task().then(resolve, reject).then(() => { active--; next(); });
    });
    next();
  });
}

const sharedLimiter = createLimiter(4);

export interface FetchFeedOptions {
  fetch?: FetchFn;
  cache?: FeedCache;
  limiter?: Limiter;
  sources?: Source[];
  // ISO day the chart starts at: pages are fetched until one row at or before it is in hand. Omitted: all pages
  from?: string;
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
}

export interface FeedResult {
  ticker: string;
  meta: FeedMeta;
  rawMeta: Record<string, unknown>;
  history: RawTable;
  distributions?: RawTable;
  source: string; // base URL of meta.json that answered
  pagesFetched: number[]; // 1-based page numbers, in the order they were merged
  stale: boolean; // meta came from the cache because every source failed
  warnings: string[];
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);

export function readMeta(raw: Record<string, unknown>): FeedMeta {
  const h = isObj(raw.history) ? raw.history : {};
  const nav = isObj(raw.nav) ? raw.nav : {};
  const pages = Array.isArray(h.pages) ? h.pages.filter((p): p is string => typeof p === 'string') : [];
  const asOfText = str(h.asOf) || str(h.asOfDate) || str(raw.asOfDate) || str(nav.asOfDate);
  return {
    asOf: asOfText ? parseDate(asOfText) : null,
    totalRows: typeof h.totalRows === 'number' ? h.totalRows : 0,
    pages,
    pageSize: typeof h.pageSize === 'number' && h.pageSize > 0 ? h.pageSize : 1000,
  };
}

function readTable(v: unknown): RawTable | undefined {
  if (!isObj(v) || !Array.isArray(v.rows)) return undefined;
  const headers = Array.isArray(v.headers) ? v.headers.filter((x): x is string => typeof x === 'string') : undefined;
  return { headers, rows: v.rows as RawRow[] };
}

// A plain Error with the status (no Error subclass: instanceof breaks on it when compiled to ES5)
const httpError = (status: number, url: string): Error & { status: number } =>
  Object.assign(new Error(`HTTP ${status} ${url}`), { status });
const statusOf = (err: unknown): number | undefined =>
  err instanceof Error && typeof (err as Error & { status?: unknown }).status === 'number' ? (err as Error & { status: number }).status : undefined;

const sleep = (ms: number) => new Promise<void>((r) => { setTimeout(r, ms); });

// One URL: timeout per attempt, retries on network errors, timeouts, 429 and 5xx; 404 and other 4xx give up
async function getJson(url: string, o: Required<Pick<FetchFeedOptions, 'fetch' | 'limiter' | 'timeoutMs' | 'retries' | 'retryDelayMs'>>): Promise<unknown> {
  let last: unknown;
  for (let attempt = 0; attempt <= o.retries; attempt++) {
    if (attempt) await sleep(o.retryDelayMs * attempt);
    try {
      return await o.limiter(async () => {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), o.timeoutMs);
        try {
          const res = await o.fetch(url, { mode: 'cors', credentials: 'omit', signal: ctrl.signal });
          if (!res.ok) throw httpError(res.status, url);
          return (await res.json()) as unknown;
        } finally {
          clearTimeout(timer);
        }
      });
    } catch (err) {
      last = err;
      const status = statusOf(err);
      if (status !== undefined && status !== 429 && status < 500) break;
    }
  }
  throw last instanceof Error ? last : new Error(String(last));
}

// Rows of a page sorted the way the page is: first and last parsable dates
function pageSpan(page: RawTable): { first: string; last: string } | null {
  const dates = page.rows.map((r) => {
    const rec = toRecord(r, page.headers);
    const key = Object.keys(rec).filter((k) => /date/i.test(k))[0];
    return key ? dateOf(rec[key] as Cell) : null;
  }).filter((d): d is string => d !== null);
  return dates.length ? { first: dates[0]!, last: dates[dates.length - 1]! } : null;
}

export async function fetchFeed(ticker: string, spec: FeedSpec, options: FetchFeedOptions = {}): Promise<FeedResult> {
  const o = {
    // bound: window.fetch called as a method of another object throws "Illegal invocation" in browsers
    fetch: options.fetch || (((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init)) as unknown as FetchFn),
    limiter: options.limiter || sharedLimiter,
    timeoutMs: options.timeoutMs === undefined ? 15000 : options.timeoutMs,
    retries: options.retries === undefined ? 2 : options.retries,
    retryDelayMs: options.retryDelayMs === undefined ? 500 : options.retryDelayMs,
  };
  const sources = options.sources || SOURCES;
  const cache = options.cache;
  const warnings: string[] = [];
  const base = `api/${spec.slug}/funds/${ticker}/`;
  const canonical = (path: string) => SOURCES[0]!(spec.brand, base + path);

  // meta.json: first source that answers; it is never served from the cache unless every source failed
  let rawMeta: Record<string, unknown> | null = null;
  let srcIndex = -1;
  const errors: string[] = [];
  for (let i = 0; i < sources.length && !rawMeta; i++) {
    try {
      const v = await getJson(sources[i]!(spec.brand, base + 'meta.json'), o);
      if (!isObj(v)) throw new Error('meta.json is not an object');
      rawMeta = v;
      srcIndex = i;
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }
  let stale = false;
  const metaKey = `meta|${canonical('meta.json')}`;
  if (!rawMeta) {
    const cached = cache ? await cache.get(metaKey) : undefined;
    if (!isObj(cached)) throw new Error(`${ticker}: no source answered: ${errors.join('; ')}`);
    rawMeta = cached;
    stale = true;
    warnings.push(`${ticker}: every source failed, using the cached meta.json (${errors.join('; ')})`);
  } else if (cache) {
    await cache.set(metaKey, rawMeta);
  }
  if (srcIndex > 0) warnings.push(`${ticker}: served by ${sources[srcIndex]!(spec.brand, '')} (${errors.join('; ')})`);
  const meta = readMeta(rawMeta);
  // pages: the source that served meta first, then the rest of the chain
  const order = srcIndex >= 0 ? [srcIndex].concat(sources.map((_, i) => i).filter((i) => i !== srcIndex)) : sources.map((_, i) => i);

  const pages = new Map<number, RawTable>();
  const loadPage = async (n: number): Promise<RawTable> => {
    const done = pages.get(n);
    if (done) return done;
    const rel = meta.pages[n - 1]!.replace(/^\.\//, '');
    const key = `${canonical(rel)}|${meta.asOf || ''}|${meta.totalRows}`;
    const hit = cache ? await cache.get(key) : undefined;
    let v: unknown = hit;
    if (hit === undefined) {
      const errs: string[] = [];
      for (let k = 0; k < order.length && v === undefined; k++) {
        try { v = await getJson(sources[order[k]!]!(spec.brand, base + rel), o); } catch (err) { errs.push(err instanceof Error ? err.message : String(err)); }
      }
      if (v === undefined) throw new Error(`${ticker} page ${n}: ${errs.join('; ')}`);
      if (cache) await cache.set(key, v);
    }
    const table = readTable(v);
    if (!table) throw new Error(`${ticker} page ${n}: no rows`);
    pages.set(n, table);
    return table;
  };
  const loadAll = (ns: number[]) => Promise.all(ns.map(loadPage));

  const count = meta.pages.length;
  const all = Array.from({ length: count }, (_, i) => i + 1);
  let wanted: number[] = all;
  if (options.from && count > 1) {
    // page 1 tells the order: SPDR and VanEck are newest first, the Yahoo feeds and Vanguard oldest first
    const span = pageSpan(await loadPage(1));
    const descending = !!span && span.first > span.last;
    const newest = descending ? all : all.slice().reverse();
    const newestDate = descending && span ? span.first : meta.asOf || (span ? span.last : options.from);
    // about 252 trading days a year (VanEck also lists weekends: the walk below covers the rest)
    const rows = Math.ceil(Math.max(0, daysBetween(options.from, newestDate)) * 252 / 365) + 5;
    const lastPageRows = meta.totalRows ? meta.totalRows - (count - 1) * meta.pageSize : meta.pageSize;
    const estimate = descending ? Math.ceil(rows / meta.pageSize) : 1 + Math.max(0, Math.ceil((rows - lastPageRows) / meta.pageSize));
    let take = Math.min(count, Math.max(1, estimate));
    await loadAll(newest.slice(0, take));
    const oldestOf = (n: number) => { const s = pageSpan(pages.get(n)!); return s ? (s.first < s.last ? s.first : s.last) : null; };
    // walk on, one page at a time, until a row at or before `from` is in hand
    while (take < count) {
      const o2 = oldestOf(newest[take - 1]!);
      if (o2 !== null && o2 <= options.from) break;
      await loadPage(newest[take]!);
      take++;
    }
    wanted = newest.slice(0, take).sort((a, b) => a - b);
  } else {
    await loadAll(all);
  }

  const first = pages.get(wanted[0]!);
  const history: RawTable = { headers: first ? first.headers : undefined, rows: [] };
  wanted.forEach((n) => { history.rows = history.rows.concat(pages.get(n)!.rows); });
  return {
    ticker,
    meta,
    rawMeta,
    history,
    distributions: readTable(rawMeta.distributions),
    source: srcIndex >= 0 ? sources[srcIndex]!(spec.brand, base) : '',
    pagesFetched: Array.from(pages.keys()).sort((a, b) => a - b),
    stale,
    warnings,
  };
}

export interface Benchmark extends AdaptResult {
  ticker: string;
  meta: FeedMeta;
  stale: boolean;
}

// fetchFeed + the adapter of config/benchmarks.json; points before the last day at or before `from` are dropped,
// so the series starts at `from` with a value, and tr is rescaled to start at that first close again
export async function loadBenchmark(ticker: string, spec: FeedSpec, options: FetchFeedOptions = {}): Promise<Benchmark> {
  const feed = await fetchFeed(ticker, spec, options);
  const r = adapterFor(spec.adapter)({ ticker, history: feed.history, distributions: feed.distributions });
  let points = r.points;
  const from = options.from;
  if (from) {
    const before = points.filter((p) => p.date <= from);
    const start = before.length ? before[before.length - 1]!.date : from;
    points = points.filter((p) => p.date >= start);
    const k = points.length ? points[0]!.close / points[0]!.tr : 1;
    if (k !== 1) points = points.map((p) => { const q = { ...p }; q.tr = p.tr * k; return q; });
  }
  return { ticker, meta: feed.meta, stale: feed.stale, points, warnings: feed.warnings.concat(r.warnings) };
}

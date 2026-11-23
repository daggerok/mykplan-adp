/// <reference types="bun" />
/// <reference types="node" />
/// <reference lib="esnext" />
import { describe, expect, test } from 'bun:test';
import { fixtureExists, readJson } from '../../tests/fixtures/benchmarks/load';
import { createLimiter, fetchFeed, loadBenchmark, MemoryCache, readMeta } from './fetchFeed';
import type { FeedSpec } from './fetchFeed';

const SPEC: Record<string, FeedSpec> = {
  SPY: { brand: 'SPDR', slug: 'spdr', adapter: 'navDist' },
  SMH: { brand: 'VanEck', slug: 'vaneck', adapter: 'navDist' },
  QQQ: { brand: 'Invesco', slug: 'invesco', adapter: 'yahoo' },
  VTV: { brand: 'Vanguard', slug: 'vanguard', adapter: 'vanguard' },
  SCHD: { brand: 'Schwab', slug: 'schwab', adapter: 'yahoo' },
};

interface Mock {
  fetch: typeof fetch;
  calls: string[];
  inits: RequestInit[];
  maxInFlight: () => number;
}

// Offline fetch: serves tests/fixtures/benchmarks/<T>/<path> for any source URL. `fail(url, nth)` returns a
// status to answer with, 'hang' to never answer (until aborted), or undefined to serve the file
function mock(fail: (url: string, nth: number) => number | 'hang' | undefined = () => undefined, delayMs = 0): Mock {
  const calls: string[] = [];
  const inits: RequestInit[] = [];
  let inFlight = 0;
  let max = 0;
  const fn = (input: string, init: RequestInit): Promise<Response> => {
    calls.push(input);
    inits.push(init);
    const nth = calls.filter((c) => c === input).length;
    inFlight++;
    max = Math.max(max, inFlight);
    return new Promise<Response>((resolve, reject) => {
      const done = (r: Response) => { inFlight--; resolve(r); };
      const f = fail(input, nth);
      if (f === 'hang') {
        init.signal!.addEventListener('abort', () => { inFlight--; reject(new Error('aborted')); });
        return;
      }
      setTimeout(() => {
        if (typeof f === 'number') return done(new Response('nope', { status: f }));
        const m = input.match(/\/api\/[^/]+\/funds\/([^/]+)\/(.+)$/);
        const rel = m ? `${m[1]}/${m[2]}` : '';
        done(rel && fixtureExists(rel) ? new Response(JSON.stringify(readJson(rel))) : new Response('404', { status: 404 }));
      }, delayMs);
    });
  };
  return { fetch: fn as unknown as typeof fetch, calls, inits, maxInFlight: () => max };
}

const fast = { retryDelayMs: 0, timeoutMs: 1000 };
const pagesOf = (calls: string[]) => calls.map((c) => (c.match(/history\/(\d+)\.json$/) || [])[1]).filter(Boolean).map(Number);

describe('readMeta', () => {
  test('asOf from history.asOf, history.asOfDate, top-level asOfDate or nav.asOfDate', () => {
    expect(readMeta(readJson('SPY/meta.json'))).toEqual({
      asOf: '2026-09-25', totalRows: 12, pageSize: 5, pages: ['./history/001.json', './history/002.json', './history/003.json'],
    });
    expect(readMeta(readJson('SMH/meta.json')).asOf).toBe('2025-12-31');
    expect(readMeta(readJson('QQQ/meta.json')).asOf).toBe('2026-09-30');
    expect(readMeta(readJson('VTV/meta.json')).asOf).toBe('2026-10-06');
    expect(readMeta({})).toEqual({ asOf: null, totalRows: 0, pages: [], pageSize: 1000 });
  });
});

describe('fetchFeed', () => {
  test('all pages from daggerok.github.io, cors without credentials', async () => {
    const m = mock();
    const f = await fetchFeed('SPY', SPEC.SPY!, { ...fast, fetch: m.fetch });
    expect(m.calls[0]).toBe('https://daggerok.github.io/SPDR/api/spdr/funds/SPY/meta.json');
    expect(m.calls.slice(1).sort()).toEqual([1, 2, 3].map((n) => `https://daggerok.github.io/SPDR/api/spdr/funds/SPY/history/00${n}.json`));
    m.inits.forEach((i) => {
      expect(i.mode).toBe('cors');
      expect(i.credentials).toBe('omit');
      expect(i.signal).toBeDefined();
    });
    expect(f.history.rows.length).toBe(12);
    expect(f.history.headers).toEqual(['Date', 'NAV', 'Shares Outstanding', 'Total Net Assets']);
    expect(f.distributions!.rows.length).toBe(3);
    expect(f.pagesFetched).toEqual([1, 2, 3]);
    expect(f.source).toBe('https://daggerok.github.io/SPDR/api/spdr/funds/SPY/');
    expect(f.stale).toBe(false);
    expect(f.warnings).toEqual([]);
  });

  test('newest-first feed with `from`: only the newest pages (SPY, page 3 never asked)', async () => {
    const m = mock();
    const f = await fetchFeed('SPY', SPEC.SPY!, { ...fast, fetch: m.fetch, from: '2026-09-24' });
    expect(pagesOf(m.calls).sort()).toEqual([1, 2]);
    expect(f.history.rows.length).toBe(10);
  });

  test('oldest-first feed with `from`: page 1 tells the order, then the last pages (QQQ)', async () => {
    const m = mock();
    const f = await fetchFeed('QQQ', SPEC.QQQ!, { ...fast, fetch: m.fetch, from: '2026-09-29' });
    expect(pagesOf(m.calls)).toEqual([1, 3, 2]);
    expect(f.history.rows.length).toBe(8); // pages 2 and 3, page 1 only probed
  });

  test('walks on page by page when the estimate falls short', async () => {
    // synthetic newest-first feed: 60 calendar days (weekends too, like VanEck), 10 rows a page
    const days = Array.from({ length: 60 }, (_, i) => new Date(Date.UTC(2026, 10, 20 - i)).toISOString().slice(0, 10));
    const pages = [0, 1, 2, 3, 4, 5].map((p) => ({ headers: ['Date', 'NAV'], rows: days.slice(p * 10, p * 10 + 10).map((d) => ({ Date: d, NAV: '1' })) }));
    const calls: string[] = [];
    const fn = (url: string) => {
      calls.push(url);
      const n = url.match(/history\/(\d+)\.json$/);
      const body = n ? pages[Number(n[1]) - 1] : { history: { totalRows: 60, pageSize: 10, pages: [1, 2, 3, 4, 5, 6].map((i) => `history/00${i}.json`) } };
      return Promise.resolve(new Response(JSON.stringify(body)));
    };
    const from = days[42]!; // 42 calendar days back: ~34 trading days estimated -> 4 pages, then pages 5
    const f = await fetchFeed('SYN', SPEC.SMH!, { ...fast, fetch: fn as unknown as typeof fetch, from });
    expect(pagesOf(calls)).toEqual([1, 2, 3, 4, 5]);
    expect(f.history.rows.length).toBe(50);
  });

  test('404 on daggerok.github.io -> raw.githubusercontent.com serves meta and pages', async () => {
    const m = mock((url) => (url.indexOf('daggerok.github.io') >= 0 ? 404 : undefined));
    const f = await fetchFeed('VTV', SPEC.VTV!, { ...fast, fetch: m.fetch });
    expect(m.calls[0]).toBe('https://daggerok.github.io/Vanguard/api/vanguard/funds/VTV/meta.json');
    expect(m.calls[1]).toBe('https://raw.githubusercontent.com/daggerok/Vanguard/main/api/vanguard/funds/VTV/meta.json');
    expect(m.calls.length).toBe(5); // 404 is not retried; pages go straight to raw
    expect(m.calls.slice(2).every((c) => c.indexOf('raw.githubusercontent.com') >= 0)).toBe(true);
    expect(f.history.rows.length).toBe(11);
    expect(f.warnings[0]).toContain('served by https://raw.githubusercontent.com/daggerok/Vanguard/main/');
  });

  test('5xx is retried twice, then the next source (jsDelivr last)', async () => {
    const m = mock((url, nth) => (url.indexOf('jsdelivr') >= 0 ? undefined : url.indexOf('github.io') >= 0 && nth <= 2 && url.indexOf('history') >= 0 ? 503 : url.indexOf('raw.') >= 0 ? 500 : undefined));
    const f = await fetchFeed('SCHD', SPEC.SCHD!, { ...fast, fetch: m.fetch });
    // meta from github.io at once; page 1 503, 503, then 200 on the third try
    expect(m.calls.filter((c) => c.endsWith('history/001.json'))).toEqual(Array.from({ length: 3 }, () => 'https://daggerok.github.io/Schwab/api/schwab/funds/SCHD/history/001.json'));
    expect(f.history.rows.length).toBe(10);

    const all500 = mock((url) => (url.indexOf('jsdelivr') >= 0 ? undefined : 500));
    const g = await fetchFeed('SCHD', SPEC.SCHD!, { ...fast, fetch: all500.fetch });
    expect(all500.calls.slice(0, 7)).toEqual([
      ...Array.from({ length: 3 }, () => 'https://daggerok.github.io/Schwab/api/schwab/funds/SCHD/meta.json'),
      ...Array.from({ length: 3 }, () => 'https://raw.githubusercontent.com/daggerok/Schwab/main/api/schwab/funds/SCHD/meta.json'),
      'https://cdn.jsdelivr.net/gh/daggerok/Schwab@main/api/schwab/funds/SCHD/meta.json',
    ]);
    expect(g.source).toBe('https://cdn.jsdelivr.net/gh/daggerok/Schwab@main/api/schwab/funds/SCHD/');
  });

  test('a hanging request is aborted by the timeout and the chain moves on', async () => {
    const m = mock((url) => (url.indexOf('github.io') >= 0 ? 'hang' : undefined));
    const f = await fetchFeed('SCHD', SPEC.SCHD!, { fetch: m.fetch, timeoutMs: 20, retries: 0, retryDelayMs: 0 });
    expect(m.calls[1]).toContain('raw.githubusercontent.com');
    expect(f.history.rows.length).toBe(10);
  });

  test('every source down: the error names them all', async () => {
    const m = mock(() => 404);
    await expect(fetchFeed('SPY', SPEC.SPY!, { ...fast, fetch: m.fetch })).rejects.toThrow(/SPY: no source answered: HTTP 404 https:\/\/daggerok\.github\.io/);
    expect(m.calls.length).toBe(3);
  });

  test('at most 4 requests in flight with a shared limiter over several feeds', async () => {
    const m = mock(undefined, 5);
    const limiter = createLimiter(4);
    const feeds = await Promise.all(['SPY', 'SMH', 'QQQ', 'VTV', 'SCHD'].map((t) => fetchFeed(t, SPEC[t]!, { ...fast, fetch: m.fetch, limiter })));
    expect(feeds.map((f) => f.history.rows.length)).toEqual([12, 17, 13, 11, 10]);
    expect(m.maxInFlight()).toBe(4);
  });
});

describe('cache', () => {
  test('pages come from the cache while asOf and totalRows stay; meta is always asked', async () => {
    const cache = new MemoryCache();
    const m = mock();
    await fetchFeed('QQQ', SPEC.QQQ!, { ...fast, fetch: m.fetch, cache });
    expect(m.calls.length).toBe(4);
    expect(cache.get('https://daggerok.github.io/Invesco/api/invesco/funds/QQQ/history/001.json|2026-09-30|13')).toBeDefined();
    const again = await fetchFeed('QQQ', SPEC.QQQ!, { ...fast, fetch: m.fetch, cache });
    expect(m.calls.length).toBe(5);
    expect(again.history.rows.length).toBe(13);
  });

  test('a new asOf in meta.json misses the cache', async () => {
    const cache = new MemoryCache();
    let asOf = 'Sep 30 2026';
    const calls: string[] = [];
    const fn = (url: string) => {
      calls.push(url);
      const m = url.match(/funds\/QQQ\/(.+)$/)!;
      const body = readJson(`QQQ/${m[1]}`);
      if (m[1] === 'meta.json') (body.history as Record<string, unknown>).asOf = asOf;
      return Promise.resolve(new Response(JSON.stringify(body)));
    };
    const f = fn as unknown as typeof fetch;
    await fetchFeed('QQQ', SPEC.QQQ!, { ...fast, fetch: f, cache });
    asOf = 'Oct 01 2026';
    await fetchFeed('QQQ', SPEC.QQQ!, { ...fast, fetch: f, cache });
    expect(calls.length).toBe(8);
  });

  test('every source down: the cached meta.json and pages are served as stale', async () => {
    const cache = new MemoryCache();
    await fetchFeed('SCHD', SPEC.SCHD!, { ...fast, fetch: mock().fetch, cache });
    const down = mock(() => 503);
    const f = await fetchFeed('SCHD', SPEC.SCHD!, { ...fast, fetch: down.fetch, cache });
    expect(f.stale).toBe(true);
    expect(f.history.rows.length).toBe(10);
    expect(f.warnings[0]).toContain('every source failed, using the cached meta.json');
    expect(down.calls.length).toBe(9); // 3 sources x 3 tries, pages from the cache
  });
});

describe('loadBenchmark', () => {
  test('SPY from 2026-09-21: navDist points from that day, tr rebased to its close', async () => {
    const b = await loadBenchmark('SPY', SPEC.SPY!, { ...fast, fetch: mock().fetch, from: '2026-09-20' });
    expect(b.points.map((p) => p.date)).toEqual(['2026-09-18', '2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25']);
    expect(b.points[0]!.tr).toBe(b.points[0]!.close);
    expect(b.points[5]!.tr / b.points[0]!.tr).toBeCloseTo(771.353332 / 762.011402, 12);
    expect(b.meta.asOf).toBe('2026-09-25');
    expect(b.warnings).toEqual([]);
  });

  test('QQQ with every page: yahoo points, ascending', async () => {
    const b = await loadBenchmark('QQQ', SPEC.QQQ!, { ...fast, fetch: mock().fetch });
    expect(b.points.length).toBe(13);
    expect(b.points[0]!.tr).toBe(709.179993);
  });
});

test('the default fetch is called unbound-safe (browsers throw "Illegal invocation" otherwise)', async () => {
  const real = globalThis.fetch;
  const seen: string[] = [];
  // a fetch that, like the browser one, refuses a foreign `this`
  const strict = function (this: unknown, input: RequestInfo | URL) {
    if (this !== undefined && this !== globalThis) throw new TypeError("Failed to execute 'fetch' on 'Window': Illegal invocation");
    seen.push(String(input));
    return Promise.resolve(new Response('{}', { status: 404 }));
  };
  globalThis.fetch = strict as unknown as typeof fetch;
  try {
    await fetchFeed('SPY', { brand: 'SPDR', slug: 'spdr', adapter: 'navDist' }, { retries: 0 }).catch(() => undefined);
    expect(seen.length).toBeGreaterThan(0);
  } finally {
    globalThis.fetch = real;
  }
});

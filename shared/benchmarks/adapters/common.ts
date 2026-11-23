/// <reference lib="esnext" />
// Shared core of the benchmark adapters: rows -> sorted, de-duplicated points with a total-return index
import { parseDate } from '../../dates';
import { parseDecimal } from '../../money';
import type { AdaptResult, BenchPoint, Cell, FeedInput, RawRow, RawTable } from '../types';

// Columns an adapter reads (header names as in the feed). tr comes from adj (Adj Close scaled to the first
// close) when adj is set, otherwise from the distributions reinvested on their ex-dates
export interface Columns {
  date: string;
  close: string;
  open?: string;
  high?: string;
  low?: string;
  adj?: string;
  nav?: string;
}

export function toRecord(row: RawRow, headers: string[] | undefined): Record<string, Cell> {
  if (!Array.isArray(row)) return row;
  const out: Record<string, Cell> = {};
  (headers || []).forEach((h, i) => { out[h] = row[i]; });
  return out;
}

export function headersOf(table: RawTable): string[] {
  if (table.headers && table.headers.length) return table.headers;
  const first = table.rows[0];
  return first && !Array.isArray(first) ? Object.keys(first) : [];
}

// A number from a feed cell: numbers as is, text through parseDecimal ("1,234.5", "$1.1047"); "-", "—", "" -> null
export function num(cell: Cell): number | null {
  if (typeof cell === 'number') return isFinite(cell) ? cell : null;
  if (typeof cell !== 'string') return null;
  const n = parseDecimal(cell);
  return n === null || !isFinite(n) ? null : n;
}

export const dateOf = (cell: Cell): string | null => (cell === null || cell === undefined ? null : parseDate(String(cell)));

// First header matching any pattern, in pattern order (the earlier pattern wins)
export function findHeader(headers: string[], patterns: RegExp[]): string | undefined {
  for (let p = 0; p < patterns.length; p++) {
    const hit = headers.filter((h) => patterns[p]!.test(h.trim()))[0];
    if (hit !== undefined) return hit;
  }
  return undefined;
}

// Distributions -> ISO ex-date -> total per share (dividend + short and long term capital gains)
export function readDistributions(table: RawTable | undefined, ticker: string, warnings: string[]): Map<string, number> {
  const out = new Map<string, number>();
  if (!table || !table.rows.length) return out;
  const headers = headersOf(table);
  const dateCol = findHeader(headers, [/^ex[-\s]?date$/i, /ex.?date/i, /date/i]);
  const amountCols = headers.filter((h) => h !== dateCol && /dividend|amount|cap(ital)?\.? ?gain|distribution|income/i.test(h));
  if (!dateCol || !amountCols.length) {
    warnings.push(`${ticker} distributions: no ex-date or amount column in [${headers.join(', ')}]`);
    return out;
  }
  table.rows.forEach((raw, i) => {
    const row = toRecord(raw, table.headers);
    const date = dateOf(row[dateCol]);
    const values = amountCols.map((c) => num(row[c])).filter((v): v is number => v !== null);
    const total = values.length ? values.reduce((a, b) => a + b, 0) : null;
    if (!date || total === null) {
      warnings.push(`${ticker} distribution row ${i + 1} skipped: ${JSON.stringify(raw)}`);
      return;
    }
    out.set(date, (out.get(date) || 0) + total);
  });
  return out;
}

interface Parsed {
  date: string;
  close: number;
  open?: number;
  high?: number;
  low?: number;
  adj?: number;
  nav?: number;
}

// Rows -> parsed days, ascending, one per date (a later row of the same date replaces the earlier one)
function parseRows(input: FeedInput, cols: Columns, warnings: string[]): Parsed[] {
  const byDate = new Map<string, Parsed>();
  const { ticker, history } = input;
  history.rows.forEach((raw, i) => {
    const row = toRecord(raw, history.headers);
    const date = dateOf(row[cols.date]);
    const close = num(row[cols.close]);
    const adj = cols.adj ? num(row[cols.adj]) : null;
    const why = !date ? `bad date ${JSON.stringify(row[cols.date])}` : close === null || close <= 0 ? `no ${cols.close}`
      : cols.adj && (adj === null || adj <= 0) ? `no ${cols.adj}` : '';
    if (why) {
      warnings.push(`${ticker} row ${i + 1}${date ? ` ${date}` : ''} skipped: ${why}`);
      return;
    }
    const p: Parsed = { date: date!, close: close! };
    if (adj !== null) p.adj = adj;
    (['open', 'high', 'low', 'nav'] as const).forEach((k) => {
      const col = cols[k];
      const v = col ? num(row[col]) : null;
      if (v !== null) p[k] = v;
    });
    if (byDate.has(p.date)) byDate.delete(p.date); // keep the last, in its own place for the sort below
    byDate.set(p.date, p);
  });
  const out = Array.from(byDate.values());
  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return out;
}

function point(ticker: string, p: Parsed, tr: number): BenchPoint {
  const out: BenchPoint = { ticker, date: p.date, close: p.close, tr };
  if (p.open !== undefined) out.open = p.open;
  if (p.high !== undefined) out.high = p.high;
  if (p.low !== undefined) out.low = p.low;
  if (p.nav !== undefined) out.nav = p.nav;
  return out;
}

// Adj Close scaled so tr starts at the first close: tr_t = close_0 * adj_t / adj_0 (exactly close_0 on day 0)
export function adjSeries(input: FeedInput, cols: Columns & { adj: string }): AdaptResult {
  const warnings: string[] = [];
  const days = parseRows(input, cols, warnings);
  if (!days.length) return { points: [], warnings };
  const close0 = days[0]!.close;
  const adj0 = days[0]!.adj!;
  return { points: days.map((p) => point(input.ticker, p, close0 * (p.adj! / adj0))), warnings };
}

// Price + distributions: each distribution is reinvested at the close of its ex-date (or of the first trading
// day after it, when the ex-date has no row): tr_t = tr_{t-1} * (close_t + dist_t) / close_{t-1}.
// Distributions before the first day or after the last one do not touch the series
export function distSeries(input: FeedInput, cols: Columns): AdaptResult {
  const warnings: string[] = [];
  const days = parseRows(input, cols, warnings);
  const dist = readDistributions(input.distributions, input.ticker, warnings);
  const exDates = Array.from(dist.keys()).sort();
  const points: BenchPoint[] = [];
  let tr = 0;
  let e = 0;
  days.forEach((p, i) => {
    let paid = 0;
    if (i === 0) {
      while (e < exDates.length && exDates[e]! <= p.date) e++; // paid before the series starts
      tr = p.close;
    } else {
      while (e < exDates.length && exDates[e]! <= p.date) paid += dist.get(exDates[e++]!)!;
      tr = tr * (p.close + paid) / days[i - 1]!.close;
    }
    points.push(point(input.ticker, p, tr));
  });
  return { points, warnings };
}

export function missing(ticker: string, what: string, headers: string[]): AdaptResult {
  return { points: [], warnings: [`${ticker}: no ${what} column in [${headers.join(', ')}]`] };
}

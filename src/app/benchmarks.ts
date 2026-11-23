/// <reference lib="esnext" />
// Benchmark series for the chart: total return rebased to the portfolio value on the first shown day
import { FEEDS } from '../../shared/benchmarks/config';
import { MemoryCache, loadBenchmark } from '../../shared/benchmarks/fetchFeed';

const cache = new MemoryCache();
const feeds = FEEDS;
export const BENCH_COLORS: Record<string, string> = { SPY: '#f59e0b', QQQ: '#8b5cf6', SMH: '#ec4899', SOXQ: '#14b8a6', VTV: '#64748b', RSP: '#84cc16', DIVO: '#f97316', SCHD: '#0ea5e9' };

export async function benchmarkLine(ticker: string, from: string, startValue: number): Promise<{ asOf: string | null; data: Array<{ date: string; value: number }> }> {
  const spec = feeds[ticker];
  if (!spec) throw new Error(`no feed for ${ticker}`);
  const b = await loadBenchmark(ticker, spec, { from, cache });
  const first = b.points[0];
  if (!first) return { asOf: b.meta.asOf, data: [] };
  return { asOf: b.meta.asOf, data: b.points.map((p) => ({ date: p.date, value: (startValue * p.tr) / first.tr })) };
}

// the raw total-return index from a few days before `from` (the close before the first day is needed for its return)
export async function benchmarkTr(ticker: string, from: string): Promise<{ asOf: string | null; points: Array<{ date: string; tr: number }> }> {
  const spec = feeds[ticker];
  if (!spec) throw new Error(`no feed for ${ticker}`);
  const d = new Date(`${from}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 10);
  const b = await loadBenchmark(ticker, spec, { from: d.toISOString().slice(0, 10), cache });
  return { asOf: b.meta.asOf, points: b.points.map((p) => ({ date: p.date, tr: p.tr })) };
}

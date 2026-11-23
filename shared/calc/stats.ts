/// <reference lib="esnext" />
// Small statistics shared by the calculation modules (the plan sections 6 and 7). Returns are fractions (0.05 = 5 %),
// money is integer cents in and out: roundCents is the single place a float becomes cents again
import { daysBetween } from '../dates';

export const roundCents = (x: number): number => Math.round(x);

export function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

// Sample standard deviation (n - 1); 0 for fewer than two values
export function stdev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  let s = 0;
  for (const x of xs) s += (x - m) * (x - m);
  return Math.sqrt(s / (xs.length - 1));
}

// Compound annual growth rate between two values over calendar days; null when it cannot be computed
export function cagr(begin: number, end: number, days: number): number | null {
  if (begin <= 0 || end < 0 || days <= 0) return null;
  return Math.pow(end / begin, 365 / days) - 1;
}

// CAGR of a dated series (first and last point)
export function seriesCagr(points: Array<{ date: string; value: number }>): number | null {
  if (points.length < 2) return null;
  const a = points[0]!;
  const b = points[points.length - 1]!;
  return cagr(a.value, b.value, daysBetween(a.date, b.date));
}

// Annualized volatility of daily returns: sample stdev x sqrt(252 trading days)
export const annualizedVolatility = (dailyReturns: number[]): number => stdev(dailyReturns) * Math.sqrt(252);

// Percentile with linear interpolation between closest ranks (p in 0..100), like Excel PERCENTILE.INC
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return NaN;
  const s = values.slice().sort((a, b) => a - b);
  const pos = (Math.min(100, Math.max(0, p)) / 100) * (s.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo]! + (s[hi]! - s[lo]!) * (pos - lo);
}

export type Rng = () => number;

// n draws with replacement from values (bootstrap); rng returns [0, 1)
export function bootstrap<T>(values: T[], n: number, rng: Rng): T[] {
  const out: T[] = [];
  if (values.length === 0) return out;
  for (let i = 0; i < n; i++) out.push(values[Math.floor(rng() * values.length)]!);
  return out;
}

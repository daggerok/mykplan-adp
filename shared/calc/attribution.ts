/// <reference lib="esnext" />
// Attribution (the plan section 6): a fund's contribution to the result is the sum of its market value change (MVC);
// a rebalance is judged against the counterfactual "the money stayed in the source fund", priced with the daily
// prices of both funds
import { DailyFund } from './twr';

export interface FundContribution {
  fund: string;
  mvc: number; // cents
  share: number; // of the total MVC; 0 when the total is 0
}

export interface PricePoint {
  date: string;
  price: number;
}

export interface RebalanceLike {
  date: string;
  fromFund: string;
  toFund: string;
  amount: number; // cents moved
}

export interface RebalanceOutcome {
  asOf: string;
  unitsKept: number; // units of the source fund the money would have stayed as
  unitsBought: number; // units of the target fund actually bought
  actual: number; // cents: value of the bought units at asOf
  counterfactual: number; // cents: value of the kept units at asOf
  difference: number; // actual - counterfactual: > 0 means the rebalance helped
}

// Sum of MVC per fund over [from, to] (inclusive, both optional), largest first
export function fundContributions(rows: DailyFund[], from?: string, to?: string): FundContribution[] {
  const sums: Record<string, number> = {};
  let total = 0;
  for (const r of rows) {
    if ((from && r.date < from) || (to && r.date > to)) continue;
    sums[r.fund] = (sums[r.fund] || 0) + r.mvc;
    total += r.mvc;
  }
  return Object.keys(sums)
    .map((fund) => ({ fund, mvc: sums[fund]!, share: total === 0 ? 0 : sums[fund]! / total }))
    .sort((a, b) => b.mvc - a.mvc || (a.fund < b.fund ? -1 : 1));
}

// Daily close price per fund from the daily rows, sorted by date
export function pricesByFund(rows: DailyFund[]): Record<string, PricePoint[]> {
  const out: Record<string, PricePoint[]> = {};
  for (const r of rows) (out[r.fund] = out[r.fund] || []).push({ date: r.date, price: r.endPrice });
  Object.keys(out).forEach((k) => out[k]!.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)));
  return out;
}

// Last price on or before the date (binary search over a sorted series), null before the first price
export function priceOn(series: PricePoint[], date: string): number | null {
  let lo = 0, hi = series.length - 1, found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (series[mid]!.date <= date) { found = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return found < 0 ? null : series[found]!.price;
}

// Value of the rebalance at asOf against the value had the money stayed in the source fund; null without prices
export function rebalanceCounterfactual(r: RebalanceLike, prices: Record<string, PricePoint[]>, asOf: string): RebalanceOutcome | null {
  const src = prices[r.fromFund];
  const dst = prices[r.toFund];
  if (!src || !dst) return null;
  const p0Src = priceOn(src, r.date), p0Dst = priceOn(dst, r.date);
  const p1Src = priceOn(src, asOf), p1Dst = priceOn(dst, asOf);
  if (!p0Src || !p0Dst || p1Src === null || p1Dst === null) return null;
  const dollars = r.amount / 100;
  const unitsKept = dollars / p0Src;
  const unitsBought = dollars / p0Dst;
  const actual = Math.round(unitsBought * p1Dst * 100);
  const counterfactual = Math.round(unitsKept * p1Src * 100);
  return { asOf, unitsKept, unitsBought, actual, counterfactual, difference: actual - counterfactual };
}

// The same comparison for every date the target fund has a price from the rebalance on (for a chart)
export function rebalanceCounterfactualSeries(r: RebalanceLike, prices: Record<string, PricePoint[]>): RebalanceOutcome[] {
  const dst = prices[r.toFund] || [];
  const out: RebalanceOutcome[] = [];
  for (const p of dst) {
    if (p.date < r.date) continue;
    const o = rebalanceCounterfactual(r, prices, p.date);
    if (o) out.push(o);
  }
  return out;
}

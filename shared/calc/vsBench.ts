/// <reference lib="esnext" />
// "My fund picks against one index" (owner 2026-11-22: "like if I would pick only S&P500"), three views:
// 1. periodVsBench: the portfolio's time-weighted return per candle against the index over the very same days
// 2. allInBench: the same contributions on the same days, all bought into the index: value in dollars
// 3. fundsVsBench: every fund held, its own return over its own days against the index over those days
// The index is a total-return series (distributions reinvested). A day's index return is close(day) / close of the
// last trading day before it, so weekends, holidays and days missing in the account data line up the same way
import { addDays, periodKey, type Timeframe } from '../dates';
import { fundBegin, type DailyFund, type DailyPortfolio } from './twr';

export interface TrPoint { date: string; tr: number }

// the index on a day: the last close on or before it (null before the series starts)
export function trOn(points: TrPoint[], date: string): number | null {
  let lo = 0, hi = points.length - 1, at = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid]!.date <= date) { at = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return at >= 0 ? points[at]!.tr : null;
}

// days after the index's last close are left out of every comparison: counting them as 0% for the index turned the
// account's own move on that day into a whole difference (2026-11-22: a -3.5% last bar when SPY was a day behind)
export const pastEnd = (points: TrPoint[], date: string): boolean => points.length > 0 && date > points[points.length - 1]!.date;

// the index return of one day, or null when the series does not cover it
export function benchDay(points: TrPoint[], date: string): number | null {
  const now = trOn(points, date);
  const before = trOn(points, addDays(date, -1));
  return now === null || before === null || before <= 0 ? null : now / before - 1;
}

export interface PeriodVsBench { key: string; from: string; to: string; mine: number; bench: number | null; diff: number | null }

// per candle: chained daily returns of the account and of the index over the days the account had money
export function periodVsBench(days: DailyPortfolio[], bench: TrPoint[], tf: Timeframe): PeriodVsBench[] {
  const out: PeriodVsBench[] = [];
  let cur: { key: string; from: string; to: string; g: number; b: number; covered: boolean } | null = null;
  const close = () => {
    if (!cur) return;
    const b = cur.covered ? cur.b - 1 : null;
    out.push({ key: cur.key, from: cur.from, to: cur.to, mine: cur.g - 1, bench: b, diff: b === null ? null : cur.g - 1 - b });
  };
  for (const d of days) {
    const key = periodKey(d.date, tf);
    if (!cur || cur.key !== key) { close(); cur = { key, from: d.date, to: d.date, g: 1, b: 1, covered: true }; }
    cur.to = d.date;
    if (d.begin <= 0 || pastEnd(bench, d.date)) continue; // no money yet, or no index close yet: nothing to compare
    cur.g *= 1 + d.dayReturn;
    const r = benchDay(bench, d.date);
    if (r === null) cur.covered = false; else cur.b *= 1 + r;
  }
  close();
  return out;
}

export interface WhatIf { date: string; value: number }

// every contribution bought into the index at the close of its day (the same convention as the TWR); a balance the
// account had before its first day goes in at the close before it. Cents
export function allInBench(days: DailyPortfolio[], bench: TrPoint[]): WhatIf[] {
  const out: WhatIf[] = [];
  let units = 0;
  days.forEach((d, i) => {
    if (pastEnd(bench, d.date)) return; // the index has no close for that day yet
    const tr = trOn(bench, d.date);
    if (tr === null || tr <= 0) return;
    if (i === 0 && d.begin > 0) {
      const before = trOn(bench, addDays(d.date, -1));
      units += d.begin / (before && before > 0 ? before : tr);
    }
    units += d.externalFlow / tr;
    out.push({ date: d.date, value: Math.round(units * tr) });
  });
  return out;
}

export interface FundVsBench { fund: string; from: string; to: string; days: number; ret: number; bench: number | null; diff: number | null }

// each fund over the days it held money: day return = (end - begin - contributions - transfers) / begin
export function fundsVsBench(rows: DailyFund[], bench: TrPoint[]): FundVsBench[] {
  const by = new Map<string, DailyFund[]>();
  rows.forEach((r) => { const l = by.get(r.fund); if (l) l.push(r); else by.set(r.fund, [r]); });
  const out: FundVsBench[] = [];
  by.forEach((list, fund) => {
    list.sort((a, b) => (a.date < b.date ? -1 : 1));
    let g = 1, b = 1, covered = true, days = 0;
    let from = '', to = '';
    list.forEach((f) => {
      if (f.endValue > 0) { if (!from) from = f.date; to = f.date; }
      const begin = fundBegin(f);
      if (begin <= 0 || pastEnd(bench, f.date)) return;
      days++;
      g *= 1 + (f.endValue - begin - f.contributions - f.transfersIn - f.transfersOut) / begin;
      const r = benchDay(bench, f.date);
      if (r === null) covered = false; else b *= 1 + r;
    });
    if (!from) return;
    const bench1 = covered ? b - 1 : null;
    out.push({ fund, from, to, days, ret: g - 1, bench: bench1, diff: bench1 === null ? null : g - 1 - bench1 });
  });
  return out.sort((x, y) => (x.from < y.from ? -1 : x.from > y.from ? 1 : x.fund < y.fund ? -1 : 1));
}

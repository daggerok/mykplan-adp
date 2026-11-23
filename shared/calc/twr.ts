/// <reference lib="esnext" />
// Time-weighted return of the account (the plan section 6):
//   r_d = (End_d - Begin_d - ExternalFlow_d) / Begin_d   (the contribution of day d is invested at the close of d)
//   NAV_0 = 100, NAV_d = NAV_{d-1} x (1 + r_d)
// Contributions are external flows. Transfers between funds are internal: they cancel inside one day; a net
// internal flow that does not cancel (out today, in tomorrow) is also taken out of the day's return, so money
// in transit is never counted as a loss or a gain
import { periodKey, Timeframe } from '../dates';

// Same shapes as DailyFund and DailyPortfolio of the plan section 4. Money in integer cents, units and prices as
// decimals (price in dollars per unit)
// one definition of both records: shared/model/records.ts
import type { DailyFund, DailyPortfolio } from '../model/records';

export type { DailyFund, DailyPortfolio };

export interface PeriodReturn {
  key: string;
  from: string;
  to: string;
  ret: number;
}

export interface SiteComparison {
  key: string;
  oursPct: number;
  sitePct: number | null;
  diffPct: number | null;
  flag: boolean;
}

export const dailyReturn = (begin: number, end: number, externalFlow: number): number =>
  begin <= 0 ? 0 : (end - begin - externalFlow) / begin;

// Begin value of a fund in cents from its units and dollar price
export const fundBegin = (f: DailyFund): number => f.begValue ?? Math.round(f.begUnits * f.begPrice * 100);

// One portfolio row per date (sorted), summed over the funds of that date
export function buildDailyPortfolio(rows: DailyFund[]): DailyPortfolio[] {
  const byDate: Record<string, DailyFund[]> = {};
  for (const r of rows) (byDate[r.date] = byDate[r.date] || []).push(r);
  const dates = Object.keys(byDate).sort();
  const out: DailyPortfolio[] = [];
  let nav = 100;
  for (const date of dates) {
    const funds = byDate[date]!;
    let begin = 0, end = 0, externalFlow = 0, internalFlow = 0, mvc = 0;
    for (const f of funds) {
      begin += fundBegin(f);
      end += f.endValue;
      externalFlow += f.contributions;
      internalFlow += f.transfersIn + f.transfersOut; // transfersOut is negative (site sign)
      mvc += f.mvc;
    }
    const dayReturn = dailyReturn(begin, end, externalFlow + internalFlow);
    nav *= 1 + dayReturn;
    out.push({ date, begin, end, externalFlow, internalFlow, mvc, dayReturn, nav, funds: funds.map((f) => f.fund).sort() });
  }
  return out;
}

export function chain(returns: number[]): number {
  let g = 1;
  for (const r of returns) g *= 1 + r;
  return g - 1;
}

// Annualized rate of a total return over calendar days; 0 for days <= 0. Short periods are annualized too:
// the caller decides whether to show it (the site shows annualized values only from 1 year up)
export const annualize = (total: number, days: number): number => (days <= 0 ? 0 : Math.pow(1 + total, 365 / days) - 1);

// Chained daily returns per bucket (1M by default: the site's Personal RoR is per month)
export function periodReturns(days: DailyPortfolio[], tf: Timeframe = '1M'): PeriodReturn[] {
  const out: PeriodReturn[] = [];
  let cur: PeriodReturn | null = null;
  let growth = 1;
  for (const d of days) {
    const key = periodKey(d.date, tf);
    if (!cur || cur.key !== key) {
      if (cur) { cur.ret = growth - 1; out.push(cur); }
      cur = { key, from: d.date, to: d.date, ret: 0 };
      growth = 1;
    }
    growth *= 1 + d.dayReturn;
    cur.to = d.date;
  }
  if (cur) { cur.ret = growth - 1; out.push(cur); }
  return out;
}

// Our chained returns (fractions) against the site's Personal RoR (percent points) by key; a difference above
// tolerancePct percentage points (0.05 by default) is flagged. A month the site does not have is not flagged
export function compareWithSite(ours: PeriodReturn[], site: Array<{ key: string; personalRoR: number }>, tolerancePct = 0.05): SiteComparison[] {
  const siteBy: Record<string, number> = {};
  for (const s of site) siteBy[s.key] = s.personalRoR;
  return ours.map((o) => {
    const oursPct = o.ret * 100;
    const sitePct = o.key in siteBy ? siteBy[o.key]! : null;
    const diffPct = sitePct === null ? null : oursPct - sitePct;
    return { key: o.key, oursPct, sitePct, diffPct, flag: diffPct !== null && Math.abs(diffPct) > tolerancePct + 1e-9 };
  });
}

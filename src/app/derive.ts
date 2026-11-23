/// <reference lib="esnext" />
// Everything the screens show, computed from one dataset without React (the plan sections 6 and 7)
import type { Dataset } from '../../shared/dataset';
import { buildDailyPortfolio, chain, compareWithSite, periodReturns, type PeriodReturn, type SiteComparison } from '../../shared/calc/twr';
import type { DailyPortfolio } from '../../shared/model/records';
import { xirr } from '../../shared/calc/xirr';
import { drawdownSeries, maxDrawdown, type MaxDrawdown } from '../../shared/calc/drawdown';
import { buyTheDip, type DipBucket } from '../../shared/calc/insights';
import { historyRates, type ForecastScenario } from '../../shared/calc/forecast';
import { daysBetween } from '../../shared/dates';
import type { SourceCode, Transaction } from '../../shared/model';

// activityDate: the day the money reached the funds (the latest one if the sources came on different days);
// invested: everything contributed up to and including this paycheck (running total in date order);
// investedRoth: the Roth part of invested;
// valueAt: the account value on the activity day (the last day with prices on or before it), null before the first one;
// rothShare: the Roth part of that value (month-end balances by source of that month, else the invested share)
export interface Paycheck { payCheckDate: string; activityDate: string; EE_ROTH: number; EE_PRETAX: number; ER_MATCH: number; ER_NEC: number; total: number; invested: number; investedRoth: number; valueAt: number | null; rothShare: number | null }

// US federal income tax brackets the after-tax columns use (the 12-24% range the owner asked for, 2026-11-22)
export const TAX_BRACKETS = [0.12, 0.22, 0.24]; // federal; the NJ rate added to each and the ranges: tax.ts

// what the account is worth after tax when withdrawn: the Roth part (contributions and their growth) in full, the
// rest (before-tax, match, NEC and all their growth) minus the rate. Cents, rounded; null without a value
export const afterTax = (p: { valueAt: number | null; rothShare: number | null }, rate: number): number | null =>
  p.valueAt === null ? null : Math.round(p.valueAt * ((p.rothShare ?? 0) + (1 - (p.rothShare ?? 0)) * (1 - rate)));

// profit or loss on the row's day: value minus invested, in cents and in percent of invested; null without a value
export const pnl = (p: { valueAt: number | null; invested: number }): number | null => (p.valueAt === null ? null : p.valueAt - p.invested);
export const pnlPct = (p: { valueAt: number | null; invested: number }): number | null =>
  p.valueAt === null || !p.invested ? null : ((p.valueAt - p.invested) / p.invested) * 100;

// Roth share of the balance per month ("2026-06"), from the month windows of the by-source pages
export function rothShares(periods: Dataset['periods']): Map<string, number> {
  const by = new Map<string, { roth: number; all: number }>();
  periods.forEach((p) => {
    if (p.scope !== 'source' || !isMonthWindow(p.from, p.to)) return;
    const k = p.from.slice(0, 7);
    const m = by.get(k) ?? { roth: 0, all: 0 };
    if (p.key === 'EE_ROTH') m.roth += p.end;
    m.all += p.end;
    by.set(k, m);
  });
  const out = new Map<string, number>();
  by.forEach((m, k) => { if (m.all > 0) out.set(k, m.roth / m.all); });
  return out;
}
export interface Marker { date: string; kind: 'contribution' | 'rate' | 'rebalance'; text: string }
export interface FundBand { fund: string; from: string; to: string; days?: number }

export interface Derived {
  portfolio: DailyPortfolio[];
  nav: Array<{ date: string; value: number }>;
  value: Array<{ date: string; value: number }>; // dollars
  monthly: SiteComparison[];
  yearly: PeriodReturn[];
  twrTotal: number | null;
  twrAnnual: number | null;
  xirr: number | null;
  totals: Record<SourceCode, number> & { all: number };
  paychecks: Paycheck[];
  current: { date: string; valueAt: number; rothShare: number | null } | null; // the last day with prices, for after-tax now
  markers: Marker[];
  bands: FundBand[];
  drawdown: Array<{ date: string; value: number }>;
  maxDrawdown: MaxDrawdown | null;
  dips: DipBucket[];
  scenario: ForecastScenario | null;
}

const SOURCES: SourceCode[] = ['EE_ROTH', 'EE_PRETAX', 'ER_MATCH', 'ER_NEC'];
const isMonthWindow = (from: string, to: string) => from.slice(0, 7) === to.slice(0, 7);

// one account period per calendar month: among periods inside one month the one ending latest, then the one starting
// earliest wins (review 2026-11-22: a Sync from May 12 to 31 leaves a year window "May 12..20" inside May, which
// used to pass as the month and gave a false ⚠ on Returns)
export function monthPeriods(periods: Dataset['periods']): Dataset['periods'] {
  const best = new Map<string, Dataset['periods'][number]>();
  periods.forEach((p) => {
    if (p.scope !== 'account' || !isMonthWindow(p.from, p.to)) return;
    const k = p.from.slice(0, 7);
    const cur = best.get(k);
    if (!cur || p.to > cur.to || (p.to === cur.to && p.from < cur.from)) best.set(k, p);
  });
  return Array.from(best.values()).sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
}

// money that is not Roth: employee before-tax plus everything the employer put in
export const nonRoth = (t: { EE_PRETAX: number; ER_MATCH: number; ER_NEC: number }): number => t.EE_PRETAX + t.ER_MATCH + t.ER_NEC;

export function paychecksOf(tx: Transaction[], portfolio: Array<{ date: string; end: number }> = [], shares: Map<string, number> = new Map()): Paycheck[] {
  const by = new Map<string, Paycheck>();
  tx.forEach((t) => {
    if (t.type !== 'contribution' || !t.source) return;
    const day = t.payCheckDate ?? t.activityDate;
    const p = by.get(day) ?? { payCheckDate: day, activityDate: t.activityDate, EE_ROTH: 0, EE_PRETAX: 0, ER_MATCH: 0, ER_NEC: 0, total: 0, invested: 0, investedRoth: 0, valueAt: null, rothShare: null };
    p[t.source] += t.amount;
    if (t.activityDate > p.activityDate) p.activityDate = t.activityDate;
    p.total += t.amount;
    by.set(day, p);
  });
  let sum = 0;
  let roth = 0;
  const valueOn = (day: string) => {
    let lo = 0, hi = portfolio.length - 1, at = -1;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (portfolio[mid]!.date <= day) { at = mid; lo = mid + 1; } else hi = mid - 1; }
    return at >= 0 ? portfolio[at]!.end : null;
  };
  return Array.from(by.values()).sort((a, b) => (a.payCheckDate < b.payCheckDate ? -1 : 1))
    .map((p) => {
      sum += p.total;
      roth += p.EE_ROTH;
      return { ...p, invested: sum, investedRoth: roth, valueAt: valueOn(p.activityDate), rothShare: shares.get(p.activityDate.slice(0, 7)) ?? (sum ? roth / sum : null) };
    });
}

// funds held: one line per fund, first and last day with a balance and how many days it had one. Gaps in the
// daily data (days not downloaded yet) used to split a fund into dozens of one-day pieces
export function fundBands(ds: Dataset): FundBand[] {
  const by = new Map<string, FundBand & { days: number }>();
  ds.dailyFunds.forEach((d) => {
    if (d.endValue <= 0) return;
    const b = by.get(d.fund);
    if (!b) by.set(d.fund, { fund: d.fund, from: d.date, to: d.date, days: 1 });
    else { if (d.date < b.from) b.from = d.date; if (d.date > b.to) b.to = d.date; b.days++; }
  });
  return Array.from(by.values()).sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : a.fund < b.fund ? -1 : 1));
}

export function derive(ds: Dataset, opts: { birthDate?: string | null; retireAge?: number; defaultReturn?: number } = {}): Derived {
  const portfolio = buildDailyPortfolio(ds.dailyFunds);
  const nav = portfolio.map((d) => ({ date: d.date, value: d.nav }));
  const value = portfolio.map((d) => ({ date: d.date, value: d.end / 100 }));

  const months = monthPeriods(ds.periods);
  const site = months
    .filter((p) => p.personalRoR !== undefined)
    .map((p) => ({ key: p.from.slice(0, 7), personalRoR: p.personalRoR! }));
  const monthly = compareWithSite(periodReturns(portfolio, '1M'), site);
  const yearly = periodReturns(portfolio, '1Y');
  const rets = portfolio.map((d) => d.dayReturn);
  const twrTotal = portfolio.length ? chain(rets) : null;
  const span = portfolio.length > 1 ? daysBetween(portfolio[0]!.date, portfolio[portfolio.length - 1]!.date) : 0;
  const twrAnnual = twrTotal !== null && span >= 365 ? Math.pow(1 + twrTotal, 365 / span) - 1 : null;

  const contributions = ds.transactions.filter((t) => t.type === 'contribution');
  const totals = { EE_ROTH: 0, EE_PRETAX: 0, ER_MATCH: 0, ER_NEC: 0, all: 0 };
  contributions.forEach((t) => { if (t.source) totals[t.source] += t.amount; totals.all += t.amount; });

  // money-weighted: the first begin and every contribution go in, the last end comes out
  const accountMonths = months;
  const flows: Array<{ date: string; amount: number }> = [];
  if (accountMonths.length) {
    const first = accountMonths[0]!;
    const last = accountMonths[accountMonths.length - 1]!;
    if (first.begin > 0) flows.push({ date: first.from, amount: -first.begin });
    contributions.forEach((t) => flows.push({ date: t.activityDate, amount: -t.amount }));
    flows.push({ date: last.to, amount: last.end });
  }

  const markers: Marker[] = [];
  const shares = rothShares(ds.periods);
  const paychecks = paychecksOf(ds.transactions, portfolio, shares);
  const lastPriced = portfolio[portfolio.length - 1];
  const lastShare = Array.from(shares.keys()).sort().pop();
  const current = lastPriced ? { date: lastPriced.date, valueAt: lastPriced.end, rothShare: lastShare ? shares.get(lastShare)! : paychecks[paychecks.length - 1]?.rothShare ?? null } : null;
  paychecks.forEach((p) => markers.push({ date: p.payCheckDate, kind: 'contribution', text: `+$${(p.total / 100).toFixed(2)}` }));
  // short marker texts: long fund lists ran across the whole chart (2026-11-22); the details are on Insights
  ds.rates.forEach((r) => markers.push({ date: r.date, kind: 'rate', text: `Roth ${r.rothPct}%${r.preTaxPct ? ` · Pre-Tax ${r.preTaxPct}%` : ''}` }));
  ds.rebalances.forEach((r) => markers.push({ date: r.date, kind: 'rebalance', text: `⇄ ${new Set(r.out.concat(r.in).map((x) => x.fund)).size} funds` }));
  markers.sort((a, b) => (a.date < b.date ? -1 : 1));

  const lastDay = portfolio[portfolio.length - 1];
  const birthDate = opts.birthDate ?? ds.profile?.birthDate ?? null;
  const rates = historyRates(contributions.map((t) => ({ date: t.activityDate, source: t.source, amount: t.amount })), ds.asOf ?? lastDay?.date ?? '');
  const scenario: ForecastScenario | null = lastDay && birthDate ? {
    start: lastDay.date,
    startValue: lastDay.end,
    birthDate,
    retireAge: opts.retireAge ?? 67,
    contributions: { mode: 'asNow', eeAnnual: rates.eeAnnual },
    employerRatio: rates.employerRatio,
    // what the employee already put in this year counts against this year's IRS limit (review 2026-11-22)
    eeYtd: contributions.filter((t) => (t.source === 'EE_ROTH' || t.source === 'EE_PRETAX') && t.activityDate.slice(0, 4) === lastDay.date.slice(0, 4)).reduce((a, t) => a + t.amount, 0),
    annualReturn: twrAnnual ?? opts.defaultReturn ?? 0.07,
  } : null;

  return {
    portfolio, nav, value, monthly, yearly, twrTotal, twrAnnual,
    xirr: flows.length > 1 ? xirr(flows) : null,
    totals,
    paychecks,
    current,
    markers,
    bands: fundBands(ds),
    drawdown: drawdownSeries(nav).map((d) => ({ date: d.date, value: d.drawdown })),
    maxDrawdown: maxDrawdown(nav),
    dips: buyTheDip(contributions.map((t) => ({ date: t.activityDate, amount: t.amount })), nav),
    scenario,
  };
}
export { SOURCES };

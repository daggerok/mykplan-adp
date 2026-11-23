/// <reference lib="esnext" />
// Parse stage: saved raw pages -> one dataset (what the viewer, export and Sheets use). Runs over the raw store,
// so it can be repeated after a parser fix without asking the site again (the plan sections 0 and 15)
import type { Period, Transaction } from './model';
import type { DailyFund } from './model/records';
import { parseBySource } from './parse/bySource';
import { contributionRates, parseJournalDetail, parseJournalList, type JournalDetail, type JournalRow } from './parse/journal';
import { parseProfile, type Profile } from './parse/profile';
import { parseQfx, reconcileQfx, type QfxSecurity } from './parse/qfx';
import { parseTxPrint } from './parse/txPrint';

export type { DailyFund };

export interface Rebalance { date: string; out: Array<{ fund: string; amount: number }>; in: Array<{ fund: string; amount: number }> }

export interface Dataset {
  version: 1;
  builtAt: string;
  asOf: string | null;
  profile: Profile | null;
  transactions: Transaction[];
  periods: Period[];
  dailyFunds: DailyFund[];
  journal: JournalRow[];
  journalDetails: JournalDetail[];
  rates: Array<{ date: string; rothPct: number; preTaxPct: number }>;
  rebalances: Rebalance[];
  documents: Array<{ key: string; type: string }>;
  // from the Quicken files (M5): fund names with CUSIP and ticker, and days where QFX and the site disagree
  securities?: QfxSecurity[];
  qfxDiffs?: Array<{ date: string; fund: string; qfx: number; site: number }>;
  warnings: string[];
}

export interface RawText { key: string; type: string; text?: string }

const windowOf = (key: string): { from: string; to: string } | null => {
  const m = key.match(/(\d{4}-\d{2}-\d{2})_(\d{4}-\d{2}-\d{2})/);
  return m ? { from: m[1]!, to: m[2]! } : null;
};

// account period of a window = sum of its fund periods, with the site's Personal RoR of that page
function accountPeriod(fundPeriods: Period[], w: { from: string; to: string }, ror: number | null): Period {
  const sum = (f: (p: Period) => number) => fundPeriods.reduce((a, p) => a + f(p), 0);
  const p: Period = {
    from: w.from, to: w.to, scope: 'account',
    begin: sum((x) => x.begin), contributions: sum((x) => x.contributions), dividends: sum((x) => x.dividends),
    transfersIn: sum((x) => x.transfersIn), transfersOut: sum((x) => x.transfersOut), mvc: sum((x) => x.mvc), end: sum((x) => x.end),
  };
  if (ror !== null) p.personalRoR = ror;
  return p;
}

export function rebalancesOf(tx: Transaction[]): Rebalance[] {
  const byDate = new Map<string, Rebalance>();
  tx.forEach((t) => {
    if (t.type !== 'transferIn' && t.type !== 'transferOut') return;
    const r = byDate.get(t.activityDate) ?? { date: t.activityDate, out: [], in: [] };
    (t.type === 'transferOut' ? r.out : r.in).push({ fund: t.fund, amount: t.amount });
    byDate.set(t.activityDate, r);
  });
  return Array.from(byDate.values()).sort((a, b) => (a.date < b.date ? -1 : 1));
}

export function buildDataset(entries: RawText[], parseHtml: (html: string) => Document, builtAt: string): Dataset {
  const warnings: string[] = [];
  const html = (e: RawText) => parseHtml(e.text ?? '');
  const sorted = entries.slice().sort((a, b) => (a.key < b.key ? -1 : 1));

  const highlights = sorted.filter((e) => e.key.startsWith('highlights/'));
  const profile = highlights.length ? parseProfile(html(highlights[highlights.length - 1]!)) : null;

  const transactions: Transaction[] = [];
  const periods: Period[] = [];
  const dailyFunds: DailyFund[] = [];
  const ids = new Set<string>();

  sorted.forEach((e) => {
    const isFundWindow = /^tx\/fund\/(month|year)\//.test(e.key);
    const isSource = e.key.startsWith('tx/source/month/');
    const isDay = e.key.startsWith('tx/day/');
    if (!isFundWindow && !isSource && !isDay) return;
    const w = isDay ? { from: e.key.slice(7, 17), to: e.key.slice(7, 17) } : windowOf(e.key);
    if (!w) return;
    if (isSource) {
      const r = parseBySource(html(e), w);
      r.warnings.forEach((x) => warnings.push(`${e.key}: ${x}`));
      periods.push(...r.periods);
      return;
    }
    const r = parseTxPrint(html(e), w);
    r.warnings.forEach((x) => warnings.push(`${e.key}: ${x}`));
    if (isDay) {
      r.periods.forEach((p) => dailyFunds.push({
        date: w.from, fund: p.key!, begUnits: p.begUnits ?? 0, begPrice: p.begPrice ?? 0, endUnits: p.endUnits ?? 0, endPrice: p.endPrice ?? 0,
        begValue: p.begin, endValue: p.end, contributions: p.contributions, dividends: p.dividends, transfersIn: p.transfersIn, transfersOut: p.transfersOut, mvc: p.mvc,
      }));
      return;
    }
    periods.push(...r.periods, accountPeriod(r.periods, w, r.personalRoR));
    // transactions come from the month windows only (years repeat them)
    if (e.key.startsWith('tx/fund/month/')) r.transactions.forEach((t) => { if (!ids.has(t.id)) { ids.add(t.id); transactions.push(t); } });
  });

  const journalPages = sorted.filter((e) => /^journal\/\d{4}-/.test(e.key));
  const journal = journalPages.length ? parseJournalList(html(journalPages[journalPages.length - 1]!)) : [];
  const journalDetails = sorted.filter((e) => e.key.startsWith('journal/detail/')).map((e) => parseJournalDetail(html(e)));

  transactions.sort((a, b) => (a.activityDate < b.activityDate ? -1 : a.activityDate > b.activityDate ? 1 : 0));
  const securities = new Map<string, QfxSecurity>();
  const qfxDiffs: Array<{ date: string; fund: string; qfx: number; site: number }> = [];
  sorted.filter((e) => e.key.startsWith('qfx/') && e.text).forEach((e) => {
    const q = parseQfx(e.text!);
    q.securities.forEach((x) => securities.set(x.cusip, x));
    // only windows the month pages fully cover are compared
    if (transactions.length) qfxDiffs.push(...reconcileQfx(q, transactions));
  });
  return {
    version: 1,
    builtAt,
    asOf: profile?.asOf ?? null,
    profile,
    transactions,
    periods,
    dailyFunds,
    journal,
    journalDetails,
    rates: contributionRates(journalDetails),
    rebalances: rebalancesOf(transactions),
    documents: sorted.filter((e) => /^(stmt|qfx)\//.test(e.key)).map((e) => ({ key: e.key, type: e.type })),
    securities: Array.from(securities.values()),
    qfxDiffs,
    warnings,
  };
}

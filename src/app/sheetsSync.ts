/// <reference lib="esnext" />
// Dataset -> mykplan_* tabs of the owner's spreadsheet (the plan section 9, denormalized 2026-11-22). Upsert by the
// rows' own keys, so a repeated push changes nothing. Salary and birth date never go there
import type { Dataset } from '../../shared/dataset';
import type { ContributionRate } from '../../shared/model/records';
import type { SheetsClient } from '../../shared/sheets/client';
import { TABS, TOTAL_FUND, type DailyRow, type ElectionRow } from '../../shared/sheets/tabs';
import type { Derived } from './derive';

// the contribution percents in force at the end of a day
export function rateAt(rates: ContributionRate[], day: string): { rothPct: number; preTaxPct: number } | null {
  let r: ContributionRate | null = null;
  rates.forEach((x) => { if (x.date <= day) r = x; });
  return r ? { rothPct: (r as ContributionRate).rothPct, preTaxPct: (r as ContributionRate).preTaxPct } : null;
}

// the journal rows with what was asked and the percents in force after that day (was adp_election + adp_rate)
export function electionRows(ds: Dataset): ElectionRow[] {
  // two journal rows can share one confirm number: match the detail by number and type, then by number alone
  const byConfirmType = new Map(ds.journalDetails.map((d) => [`${d.confirmNo}|${d.type}`, d]));
  const byConfirm = new Map(ds.journalDetails.map((d) => [d.confirmNo, d]));
  return ds.journal.map((r) => {
    const d = byConfirmType.get(`${r.confirmNo}|${r.type}`) ?? byConfirm.get(r.confirmNo);
    const list = (xs: Array<{ name: string; pct: number }>) => xs.map((x) => `${x.name}: ${x.pct}%`).join('; ');
    const details = d ? [list(d.values), d.from.length ? `from ${list(d.from)}` : '', d.to.length ? `to ${list(d.to)}` : ''].filter(Boolean).join(' · ') : '';
    const rates = /^Contribution - /.test(r.type) ? rateAt(ds.rates, r.requestedAt.slice(0, 10)) : null;
    return {
      requestedAt: r.requestedAt, type: r.type, system: r.system, confirmNo: r.confirmNo,
      newValue: d ? list(d.values) || undefined : undefined, details: `${r.action}${details ? `: ${details}` : ''}`,
      rothPct: rates?.rothPct, preTaxPct: rates?.preTaxPct,
    };
  });
}

// one row per day and fund, plus a Total row per day with the account NAV (was adp_daily_fund + adp_daily_portfolio)
export function dailyRows(ds: Dataset, d: Derived | null): DailyRow[] {
  const rows: DailyRow[] = ds.dailyFunds.map((f) => ({ ...f }));
  (d?.portfolio ?? []).forEach((p) => rows.push({
    date: p.date, fund: TOTAL_FUND, begValue: p.begin, endValue: p.end, contributions: p.externalFlow,
    transfersIn: 0, transfersOut: 0, mvc: p.mvc, dayReturn: p.dayReturn, nav: p.nav,
  }));
  return rows;
}

// d is null while the daily prices are not in yet: the Total rows wait, the rest is written
export async function pushAll(client: SheetsClient, ds: Dataset, d: Derived | null, log: (line: string) => void): Promise<void> {
  const step = async (name: string, fn: () => Promise<{ inserted: number; updated: number; total: number }>) => {
    const r = await fn();
    log(`${name}: ${r.inserted} new, ${r.updated} updated, ${r.total} rows`);
  };
  await step(TABS.tx.name, () => client.upsertById(TABS.tx, ds.transactions));
  await step(TABS.period.name, () => client.upsertById(TABS.period, ds.periods));
  await step(TABS.daily.name, () => client.upsertById(TABS.daily, dailyRows(ds, d)));
  await step(TABS.election.name, () => client.upsertById(TABS.election, electionRows(ds)));
}

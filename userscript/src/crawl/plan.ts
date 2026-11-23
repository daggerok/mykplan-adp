/// <reference lib="esnext" />
// Which requests a run makes, as a pure list of steps (tested without a browser). Raw first (the plan section 0):
// every step saves the site answer under its key; parsing runs later over the saved pages. A step whose key is
// already saved and whose period is closed is never asked again, even if ADP later limits the history depth.
// Site limits seen in M1: a TransactionHistory window is at most 13 months, Quicken at most 12 months and not
// before 05/12/2023, the last day with prices is the "As of" day of AccountHighlights
import { addDays, endOfMonth, isWeekend, monthWindows } from '../../../shared/dates';

export const HISTORY_START = '2023-05-12';

export type Step =
  | { kind: 'highlights'; key: string }
  | { kind: 'snapshot'; key: string; path: string }
  | { kind: 'txWindow'; key: string; view: 'fund' | 'source'; from: string; to: string }
  | { kind: 'txDay'; key: string; day: string }
  | { kind: 'journal'; key: string }
  | { kind: 'statement'; key: string; quarterEnd: string }
  | { kind: 'qfx'; key: string; from: string; to: string };

// read-only GET pages of M3 (balances today, future allocation, current contribution percents); never submitted
export const SNAPSHOT_PAGES: Array<[string, string]> = [
  ['byFund', '/ParticipantSecure_Net/AccountBalancePartDetailsByInv.aspx'],
  ['bySource', '/ParticipantSecure_Net/AccountBalancePartDetails.aspx'],
  ['allocations', '/ParticipantSecure_Net/Investment_Allocations.aspx'],
  ['contributions', '/ParticipantSecure_Net/Contributions.aspx'],
  ['saveSmart', '/ParticipantSecure_Net/SaveSmartSelect.aspx'],
  ['fundReturns', '/ParticipantSecure_Net/InvestmentAllocationRateOfReturn.aspx'],
  ['fundDescriptions', '/ParticipantSecure_Net/FundDescriptions.aspx'],
];

// 12-month windows from start: [start, start + 1y - 1d], ... the last one clipped to lastDay
export function yearWindows(start: string, lastDay: string): Array<{ from: string; to: string }> {
  const out: Array<{ from: string; to: string }> = [];
  let from = start;
  while (from <= lastDay) {
    const [y, m, d] = from.split('-');
    const next = `${Number(y) + 1}-${m}-${d}`;
    const to = addDays(next, -1);
    out.push({ from, to: to < lastDay ? to : lastDay });
    from = next;
  }
  return out;
}

// 6-month windows: [start, start + 6 months - 1 day], ... the last one clipped to lastDay
export function halfYearWindows(start: string, lastDay: string): Array<{ from: string; to: string }> {
  const out: Array<{ from: string; to: string }> = [];
  let from = start;
  while (from <= lastDay) {
    const [y, m, d] = from.split('-').map(Number);
    const total = y! * 12 + (m! - 1) + 6;
    const next = `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const to = addDays(next, -1);
    out.push({ from, to: to < lastDay ? to : lastDay });
    from = next;
  }
  return out;
}

export function tradingDays(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) if (!isWeekend(d)) out.push(d);
  return out;
}

// quarter ends whose statement can exist: the on-demand list of the site decides; this only names keys
export const statementKey = (quarterEnd: string) => `stmt/${quarterEnd}.pdf`;

export interface PlanInput {
  mode: 'full' | 'sync';
  lastPriceDay: string; // "As of" of AccountHighlights
  today: string;
  saved: (key: string) => boolean; // raw store already has it
  statementQuarters: string[]; // ISO quarter ends offered by the on-demand list
  firstDay?: string | null; // first transaction of the account: day and month pages ending before it are empty
}

// A window or day is closed once it ends before the first day of the current month: its numbers never change.
// Open ones (current month, current year window, today's snapshots, the journal) are asked again on every run
export function planSteps(input: PlanInput): Step[] {
  const { lastPriceDay, today, saved } = input;
  const openFrom = `${today.slice(0, 7)}-01`;
  const closed = (to: string) => to < openFrom;
  const need = (key: string, to: string) => !(saved(key) && closed(to));
  const before = (to: string) => !!input.firstDay && to < input.firstDay;
  const steps: Step[] = [{ kind: 'highlights', key: `highlights/${today}.html` }];

  SNAPSHOT_PAGES.forEach(([name, path]) => steps.push({ kind: 'snapshot', key: `snapshot/${name}/${today}.html`, path }));
  steps.push({ kind: 'journal', key: `journal/${today}.html` });

  // years first: they are the reference returns and catch everything even if a month step fails
  yearWindows(HISTORY_START, lastPriceDay).forEach((w) => {
    const key = `tx/fund/year/${w.from}_${w.to}.html`;
    if (need(key, w.to)) steps.push({ kind: 'txWindow', key, view: 'fund', from: w.from, to: w.to });
  });
  monthWindows(HISTORY_START, lastPriceDay).forEach((w) => {
    if (before(w.to)) return;
    (['fund', 'source'] as const).forEach((view) => {
      const key = `tx/${view}/month/${w.from}_${w.to}.html`;
      if (need(key, w.to)) steps.push({ kind: 'txWindow', key, view, from: w.from, to: w.to });
    });
  });

  input.statementQuarters.forEach((q) => {
    if (!saved(statementKey(q))) steps.push({ kind: 'statement', key: statementKey(q), quarterEnd: q });
  });

  // Quicken: half-year windows. The site allows "Maximum 12-month period", and a 12-month window over Feb 29
  // (2023-05-12..2024-05-11 is 366 days) was refused on the first live run
  halfYearWindows(HISTORY_START, lastPriceDay).forEach((w) => {
    const key = `qfx/${w.from}_${w.to}.qfx`;
    if (need(key, w.to)) steps.push({ kind: 'qfx', key, from: w.from, to: w.to });
  });

  // the daily series last: the longest part (~890 requests once), checkpointed day by day.
  // sync takes only days not saved yet (a full run fills every gap the same way)
  tradingDays(HISTORY_START, lastPriceDay).forEach((day) => {
    const key = `tx/day/${day}.html`;
    if (!saved(key) && !before(day)) steps.push({ kind: 'txDay', key, day });
  });
  return steps;
}

export const isMonthEnd = (iso: string) => endOfMonth(iso) === iso;

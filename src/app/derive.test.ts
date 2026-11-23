/// <reference types="bun" />
/// <reference types="node" />
/// <reference lib="esnext" />
import { expect, test } from 'bun:test';
import type { Dataset } from '../../shared/dataset';
import type { Transaction } from '../../shared/model';
import { afterTax, derive, fundBands, paychecksOf, pnl, pnlPct, rothShares } from './derive';

const tx = (date: string, source: Transaction['source'], amount: number, fund = 'A'): Transaction =>
  ({ id: `${date}${source}${fund}`, activityDate: date, payCheckDate: date, fund, source, type: 'contribution', rawType: 'Contribution', amount, origin: 'txPrint' });
const day = (date: string, fund: string, beg: number, end: number, contributions = 0) =>
  ({ date, fund, begUnits: 1, begPrice: beg / 100, endUnits: 1, endPrice: end / 100, begValue: beg, endValue: end, contributions, dividends: 0, transfersIn: 0, transfersOut: 0, mvc: end - beg - contributions });

const ds: Dataset = {
  version: 1, builtAt: 'T', asOf: '2025-06-03',
  profile: { asOf: '2025-06-03', hireDate: '2023-01-02', age: { years: 39, months: 0 }, birthDate: '1986-06-30', birthFrom: '1986-05-04', birthTo: '1986-06-03', birthMonth: '1986-06' },
  transactions: [tx('2025-06-02', 'EE_ROTH', 10000), tx('2025-06-02', 'ER_MATCH', 5000)],
  periods: [{ from: '2025-06-01', to: '2025-06-03', scope: 'account', begin: 100000, contributions: 15000, dividends: 0, transfersIn: 0, transfersOut: 0, mvc: 3000, end: 118000, personalRoR: 2.6 }],
  dailyFunds: [day('2025-06-02', 'A', 100000, 116500, 15000), day('2025-06-03', 'A', 116500, 118000), day('2025-06-03', 'B', 0, 0)],
  journal: [], journalDetails: [],
  rates: [{ date: '2025-05-01', rothPct: 6, preTaxPct: 0 }],
  rebalances: [], documents: [], warnings: [],
};

test('derive: nav, returns against the site, totals, paychecks, markers, scenario', () => {
  const d = derive(ds);
  expect(d.nav.map((p) => p.date)).toEqual(['2025-06-02', '2025-06-03']);
  expect(d.nav[0]!.value).toBeCloseTo(101.5, 6); // (116500 - 100000 - 15000) / 100000
  expect(d.value[1]!.value).toBe(1180);
  expect(d.monthly).toHaveLength(1);
  expect(d.monthly[0]!.key).toBe('2025-06');
  expect(d.monthly[0]!.sitePct).toBe(2.6);
  expect(d.totals).toEqual({ EE_ROTH: 10000, EE_PRETAX: 0, ER_MATCH: 5000, ER_NEC: 0, all: 15000 });
  expect(d.paychecks).toEqual([{ payCheckDate: '2025-06-02', activityDate: d.paychecks[0]!.activityDate, EE_ROTH: 10000, EE_PRETAX: 0, ER_MATCH: 5000, ER_NEC: 0, total: 15000, invested: 15000, investedRoth: 10000, valueAt: d.paychecks[0]!.valueAt, rothShare: d.paychecks[0]!.rothShare }]);
  expect(d.markers.map((m) => m.kind)).toEqual(['rate', 'contribution']);
  expect(d.markers[0]!.text).toBe('Roth 6%');
  expect(d.xirr).not.toBeNull();
  expect(d.scenario).toMatchObject({ start: '2025-06-03', startValue: 118000, birthDate: '1986-06-30', retireAge: 67, eeYtd: 10000 });
  expect(derive(ds, { birthDate: '1990-01-31' }).scenario!.birthDate).toBe('1990-01-31');
});

test('fund bands and paychecks', () => {
  expect(fundBands(ds)).toEqual([{ fund: 'A', from: '2025-06-02', to: '2025-06-03', days: 2 }]);
  // a gap in the downloaded days does not split the fund
  const gappy = { ...ds, dailyFunds: [day('2025-06-02', 'A', 1, 2), day('2025-06-20', 'A', 2, 3), day('2025-06-20', 'B', 0, 0)] };
  expect(fundBands(gappy)).toEqual([{ fund: 'A', from: '2025-06-02', to: '2025-06-20', days: 2 }]);
  expect(paychecksOf([])).toEqual([]);
  const tx = (d: string, source: 'EE_ROTH' | 'ER_MATCH', amount: number) => ({ id: d + source, activityDate: d, payCheckDate: d, fund: 'F', source, type: 'contribution' as const, rawType: 'Contribution', amount, origin: 'txPrint' as const });
  // given in any order, the running total follows the paycheck dates
  expect(paychecksOf([tx('2024-02-01', 'EE_ROTH', 300), tx('2024-01-01', 'EE_ROTH', 100), tx('2024-01-01', 'ER_MATCH', 50)]).map((p) => [p.payCheckDate, p.total, p.invested]))
    .toEqual([['2024-01-01', 150, 150], ['2024-02-01', 300, 450]]);
  // after tax on the value: the Roth part in full, the rest (with its growth) minus the rate.
  // Value 1000, Roth 60%: 600 + 400 * 0.78 = 912; no value -> null
  expect([afterTax({ valueAt: 1000, rothShare: 0.6 }, 0.22), afterTax({ valueAt: 1000, rothShare: null }, 0.22), afterTax({ valueAt: null, rothShare: 0.6 }, 0.22)]).toEqual([912, 780, null]);
  // P&L on the row's day: 1200 value on 1000 invested = +200 and +20%; no value -> null
  expect([pnl({ valueAt: 1200, invested: 1000 }), pnlPct({ valueAt: 1200, invested: 1000 }), pnl({ valueAt: null, invested: 1000 }), pnlPct({ valueAt: 900, invested: 1000 })]).toEqual([200, 20, null, -10]);
  // the Roth share comes from the month-end balances by source; without them from the invested money
  const src = (key: string, end: number, from = '2024-01-01', to = '2024-01-31') => ({ from, to, scope: 'source' as const, key, begin: 0, contributions: 0, dividends: 0, transfersIn: 0, transfersOut: 0, mvc: 0, end });
  const shares = rothShares([src('EE_ROTH', 300), src('ER_MATCH', 100), src('EE_ROTH', 999, '2024-01-01', '2024-12-31')]);
  expect(Array.from(shares.entries())).toEqual([['2024-01', 0.75]]);
  const two = paychecksOf([tx('2024-01-01', 'EE_ROTH', 100), tx('2024-01-01', 'ER_MATCH', 50), tx('2024-02-01', 'EE_ROTH', 300)], [], shares);
  expect(two.map((p) => p.rothShare)).toEqual([0.75, 400 / 450]);
  // value on the activity day, or on the last priced day before it (a weekend); none before the first day.
  // The match of the second paycheck came a day later: the activity date is the later one
  const days = [{ date: '2024-01-02', end: 1000 }, { date: '2024-01-31', end: 2000 }, { date: '2024-02-01', end: 2500 }, { date: '2024-02-05', end: 3000 }];
  const later = { ...tx('2024-01-31', 'ER_MATCH', 1), activityDate: '2024-02-01' };
  expect(paychecksOf([tx('2024-01-01', 'EE_ROTH', 1), tx('2024-01-31', 'EE_ROTH', 1), later, tx('2024-02-03', 'EE_ROTH', 1)], days).map((p) => [p.activityDate, p.valueAt]))
    .toEqual([['2024-01-01', null], ['2024-02-01', 2500], ['2024-02-03', 2500]]);
});

test('sheet rows: a Total row per day next to the fund rows, percents on contribution journal rows', async () => {
  const { dailyRows, electionRows } = await import('./sheetsSync');
  const d = derive(ds);
  const rows = dailyRows(ds, d);
  expect(rows.filter((r) => r.fund === 'Total').map((r) => r.date)).toEqual(['2025-06-02', '2025-06-03']);
  expect(rows.find((r) => r.fund === 'Total')!.nav).toBeCloseTo(101.5, 6);
  expect(dailyRows(ds, null).some((r) => r.fund === 'Total')).toBe(false);
  const withJournal = { ...ds, journal: [{ requestedAt: '2025-05-01T10:00:00', type: 'Contribution - Roth 401(k) Percent', action: 'Add', system: 'Internet', confirmNo: '1' }] };
  expect(electionRows(withJournal)[0]).toMatchObject({ rothPct: 6, preTaxPct: 0, details: 'Add' });
});

test('one account period per month: the month beats a short year window inside it', async () => {
  const { monthPeriods } = await import('./derive');
  const p = (from: string, to: string, ror: number) => ({ from, to, scope: 'account' as const, begin: 0, contributions: 0, dividends: 0, transfersIn: 0, transfersOut: 0, mvc: 0, end: 0, personalRoR: ror });
  // Sync on May 20: month May 1..20 and the new year window May 12..20 end the same day -> the month wins
  expect(monthPeriods([p('2027-05-12', '2027-05-20', 0.4), p('2027-05-01', '2027-05-20', 1.1)]).map((x) => x.personalRoR)).toEqual([1.1]);
  // later the full month ends later and wins over both
  expect(monthPeriods([p('2027-05-12', '2027-05-20', 0.4), p('2027-05-01', '2027-05-20', 1.1), p('2027-05-01', '2027-05-31', 2)]).map((x) => x.personalRoR)).toEqual([2]);
  // a 12-month window is never a month
  expect(monthPeriods([p('2026-05-12', '2027-05-11', 9)])).toEqual([]);
});

test('non-Roth = before-tax + match + NEC', async () => {
  const { nonRoth } = await import('./derive');
  expect(nonRoth({ EE_PRETAX: 10000, ER_MATCH: 250000, ER_NEC: 5000 })).toBe(265000);
});

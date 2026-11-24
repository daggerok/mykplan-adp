/// <reference types="bun" />
/// <reference lib="esnext" />
import { expect, test } from 'bun:test';
import type { DailyFund, DailyPortfolio } from './twr';
import { allInBench, benchDay, fundsVsBench, periodVsBench, trOn } from './vsBench';

// index: Fri 100, Mon 110 (+10%), Tue 99 (-10%), Wed 99, then February 108.9 (+10%)
const bench = [
  { date: '2024-01-26', tr: 100 }, { date: '2024-01-29', tr: 110 }, { date: '2024-01-30', tr: 99 }, { date: '2024-01-31', tr: 99 },
  { date: '2024-02-01', tr: 108.9 },
];
const day = (date: string, begin: number, end: number, externalFlow: number, dayReturn: number): DailyPortfolio =>
  ({ date, begin, end, externalFlow, internalFlow: 0, mvc: end - begin - externalFlow, dayReturn, nav: 0, funds: [] }) as DailyPortfolio;

test('the index on a day is the last close on or before it; a Monday return is against Friday', () => {
  expect(trOn(bench, '2024-01-28')).toBe(100); // Sunday
  expect(trOn(bench, '2024-01-01')).toBeNull();
  expect(benchDay(bench, '2024-01-29')).toBeCloseTo(0.1, 12);
  expect(benchDay(bench, '2024-01-26')).toBeNull(); // no close before the series
});

test('per candle: the account and the index over the same days, days without money skipped', () => {
  const days = [
    day('2024-01-26', 0, 1000, 1000, 0), // first contribution at the close: nothing to compare
    day('2024-01-29', 1000, 1050, 0, 0.05),
    day('2024-01-30', 1050, 1050, 0, 0),
    day('2024-02-01', 1050, 1155, 0, 0.1),
  ];
  const r = periodVsBench(days, bench, '1M');
  expect(r.map((x) => x.key)).toEqual(['2024-01', '2024-02']);
  expect(r[0]!.mine).toBeCloseTo(0.05, 12);
  expect(r[0]!.bench).toBeCloseTo(1.1 * 0.9 - 1, 12); // -1%
  expect(r[0]!.diff).toBeCloseTo(0.06, 12);
  // February 1 against January 31 (the last close before it)
  expect(r[1]!.bench).toBeCloseTo(0.1, 12);
  expect(r[1]!.diff).toBeCloseTo(0, 12);
});

test('a period the index does not cover has no comparison', () => {
  const r = periodVsBench([day('2024-01-26', 1000, 1010, 0, 0.01)], bench, '1M');
  expect(r[0]!.bench).toBeNull();
  expect(r[0]!.diff).toBeNull();
});

test('all in the index: the same contributions on the same days', () => {
  const days = [day('2024-01-26', 0, 1000, 1000, 0), day('2024-01-29', 1000, 1050, 0, 0.05), day('2024-01-30', 1050, 2050, 1000, 0)];
  // 10 units at 100; worth 1100 at 110; at 99: 990 + 1000 bought = 1990
  expect(allInBench(days, bench)).toEqual([{ date: '2024-01-26', value: 1000 }, { date: '2024-01-29', value: 1100 }, { date: '2024-01-30', value: 1990 }]);
  // an account that already had money on its first day buys it at the close before
  expect(allInBench([day('2024-01-29', 1000, 1100, 0, 0.1)], bench)).toEqual([{ date: '2024-01-29', value: 1100 }]);
});

test('each fund over its own days, transfers and contributions are not return', () => {
  const f = (date: string, fund: string, begValue: number, endValue: number, flows: Partial<DailyFund> = {}): DailyFund =>
    ({ date, fund, begUnits: 0, begPrice: 0, endUnits: 0, endPrice: 0, begValue, endValue, contributions: 0, transfersIn: 0, transfersOut: 0, mvc: 0, ...flows });
  const rows = [
    f('2024-01-26', 'A', 0, 1000, { contributions: 1000 }),
    f('2024-01-29', 'A', 1000, 1200, { contributions: 100 }), // +100 of market: +10%
    f('2024-01-30', 'A', 1200, 0, { transfersOut: -1200 }), // sold everything, no return
    f('2024-01-30', 'B', 0, 1200, { transfersIn: 1200 }),
    f('2024-01-31', 'B', 1200, 1188), // -1%
  ];
  const r = fundsVsBench(rows, bench);
  expect(r.map((x) => [x.fund, x.from, x.to, x.days])).toEqual([['A', '2024-01-26', '2024-01-29', 2], ['B', '2024-01-30', '2024-01-31', 1]]);
  expect(r[0]!.ret).toBeCloseTo(0.1, 12);
  expect(r[0]!.bench).toBeCloseTo(1.1 * 0.9 - 1, 12); // the index over A's money days: Mon and Tue
  expect(r[1]!.ret).toBeCloseTo(-0.01, 12);
  expect(r[1]!.bench).toBeCloseTo(0, 12); // Wed: 99 -> 99
});

test('days after the index\'s last close are left out, not counted as a flat index day', () => {
  const days = [day('2024-01-29', 1000, 1100, 0, 0.1), day('2024-02-02', 1100, 990, 0, -0.1)]; // Feb 2: index has no close yet
  const r = periodVsBench(days, bench, '1W');
  expect(r.map((x) => x.key)).toEqual(['2024-01-29']);
  expect(r[0]!.mine).toBeCloseTo(0.1, 12); // the Feb 2 drop is not compared with a made-up 0%
  expect(r[0]!.bench).toBeCloseTo(0.1, 12); // only Monday is an account day: the index +10% (Fri 100 -> Mon 110)
  expect(allInBench(days, bench).map((p) => p.date)).toEqual(['2024-01-29']);
});

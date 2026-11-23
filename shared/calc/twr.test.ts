/// <reference types="bun" />
/// <reference types="node" />
/// <reference lib="esnext" />
import { describe, expect, test } from 'bun:test';
import { annualize, buildDailyPortfolio, chain, compareWithSite, DailyFund, dailyReturn, fundBegin, periodReturns } from './twr';

const row = (date: string, fund: string, o: Partial<DailyFund>): DailyFund => ({
  date, fund, begUnits: 0, begPrice: 0, endUnits: 0, endPrice: 0, endValue: 0, contributions: 0, transfersIn: 0, transfersOut: 0, mvc: 0, ...o,
});

describe('daily returns and NAV', () => {
  test('dailyReturn: flow invested at the close, begin <= 0 -> 0', () => {
    expect(dailyReturn(10000, 11500, 500)).toBeCloseTo(0.1, 12);
    expect(dailyReturn(0, 5000, 5000)).toBe(0);
    expect(dailyReturn(-1, 5000, 0)).toBe(0);
  });
  test('portfolio: contributions external, transfers cancel, NAV from 100', () => {
    const days = buildDailyPortfolio([
      // day 2: $10 contribution into A, $55 moved A -> B, A ends 66.00, B 56.00 (B rose $1 after the transfer)
      row('2024-06-04', 'A', { begUnits: 10, begPrice: 11, endValue: 6600, contributions: 1000, transfersOut: -5500 }),
      row('2024-06-04', 'B', { endValue: 5600, transfersIn: 5500 }),
      row('2024-06-03', 'A', { begUnits: 10, begPrice: 10, endUnits: 10, endPrice: 11, endValue: 11000, mvc: 1000 }),
    ]);
    expect(days.map((d) => d.date)).toEqual(['2024-06-03', '2024-06-04']);
    expect(days[0]).toMatchObject({ begin: 10000, end: 11000, externalFlow: 0, internalFlow: 0 });
    expect(days[0]!.nav).toBeCloseTo(110, 10);
    expect(days[1]).toMatchObject({ begin: 11000, end: 12200, externalFlow: 1000, internalFlow: 0 });
    expect(days[1]!.dayReturn).toBeCloseTo(200 / 11000, 12);
    expect(days[1]!.nav).toBeCloseTo(112, 10); // 100 x 1.1 x (1 + 200 / 11000)
    expect(days[1]!.funds).toEqual(['A', 'B']);
  });
  test('a transfer still in transit is not a loss', () => {
    const [d] = buildDailyPortfolio([row('2024-06-03', 'A', { begUnits: 100, begPrice: 1, endValue: 5000, transfersOut: -5000 })]);
    expect(d!.internalFlow).toBe(-5000);
    expect(d!.dayReturn).toBe(0);
  });
  test('chain and annualize', () => {
    expect(chain([0.1, -0.1])).toBeCloseTo(-0.01, 12);
    expect(chain([])).toBe(0);
    expect(annualize(0.21, 730)).toBeCloseTo(0.1, 12);
    expect(annualize(0.1, 365)).toBeCloseTo(0.1, 12);
    expect(annualize(0.5, 0)).toBe(0);
  });
});

describe('reconciliation with the site', () => {
  const day = (date: string, dayReturn: number) => ({ date, begin: 1, end: 1, externalFlow: 0, internalFlow: 0, mvc: 0, dayReturn, nav: 0, funds: [] });
  const months = periodReturns([day('2024-06-27', 0.1), day('2024-06-28', 0.1), day('2024-07-01', -0.5)]);
  test('per-month chained returns', () => {
    expect(months.map((m) => [m.key, m.from, m.to])).toEqual([['2024-06', '2024-06-27', '2024-06-28'], ['2024-07', '2024-07-01', '2024-07-01']]);
    expect(months[0]!.ret).toBeCloseTo(0.21, 12);
    expect(months[1]!.ret).toBeCloseTo(-0.5, 12);
    expect(periodReturns([day('2024-06-28', 0.1), day('2024-07-01', 0.1)], '1Y')[0]!.ret).toBeCloseTo(0.21, 12);
  });
  test('differences above 0.05 percentage points are flagged', () => {
    const c = compareWithSite(months, [{ key: '2024-06', personalRoR: 21.03 }, { key: '2024-07', personalRoR: -49.9 }]);
    expect(c[0]!.diffPct).toBeCloseTo(-0.03, 9);
    expect(c[0]!.flag).toBe(false);
    expect(c[1]!.diffPct).toBeCloseTo(-0.1, 9);
    expect(c[1]!.flag).toBe(true);
    expect(compareWithSite(months, [])[0]).toMatchObject({ sitePct: null, diffPct: null, flag: false });
    expect(compareWithSite(months, [{ key: '2024-06', personalRoR: 21.05 }])[0]!.flag).toBe(false); // exactly 0.05 is fine
  });
});

test('fundBegin prefers the site begin value of the day', () => {
  const row = { date: '2024-06-14', fund: 'A', begUnits: 3, begPrice: 3.333333, endUnits: 3, endPrice: 3.4, endValue: 1020, contributions: 0, transfersIn: 0, transfersOut: 0, mvc: 20 };
  expect(fundBegin(row)).toBe(1000); // 3 x 3.333333 x 100 = 999.9999
  expect(fundBegin({ ...row, begValue: 1001 })).toBe(1001);
});

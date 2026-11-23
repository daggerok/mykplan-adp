/// <reference types="bun" />
/// <reference types="node" />
/// <reference lib="esnext" />
import { describe, expect, test } from 'bun:test';
import { fundContributions, priceOn, pricesByFund, rebalanceCounterfactual, rebalanceCounterfactualSeries } from './attribution';
import { DailyFund } from './twr';

const row = (date: string, fund: string, endPrice: number, mvc: number): DailyFund => ({
  date, fund, begUnits: 0, begPrice: 0, endUnits: 0, endPrice, endValue: 0, contributions: 0, transfersIn: 0, transfersOut: 0, mvc,
});
const rows = [row('2024-01-02', 'A', 10, 100), row('2024-01-02', 'B', 20, -50), row('2024-01-03', 'A', 12, 200), row('2024-01-03', 'B', 22, 0)];

describe('attribution', () => {
  test('fund contribution = sum of MVC, with its share of the total', () => {
    expect(fundContributions(rows)).toEqual([{ fund: 'A', mvc: 300, share: 1.2 }, { fund: 'B', mvc: -50, share: -0.2 }]);
    expect(fundContributions(rows, '2024-01-03')).toEqual([{ fund: 'A', mvc: 200, share: 1 }, { fund: 'B', mvc: 0, share: 0 }]);
  });
  test('price lookup: last price on or before the date', () => {
    const p = pricesByFund(rows);
    expect(priceOn(p.A!, '2024-01-01')).toBeNull();
    expect(priceOn(p.A!, '2024-01-02')).toBe(10);
    expect(priceOn(p.A!, '2024-01-31')).toBe(12);
  });
  test('rebalance A -> B of $1,000: B rose 10 %, A would have risen 20 %', () => {
    const p = pricesByFund(rows);
    const r = { date: '2024-01-02', fromFund: 'A', toFund: 'B', amount: 100000 };
    // kept 100 units of A at $12 = $1,200; bought 50 units of B at $22 = $1,100
    expect(rebalanceCounterfactual(r, p, '2024-01-03')).toEqual({ asOf: '2024-01-03', unitsKept: 100, unitsBought: 50, actual: 110000, counterfactual: 120000, difference: -10000 });
    expect(rebalanceCounterfactualSeries(r, p).map((o) => o.difference)).toEqual([0, -10000]);
    expect(rebalanceCounterfactual({ ...r, toFund: 'X' }, p, '2024-01-03')).toBeNull();
  });
});

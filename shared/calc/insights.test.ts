/// <reference types="bun" />
/// <reference types="node" />
/// <reference lib="esnext" />
import { describe, expect, test } from 'bun:test';
import { buyTheDip, purchasePriceStats } from './insights';

describe('buy the dip', () => {
  const series = [
    { date: '2024-01-01', value: 100 },
    { date: '2024-01-10', value: 90 }, // -10 %
    { date: '2024-01-20', value: 80 }, // -20 %
    { date: '2024-01-25', value: 75 }, // -25 %
  ];
  test('share of contributions made deeper than 5, 10, 20 % below the peak', () => {
    const b = buyTheDip([
      { date: '2024-01-26', amount: 1000 },
      { date: '2023-12-31', amount: 500 }, // before the series: not in a dip
      { date: '2024-01-05', amount: 500 },
      { date: '2024-01-12', amount: 1000 },
      { date: '2024-01-22', amount: 2000 },
    ], series);
    expect(b).toEqual([
      { threshold: 0.05, count: 3, amount: 4000, share: 0.8 },
      { threshold: 0.1, count: 2, amount: 3000, share: 0.6 },
      { threshold: 0.2, count: 1, amount: 1000, share: 0.2 },
    ]);
  });
  test('average purchase price against the average price', () => {
    const s = purchasePriceStats(
      [{ date: '2024-01-01', amount: 10000, units: 10 }, { date: '2024-01-03', amount: 10000, units: 5 }],
      [{ date: '2024-01-01', price: 10 }, { date: '2024-01-02', price: 15 }, { date: '2024-01-03', price: 20 }, { date: '2024-01-04', price: 99 }],
    )!;
    expect(s.avgPurchasePrice).toBeCloseTo(200 / 15, 12);
    expect(s.avgPrice).toBe(15);
    expect(s.advantage).toBeCloseTo(0.125, 12);
    expect(purchasePriceStats([], [])).toBeNull();
  });
});

/// <reference types="bun" />
/// <reference types="node" />
/// <reference lib="esnext" />
import { describe, expect, test } from 'bun:test';
import { annualizedVolatility, bootstrap, cagr, mean, percentile, roundCents, seriesCagr, stdev } from './stats';

describe('stats', () => {
  test('mean and sample stdev', () => {
    expect(mean([2, 4, 4, 4, 5, 5, 7, 9])).toBe(5);
    expect(stdev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(Math.sqrt(32 / 7), 12);
    expect(stdev([1])).toBe(0);
    expect(mean([])).toBe(0);
  });
  test('cagr: 100 -> 121 over two years = 10 %', () => {
    expect(cagr(100, 121, 730)).toBeCloseTo(0.1, 12);
    expect(seriesCagr([{ date: '2023-01-01', value: 100 }, { date: '2024-01-01', value: 110 }])).toBeCloseTo(0.1, 12);
    expect(cagr(0, 10, 365)).toBeNull();
    expect(seriesCagr([])).toBeNull();
  });
  test('annualized volatility = stdev x sqrt(252)', () => {
    expect(annualizedVolatility([0.01, -0.01])).toBeCloseTo(Math.sqrt(0.0002) * Math.sqrt(252), 12);
  });
  test('percentile interpolates; roundCents', () => {
    expect(percentile([4, 1, 3, 2], 50)).toBe(2.5);
    expect(percentile([1, 2, 3, 4], 10)).toBeCloseTo(1.3, 12);
    expect(percentile([1, 2, 3, 4], 100)).toBe(4);
    expect(roundCents(1234.5)).toBe(1235);
  });
  test('bootstrap draws with replacement through the rng', () => {
    const seq = [0, 0.5, 0.99, 0.26];
    let i = 0;
    expect(bootstrap(['a', 'b', 'c', 'd'], 4, () => seq[i++]!)).toEqual(['a', 'c', 'd', 'b']);
    expect(bootstrap([], 3, Math.random)).toEqual([]);
  });
});

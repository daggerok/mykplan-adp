/// <reference types="bun" />
/// <reference types="node" />
/// <reference lib="esnext" />
import { describe, expect, test } from 'bun:test';
import { xirr } from './xirr';

describe('xirr', () => {
  test('one year, +10 %', () => {
    expect(xirr([{ date: '2023-01-01', amount: -100000 }, { date: '2024-01-01', amount: 110000 }])).toBeCloseTo(0.1, 9);
  });
  test('leap year: 366 days -> 1.1^(365 / 366) - 1', () => {
    expect(xirr([{ date: '2024-01-01', amount: -1000 }, { date: '2025-01-01', amount: 1100 }])).toBeCloseTo(Math.pow(1.1, 365 / 366) - 1, 9);
  });
  test('several contributions: the rate zeroes the NPV', () => {
    const flows = [{ date: '2024-01-01', amount: -1000 }, { date: '2024-07-01', amount: -1000 }, { date: '2025-01-01', amount: 2200 }];
    const r = xirr(flows)!;
    const npv = -1000 - 1000 / Math.pow(1 + r, 182 / 365) + 2200 / Math.pow(1 + r, 366 / 365);
    expect(Math.abs(npv)).toBeLessThan(1e-6);
    expect(r).toBeGreaterThan(0.12);
    expect(r).toBeLessThan(0.14);
  });
  test('a hopeless guess falls back to bisection; a loss gives a negative rate', () => {
    expect(xirr([{ date: '2023-01-01', amount: -100000 }, { date: '2024-01-01', amount: 110000 }], -0.999999)).toBeCloseTo(0.1, 9);
    expect(xirr([{ date: '2023-01-01', amount: -100000 }, { date: '2024-01-01', amount: 50000 }])).toBeCloseTo(-0.5, 9);
  });
  test('no sign change -> null', () => {
    expect(xirr([{ date: '2023-01-01', amount: -100 }, { date: '2024-01-01', amount: -100 }])).toBeNull();
    expect(xirr([{ date: '2023-01-01', amount: 100 }])).toBeNull();
    expect(xirr([])).toBeNull();
  });
});

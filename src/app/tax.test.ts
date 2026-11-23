/// <reference types="bun" />
/// <reference lib="esnext" />
import { expect, test } from 'bun:test';
import { bracketHint, bracketRange, bracketYears, combinedRate, njRateAt, njRateFor } from './tax';

test('bracket ranges from the IRS thresholds', () => {
  expect(bracketRange(2026, 0.22, 'single')).toBe('$50,401 - $105,700');
  expect(bracketRange(2027, 0.24, 'joint')).toBe('$218,251 - $416,650');
  expect(bracketRange(2026, 0.1, 'single')).toBe('$0 - $12,400');
  expect(bracketRange(2027, 0.37, 'single')).toBe('over $661,375');
  expect(bracketRange(2030, 0.22, 'single')).toBeNull();
});

test('this year plus the published future years; the latest known year when the table is behind', () => {
  expect(bracketYears('2026-11-22')).toEqual([2026, 2027]);
  expect(bracketYears('2027-03-01')).toEqual([2027]);
  expect(bracketYears('2029-01-01')).toEqual([2027]);
  const hint = bracketHint(0.12, '2026-11-22').split('\n');
  expect(hint.slice(0, 5)).toEqual(['17.525% = federal 12% + NJ 5.525%', '', 'Federal 12% bracket, taxable income:',
    '2026: single $12,401 - $50,400, joint $24,801 - $100,800', '2027: single $12,801 - $52,025, joint $25,601 - $104,050']);
  expect(hint[6]).toBe('NJ 5.525% (every year): single $40,001 - $75,000, joint $80,001 - $150,000');
});

test('NJ rate that goes with each federal bracket, and the combined rate', () => {
  expect(njRateAt(50400, 'single')).toBe(0.05525);
  expect(njRateAt(75000, 'single')).toBe(0.05525);
  expect(njRateAt(75001, 'single')).toBe(0.0637);
  expect(njRateAt(100800, 'joint')).toBe(0.05525);
  expect([0.12, 0.22, 0.24].map((r) => njRateFor(r, 2026))).toEqual([0.05525, 0.0637, 0.0637]);
  expect([0.12, 0.22, 0.24].map((r) => njRateFor(r, 2027))).toEqual([0.05525, 0.0637, 0.0637]);
  expect([0.12, 0.22, 0.24].map((r) => combinedRate(r, '2026-11-22').total)).toEqual([0.17525, 0.2837, 0.3037]);
});

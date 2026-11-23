/// <reference types="bun" />
/// <reference types="node" />
/// <reference lib="esnext" />
import { describe, expect, test } from 'bun:test';
import { formatMoney, parseDecimal, parseMoney, parsePercent } from './money';

describe('parseMoney', () => {
  test.each([
    ['$1,234.56', 123456],
    ['1234.5', 123450],
    ['(1,234.56)', -123456],
    ['($0.07)', -7],
    ['-$1.00', -100],
    ['$-2.50', -250],
    ['0.10', 10],
    ['$0.005', 1],
    ['1,234.564', 123456],
    ['  $12  ', 1200],
    ['$1,000,000.00', 100000000],
  ])('%s -> %d', (text, cents) => expect(parseMoney(text)).toBe(cents));
  test.each(['', '-', '--', 'N/A', 'abc', '$', '.'])('%p -> null', (text) => expect(parseMoney(text)).toBeNull());
  test('no float drift', () => expect(parseMoney('0.29')).toBe(29));
});

describe('parseDecimal and parsePercent', () => {
  test('units and prices keep their decimals', () => {
    expect(parseDecimal('1,234.5678')).toBe(1234.5678);
    expect(parseDecimal('(0.5)')).toBe(-0.5);
    expect(parseDecimal('')).toBeNull();
  });
  test('percent points', () => {
    expect(parsePercent('12.34%')).toBe(12.34);
    expect(parsePercent('(1.5%)')).toBe(-1.5);
  });
});

test('formatMoney', () => {
  expect(formatMoney(123456)).toBe('$1,234.56');
  expect(formatMoney(-7)).toBe('-$0.07');
  expect(formatMoney(0)).toBe('$0.00');
});

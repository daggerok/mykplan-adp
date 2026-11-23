/// <reference types="bun" />
/// <reference types="node" />
/// <reference lib="esnext" />
import { describe, expect, test } from 'bun:test';
import { addDays, daysBetween, endOfMonth, isWeekend, monthWindows, parseDate, periodKey, toUsDate } from './dates';

describe('parseDate', () => {
  test.each([
    ['05/12/2023', '2023-05-12'],
    ['5/2/2023', '2023-05-02'],
    ['19-Nov-2026', '2026-11-19'],
    ['Nov 19 2026', '2026-11-19'],
    ['Mar 10 1999', '1999-03-10'],
    ['Nov 19, 2026', '2026-11-19'],
    ['2004-01-30', '2004-01-30'],
    ['2026-11-19T00:00:00Z', '2026-11-19'],
    ['11/20/2026', '2026-11-20'],
  ])('%s -> %s', (text, iso) => expect(parseDate(text)).toBe(iso));
  test.each(['', '13/01/2026', '02/30/2026', 'Foo 1 2026', '2026-02-29'])('%p -> null', (t) => expect(parseDate(t)).toBeNull());
  test('leap day', () => expect(parseDate('02/29/2024')).toBe('2024-02-29'));
});

test('toUsDate, addDays, daysBetween, endOfMonth, isWeekend', () => {
  expect(toUsDate('2023-05-12')).toBe('05/12/2023');
  expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
  expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  expect(daysBetween('2020-01-01', '2021-01-01')).toBe(366);
  expect(endOfMonth('2024-02-10')).toBe('2024-02-29');
  expect(isWeekend('2026-11-21')).toBe(true);
  expect(isWeekend('2026-11-20')).toBe(false);
});

test('periodKey', () => {
  expect(periodKey('2026-11-21', '1W')).toBe('2026-11-16'); // Saturday -> Monday
  expect(periodKey('2026-11-16', '1W')).toBe('2026-11-16');
  expect(periodKey('2026-11-22', '1W')).toBe('2026-11-16'); // Sunday belongs to the week before
  expect(periodKey('2026-11-21', '1M')).toBe('2026-11');
  expect(periodKey('2026-11-21', '1Q')).toBe('2026-Q4');
  expect(periodKey('2026-03-31', '1Q')).toBe('2026-Q1');
  expect(periodKey('2026-11-21', '1Y')).toBe('2026');
});

test('monthWindows clips the first and last month', () => {
  expect(monthWindows('2023-05-12', '2023-07-03')).toEqual([
    { from: '2023-05-12', to: '2023-05-31' },
    { from: '2023-06-01', to: '2023-06-30' },
    { from: '2023-07-01', to: '2023-07-03' },
  ]);
  expect(monthWindows('2023-05-12', '2023-05-12')).toEqual([{ from: '2023-05-12', to: '2023-05-12' }]);
  expect(monthWindows('2023-05-12', '2026-11-21')).toHaveLength(43);
});

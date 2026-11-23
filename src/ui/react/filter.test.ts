/// <reference types="bun" />
/// <reference types="node" />
/// <reference lib="esnext" />
import { expect, test } from 'bun:test';
import { rowMatches, toCsv } from './filter';

test('filter syntax', () => {
  const row = ['2024-06-14', 'Contribution - Employee Roth 401k', 'State Street Equity 500', '$50.00'];
  expect(rowMatches(row, '')).toBe(true);
  expect(rowMatches(row, 'roth 2024')).toBe(true);
  expect(rowMatches(row, 'roth !state')).toBe(false);
  expect(rowMatches(row, 'match,roth')).toBe(true);
  expect(rowMatches(row, '=$50.00')).toBe(true);
  expect(rowMatches(row, '^contribution')).toBe(true);
  expect(rowMatches(row, '^roth')).toBe(false);
});

test('csv quoting', () => {
  expect(toCsv(['a', 'b'], [['1,2', 'say "hi"']])).toBe('a,b\n"1,2","say ""hi"""');
});

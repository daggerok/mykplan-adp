/// <reference types="bun" />
/// <reference types="node" />
/// <reference lib="esnext" />
import { expect, test } from 'bun:test';
import { loadFixture } from '../../../tests/fixtures/benchmarks/load';
import { adapterFor, generic, navDist, vanguard, yahoo } from '.';

test('generic with Adj Close equals the yahoo adapter (SCHD) and the vanguard one (VTV)', () => {
  expect(generic(loadFixture('SCHD'))).toEqual(yahoo(loadFixture('SCHD')));
  expect(generic(loadFixture('VTV'))).toEqual(vanguard(loadFixture('VTV')));
  expect(generic(loadFixture('SCHD')).points.length).toBe(10);
});

test('generic without Adj Close reinvests distributions on the Close column it picked (SMH market price)', () => {
  const r = generic(loadFixture('SMH'));
  expect(r.warnings).toEqual([]);
  expect(r.points[0]!.close).toBe(352.9); // Close wins over NAV
  expect(r.points[0]!.nav).toBe(352.8291);
  const at = (d: string) => r.points.filter((x) => x.date === d)[0]!;
  expect(at('2025-12-22').tr / at('2025-12-21').tr).toBeCloseTo((359.7 + 1.1047) / 356.23, 12);
});

test('generic on a NAV-only feed matches navDist (SPY)', () => {
  expect(generic(loadFixture('SPY'))).toEqual(navDist(loadFixture('SPY')));
});

test('generic with neither Adj Close nor distributions: price return and a warning', () => {
  const r = generic({ ticker: 'X', history: { headers: ['As Of', 'Market Price'], rows: [['11/19/2026', 10], ['11/20/2026', 11]] } });
  expect(r.points.map((x) => x.tr)).toEqual([10, 11]);
  expect(r.warnings[0]).toContain('tr is the price return of Market Price');
});

test('generic without a date or price column', () => {
  expect(generic({ ticker: 'X', history: { headers: ['Close'], rows: [] } }).warnings[0]).toContain('no Date column');
  expect(generic({ ticker: 'X', history: { headers: ['Date', 'Volume'], rows: [] } }).warnings[0]).toContain('no Close, Price or NAV column');
});

test('adapterFor maps config names and falls back to generic', () => {
  expect(adapterFor('navDist')).toBe(navDist);
  expect(adapterFor('yahoo')).toBe(yahoo);
  expect(adapterFor('vanguard')).toBe(vanguard);
  expect(adapterFor('nope')).toBe(generic);
  expect(adapterFor(undefined)).toBe(generic);
  expect(adapterFor('toString')).toBe(generic);
});

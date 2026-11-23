/// <reference types="bun" />
/// <reference types="node" />
/// <reference lib="esnext" />
import { describe, expect, test } from 'bun:test';
import { loadFixture } from '../../../tests/fixtures/benchmarks/load';
import type { FeedInput } from '../types';
import { navDist } from '.';

describe('navDist on SPY (SPDR: newest first, "19-Nov-2026", distributions as arrays)', () => {
  const r = navDist(loadFixture('SPY'));
  const p = r.points;

  test('ascending ISO days, close = nav = NAV, no warnings', () => {
    expect(r.warnings).toEqual([]);
    expect(p.length).toBe(12);
    expect(p[0]!.date).toBe('2026-09-10');
    expect(p[11]!.date).toBe('2026-09-25');
    p.forEach((x, i) => { if (i) expect(x.date > p[i - 1]!.date).toBe(true); });
    expect(p[0]).toEqual({ ticker: 'SPY', date: '2026-09-10', close: 757.81886, nav: 757.81886, tr: 757.81886 });
  });

  test('tr follows NAV, and on the ex-date 2026-09-18 reinvests the 1.888834 dividend', () => {
    const at = (d: string) => p.filter((x) => x.date === d)[0]!;
    expect(at('2026-09-17').tr / p[0]!.tr).toBeCloseTo(762.633118 / 757.81886, 12);
    const ratio = at('2026-09-18').tr / at('2026-09-17').tr;
    expect(ratio).toBeCloseTo((762.011402 + 1.888834) / 762.633118, 12);
    expect(p[11]!.close).toBe(771.353332);
    expect(p[11]!.tr).toBeCloseTo(773.2653222873771, 9); // 1.91 above NAV after one dividend
  });

  test('distributions before the first day (06/18, 03/20) are ignored', () => {
    const noDist = navDist({ ...loadFixture('SPY'), distributions: undefined }).points;
    expect(p[5]!.tr).toBeCloseTo(noDist[5]!.tr, 12); // 2026-09-17, before the ex-date
  });
});

describe('navDist on SMH (VanEck: "Nov 19 2026", "$1.1047", weekend rows, distributions as objects)', () => {
  const r = navDist(loadFixture('SMH'));

  test('17 calendar days kept, NAV not the market Close, dividend reinvested on Dec 22', () => {
    expect(r.warnings).toEqual([]);
    expect(r.points.length).toBe(17);
    expect(r.points[0]!.date).toBe('2025-12-15');
    expect(r.points[16]!.close).toBe(360.1102);
    expect(r.points[16]!.tr).toBeCloseTo(361.2158908256679, 9);
  });
});

describe('navDist edge cases', () => {
  const base = (rows: Array<Record<string, string>>, dist?: string[][]): FeedInput => ({
    ticker: 'X',
    history: { headers: ['Date', 'NAV'], rows },
    distributions: dist ? { headers: ['Ex-Date', 'Dividend', 'ST Cap Gains', 'LT Cap Gains'], rows: dist } : undefined,
  });

  test('an ex-date without a row goes to the next day; dividend and capital gains add up', () => {
    const r = navDist(base([
      { Date: '01/02/2026', NAV: '100' },
      { Date: '01/05/2026', NAV: '99' },
    ], [['01/03/2026', '0.5', '0.25', '-'], ['12/31/2025', '9', '-', '-'], ['01/09/2026', '9', '-', '-']]));
    expect(r.points.map((x) => x.tr)).toEqual([100, 99.75]);
  });

  test('duplicate dates keep the last row, bad rows are skipped and reported', () => {
    const r = navDist(base([
      { Date: '01/05/2026', NAV: '101' },
      { Date: 'not a date', NAV: '1' },
      { Date: '01/02/2026', NAV: '100' },
      { Date: '01/05/2026', NAV: '102' },
      { Date: '01/06/2026', NAV: '-' },
    ], [['??', '1', '-', '-'], ['01/07/2026', '-', '-', '-']]));
    expect(r.points.map((x) => [x.date, x.close])).toEqual([['2026-01-02', 100], ['2026-01-05', 102]]);
    expect(r.warnings.length).toBe(4);
    expect(r.warnings.join('\n')).toContain('row 5 2026-01-06 skipped: no NAV');
  });

  test('no NAV column -> no points and a warning', () => {
    const r = navDist({ ticker: 'X', history: { headers: ['Date', 'Close'], rows: [{ Date: '01/02/2026', Close: '1' }] } });
    expect(r.points).toEqual([]);
    expect(r.warnings[0]).toContain('no NAV column');
  });
});

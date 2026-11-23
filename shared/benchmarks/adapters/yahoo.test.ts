/// <reference types="bun" />
/// <reference types="node" />
/// <reference lib="esnext" />
import { describe, expect, test } from 'bun:test';
import { loadFixture } from '../../../tests/fixtures/benchmarks/load';
import { yahoo } from '.';

describe('yahoo on QQQ (Invesco: oldest first, "Sep 14 2026", text cells)', () => {
  const r = yahoo(loadFixture('QQQ'));
  const p = r.points;

  test('close = Close, no OHLC or nav, tr starts at the first close', () => {
    expect(r.warnings).toEqual([]);
    expect(p.length).toBe(13);
    expect(p[0]).toEqual({ ticker: 'QQQ', date: '2026-09-14', close: 709.179993, tr: 709.179993 });
  });

  test('tr moves with Adj Close: the 09/21 dividend is already inside it', () => {
    expect(p[12]!.date).toBe('2026-09-30');
    expect(p[12]!.tr).toBeCloseTo(740.54271839762, 9);
    expect(p[12]!.tr / p[0]!.tr).toBeCloseTo(739.77 / 708.44, 12);
    expect(p[12]!.tr).toBeGreaterThan(p[12]!.close);
  });
});

test('yahoo sorts, keeps the last duplicate and reports rows without Adj Close', () => {
  const r = yahoo({
    ticker: 'X',
    history: {
      headers: ['Date', 'Close', 'Adj Close', 'Volume'],
      rows: [
        ['Jan 05 2026', '11', '10', '1'],
        ['Jan 02 2026', '20', '10', '1'],
        ['Jan 05 2026', '22', '11', '1'],
        ['Jan 06 2026', '23', '', '1'],
      ],
    },
  });
  expect(r.points.map((x) => [x.date, x.close, x.tr])).toEqual([['2026-01-02', 20, 20], ['2026-01-05', 22, 22]]);
  expect(r.warnings).toEqual(['X row 4 2026-01-06 skipped: no Adj Close']);
});

test('yahoo without an Adj Close column -> no points and a warning', () => {
  const r = yahoo({ ticker: 'X', history: { headers: ['Date', 'Close'], rows: [] } });
  expect(r.points).toEqual([]);
  expect(r.warnings[0]).toContain('no Adj Close column');
});

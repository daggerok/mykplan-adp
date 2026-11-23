/// <reference types="bun" />
/// <reference types="node" />
/// <reference lib="esnext" />
import { describe, expect, test } from 'bun:test';
import { candles, ohlc, Point } from './ohlc';

// 2026-11-02 and 2026-11-09 are Mondays
const pts: Point[] = [
  { date: '2026-11-02', value: 10, volume: 100 },
  { date: '2026-11-03', value: 12 },
  { date: '2026-11-04', value: 9, volume: 50 },
  { date: '2026-11-09', value: 11 },
  { date: '2026-11-10', value: 8, volume: 25 },
];

describe('ohlc', () => {
  test('weekly candles: the open is the previous close and joins H/L', () => {
    expect(candles(pts, '1W')).toEqual([
      { key: '2026-11-02', date: '2026-11-02', open: 10, high: 12, low: 9, close: 9, volume: 150 },
      { key: '2026-11-09', date: '2026-11-09', open: 9, high: 11, low: 8, close: 8, volume: 25 },
    ]);
  });
  test('the open counts in high and low', () => {
    const c = candles([{ date: '2026-10-30', value: 20 }, { date: '2026-11-02', value: 10 }, { date: '2026-11-03', value: 12 }], '1M');
    expect(c[1]).toMatchObject({ key: '2026-11', open: 20, high: 20, low: 10, close: 12, volume: 0 });
  });
  test('quarter and year buckets', () => {
    expect(candles(pts, '1Q').map((c) => c.key)).toEqual(['2026-Q4']);
    expect(candles(pts, '1Y')[0]).toMatchObject({ key: '2026', open: 10, high: 12, low: 8, close: 8, volume: 175 });
  });
  test('1D returns the points unchanged; empty input -> no candles', () => {
    const s = ohlc(pts, '1D');
    expect(s.kind).toBe('line');
    if (s.kind === 'line') expect(s.points).toBe(pts);
    expect(ohlc(pts, '1W').kind).toBe('candles');
    expect(candles([], '1W')).toEqual([]);
  });
});

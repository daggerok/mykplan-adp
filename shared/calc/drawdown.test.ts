/// <reference types="bun" />
/// <reference types="node" />
/// <reference lib="esnext" />
import { describe, expect, test } from 'bun:test';
import { drawdownSeries, maxDrawdown } from './drawdown';

const s = (vals: number[]) => vals.map((value, i) => ({ date: '2024-01-' + String(i + 1).padStart(2, '0'), value }));

describe('drawdown', () => {
  test('series: value / running peak - 1', () => {
    expect(drawdownSeries(s([100, 120, 90, 130])).map((p) => [p.peak, p.drawdown])).toEqual([[100, 0], [120, 0], [120, -0.25], [130, 0]]);
  });
  test('max drawdown with peak, trough and recovery', () => {
    expect(maxDrawdown(s([100, 120, 90, 110, 115, 120, 125, 60, 70]))).toEqual({
      depth: 60 / 125 - 1, peakDate: '2024-01-07', troughDate: '2024-01-08', recoveryDate: null,
    });
    expect(maxDrawdown(s([100, 120, 90, 110, 130, 125]))).toEqual({ depth: -0.25, peakDate: '2024-01-02', troughDate: '2024-01-03', recoveryDate: '2024-01-05' });
  });
  test('no fall and no data', () => {
    expect(maxDrawdown(s([1, 2, 3]))).toEqual({ depth: 0, peakDate: '2024-01-01', troughDate: '2024-01-01', recoveryDate: null });
    expect(maxDrawdown([])).toBeNull();
  });
});

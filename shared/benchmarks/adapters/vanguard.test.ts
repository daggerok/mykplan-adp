/// <reference types="bun" />
/// <reference types="node" />
/// <reference lib="esnext" />
import { describe, expect, test } from 'bun:test';
import { loadFixture } from '../../../tests/fixtures/benchmarks/load';
import { vanguard } from '.';

describe('vanguard on VTV (ISO dates, number cells, official NAV on recent rows)', () => {
  const r = vanguard(loadFixture('VTV'));
  const p = r.points;

  test('OHLC, nav and tr scaled to the first close', () => {
    expect(r.warnings).toEqual([]);
    expect(p.length).toBe(11);
    expect(p[0]).toEqual({
      ticker: 'VTV', date: '2026-09-22',
      open: 222.2100067138672, high: p[0]!.high!, low: p[0]!.low!,
      close: 221.66000366210938, nav: 221.6, tr: 221.66000366210938,
    });
    expect(p[0]!.high!).toBeGreaterThanOrEqual(p[0]!.low!);
    expect(p[10]!.tr).toBeCloseTo(220.02246828335106, 9);
  });
});

test('vanguard skips the month-end NAV-only rows (weekends, Close null) with a warning', () => {
  const headers = ['Date', 'Open', 'High', 'Low', 'Close', 'Adj Close', 'Volume', 'NAV', 'Market Price', 'Premium/Discount (%)', 'Source'];
  const r = vanguard({
    ticker: 'VTV',
    history: {
      headers,
      rows: [
        { Date: '2026-10-30', Open: 2, High: 3, Low: 1, Close: 2, 'Adj Close': 1, Volume: 5, NAV: null, 'Market Price': null, 'Premium/Discount (%)': null, Source: 'yahoo-fallback' },
        { Date: '2026-10-31', Open: null, High: null, Low: null, Close: null, 'Adj Close': null, Volume: null, NAV: 228, 'Market Price': null, 'Premium/Discount (%)': null, Source: 'vanguard-official' },
        { Date: '2026-11-02', Open: 2, High: 3, Low: 1, Close: 3, 'Adj Close': 1.5, Volume: 5, NAV: 3.01, 'Market Price': 3, 'Premium/Discount (%)': 0, Source: 'vanguard-official' },
      ],
    },
  });
  expect(r.points.map((x) => [x.date, x.tr, x.nav])).toEqual([['2026-10-30', 2, undefined], ['2026-11-02', 3, 3.01]]);
  expect(r.warnings).toEqual(['VTV row 2 2026-10-31 skipped: no Close']);
});

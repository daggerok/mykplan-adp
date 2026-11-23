/// <reference lib="esnext" />
// Candles from daily closes (the plan section 7, Chart): O = close of the previous period (the first period opens at
// its first value), H and L = max and min including O, C = last close, volume = sum of a per-day number
// (contributions). 1D is a line: the points come back unchanged
import { periodKey, Timeframe } from '../dates';

export interface Point {
  date: string;
  value: number;
  volume?: number;
}

export interface Candle {
  key: string;
  date: string; // first day of the bucket that has data: the time of the candle on the chart
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type OhlcSeries = { kind: 'line'; points: Point[] } | { kind: 'candles'; candles: Candle[] };

// Points must be sorted by date
export function candles(points: Point[], tf: Timeframe): Candle[] {
  const out: Candle[] = [];
  let cur: Candle | null = null;
  for (const p of points) {
    const key = periodKey(p.date, tf);
    if (!cur || cur.key !== key) {
      const open: number = cur ? cur.close : p.value;
      if (cur) out.push(cur);
      cur = { key, date: p.date, open, high: open, low: open, close: open, volume: 0 };
    }
    cur.high = Math.max(cur.high, p.value);
    cur.low = Math.min(cur.low, p.value);
    cur.close = p.value;
    cur.volume += p.volume || 0;
  }
  if (cur) out.push(cur);
  return out;
}

export function ohlc(points: Point[], tf: Timeframe): OhlcSeries {
  return tf === '1D' ? { kind: 'line', points } : { kind: 'candles', candles: candles(points, tf) };
}

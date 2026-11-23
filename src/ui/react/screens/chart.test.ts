/// <reference types="bun" />
/// <reference types="node" />
/// <reference lib="esnext" />
import { expect, test } from 'bun:test';
import { onCandles } from './ChartScreen';

test('a daily benchmark line lands on the candle days with the bucket close', () => {
  const daily = [
    { date: '2026-11-09', value: 1 }, { date: '2026-11-13', value: 2 },
    { date: '2026-11-16', value: 3 }, { date: '2026-11-20', value: 4 },
    { date: '2026-11-23', value: 5 },
  ];
  expect(onCandles(daily, '1W', ['2026-11-10', '2026-11-16'])).toEqual([{ date: '2026-11-10', value: 2 }, { date: '2026-11-16', value: 4 }]);
  expect(onCandles(daily, '1D', [])).toBe(daily);
});

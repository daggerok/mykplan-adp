/// <reference lib="esnext" />
// What the numbers on a price scale mean (owner 2026-11-22: "where is % where is $"): every scale label carries its
// unit, and the legend says it once per line. No chart library import here, so the helpers test without a browser
export type Unit = '%' | '$' | 'index';

export function formatUnit(unit: Unit): (v: number) => string {
  if (unit === '%') return (v) => `${v.toFixed(Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 10 ? 1 : 2)}%`;
  if (unit === '$') return (v) => (Math.abs(v) >= 1000 ? `$${Math.round(v).toLocaleString('en-US')}` : `$${v.toFixed(2)}`);
  return (v) => v.toFixed(Math.abs(v) >= 1000 ? 0 : 1);
}

export const priceFormat = (unit: Unit) => ({ type: 'custom' as const, formatter: formatUnit(unit), minMove: 0.01 });

// room right of the last bar, so the value labels on the scale never sit on the newest data: about 5% of the bars,
// kept as the time scale's own option so a double click on the time axis (reset) leaves the same room (owner 2026-11-22)
export const roomFor = (bars: number): number => Math.max(3, Math.round(bars * 0.05));

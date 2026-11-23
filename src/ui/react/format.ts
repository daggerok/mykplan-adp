/// <reference lib="esnext" />
export const usd = (cents: number | null | undefined): string =>
  cents === null || cents === undefined ? '—' : (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
export const pct = (fraction: number | null | undefined, digits = 2): string =>
  fraction === null || fraction === undefined || !Number.isFinite(fraction) ? '—' : `${(fraction * 100).toFixed(digits)}%`;
export const pts = (points: number | null | undefined, digits = 2): string =>
  points === null || points === undefined ? '—' : `${points.toFixed(digits)}%`;

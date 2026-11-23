/// <reference lib="esnext" />
// Drawdown of a value series (NAV, a fund price, a benchmark): dd = value / running peak - 1 (0 at a new high,
// -0.2 = 20 % below the peak)
export interface DrawdownPoint {
  date: string;
  value: number;
  peak: number;
  drawdown: number;
}

export interface MaxDrawdown {
  depth: number; // negative fraction, 0 when the series never fell
  peakDate: string;
  troughDate: string;
  recoveryDate: string | null; // first date back at or above the peak, null while still under water
}

// Points must be sorted by date
export function drawdownSeries(points: Array<{ date: string; value: number }>): DrawdownPoint[] {
  let peak = -Infinity;
  return points.map((p) => {
    if (p.value > peak) peak = p.value;
    return { date: p.date, value: p.value, peak, drawdown: peak > 0 ? p.value / peak - 1 : 0 };
  });
}

export function maxDrawdown(points: Array<{ date: string; value: number }>): MaxDrawdown | null {
  if (points.length === 0) return null;
  const dd = drawdownSeries(points);
  let peakIdx = 0;
  let best: MaxDrawdown = { depth: 0, peakDate: dd[0]!.date, troughDate: dd[0]!.date, recoveryDate: null };
  let bestPeakIdx = 0;
  let bestTroughIdx = 0;
  for (let i = 0; i < dd.length; i++) {
    if (dd[i]!.value >= dd[peakIdx]!.value) peakIdx = i;
    if (dd[i]!.drawdown < best.depth) {
      best = { depth: dd[i]!.drawdown, peakDate: dd[peakIdx]!.date, troughDate: dd[i]!.date, recoveryDate: null };
      bestPeakIdx = peakIdx;
      bestTroughIdx = i;
    }
  }
  if (best.depth === 0) return best;
  const peakValue = dd[bestPeakIdx]!.value;
  for (let i = bestTroughIdx + 1; i < dd.length; i++) {
    if (dd[i]!.value >= peakValue) { best.recoveryDate = dd[i]!.date; break; }
  }
  return best;
}

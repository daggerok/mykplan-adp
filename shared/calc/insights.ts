/// <reference lib="esnext" />
// Insights, "buy the dip" (the plan section 7): which share of the contributions went in while the portfolio or a
// benchmark was in a drawdown deeper than 5, 10, 20 %, and the average purchase price against the average price
import { Flow } from './dietz';
import { drawdownSeries } from './drawdown';
import { mean } from './stats';

export interface DipBucket {
  threshold: number; // 0.05 = deeper than 5 %
  count: number;
  amount: number; // cents
  share: number; // of the contributed amount, 0..1
}

export interface PurchasePriceStats {
  avgPurchasePrice: number; // dollars per unit: invested / units
  avgPrice: number; // plain mean of the daily prices over [from, to]
  advantage: number; // avgPrice / avgPurchasePrice - 1: > 0 means the purchases were cheaper than average
}

// Drawdown on a contribution day = drawdown of the series at the last date on or before it; contributions
// before the series starts are counted as not in a dip
export function buyTheDip(contributions: Flow[], series: Array<{ date: string; value: number }>, thresholds: number[] = [0.05, 0.1, 0.2]): DipBucket[] {
  const dd = drawdownSeries(series);
  const flows = contributions.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const depths: number[] = [];
  let j = -1;
  let total = 0;
  for (const f of flows) {
    while (j + 1 < dd.length && dd[j + 1]!.date <= f.date) j++;
    depths.push(j < 0 ? 0 : -dd[j]!.drawdown);
    total += f.amount;
  }
  return thresholds.map((threshold) => {
    let count = 0, amount = 0;
    flows.forEach((f, i) => { if (depths[i]! > threshold) { count++; amount += f.amount; } });
    return { threshold, count, amount, share: total === 0 ? 0 : amount / total };
  });
}

// Purchases carry money (cents) and units; prices are daily dollar prices. The period defaults to the first and
// last purchase dates
export function purchasePriceStats(purchases: Array<{ date: string; amount: number; units: number }>, prices: Array<{ date: string; price: number }>, from?: string, to?: string): PurchasePriceStats | null {
  let money = 0, units = 0;
  let first = '', last = '';
  for (const p of purchases) {
    money += p.amount;
    units += p.units;
    if (!first || p.date < first) first = p.date;
    if (!last || p.date > last) last = p.date;
  }
  if (units <= 0) return null;
  const a = from || first, b = to || last;
  const window = prices.filter((p) => p.date >= a && p.date <= b).map((p) => p.price);
  if (window.length === 0) return null;
  const avgPurchasePrice = money / 100 / units;
  const avgPrice = mean(window);
  return { avgPurchasePrice, avgPrice, advantage: avgPrice / avgPurchasePrice - 1 };
}

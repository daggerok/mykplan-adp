/// <reference lib="esnext" />
// Chart builder (M8b, the plan section 7): several series and panes on one time axis, described by a layout.
// Pure: layout + derived data + loaded benchmarks -> series per pane. Layouts are saved in localStorage
import { drawdownSeries } from '../../shared/calc/drawdown';
import type { Dataset } from '../../shared/dataset';
import type { Derived } from './derive';

export interface Layout {
  name: string;
  main: Array<'nav' | 'value' | `fund:${string}` | `bench:${string}`>;
  percentFrom: boolean; // every main series as % change from the first shown day
  contributions: boolean; // pane: EE and ER bars per paycheck + contribution % steps
  drawdown: boolean; // pane: drawdown of the portfolio and the benchmarks
  from?: string; // first day; whole history when missing
}

export const PRESETS: Layout[] = [
  { name: 'Portfolio vs S&P', main: ['nav', 'bench:SPY'], percentFrom: true, contributions: false, drawdown: true },
  { name: 'Buy the dip', main: ['nav', 'bench:SPY'], percentFrom: true, contributions: true, drawdown: true },
  { name: 'Contributions', main: ['value'], percentFrom: false, contributions: true, drawdown: false },
];

export interface BuiltSeries {
  pane: number;
  kind: 'line' | 'histogram' | 'step';
  name: string;
  color: string;
  scale?: string; // separate price scale inside a pane (the % step line next to the bars)
  unit: '%' | '$' | 'index'; // what the numbers mean: shown on the scale and in the legend
  data: Array<{ date: string; value: number }>;
}

const COLORS = ['#2563eb', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#64748b', '#84cc16', '#f97316', '#0ea5e9'];

export function fundPrices(ds: Dataset, fund: string): Array<{ date: string; value: number }> {
  return ds.dailyFunds.filter((r) => r.fund === fund && r.endPrice > 0).map((r) => ({ date: r.date, value: r.endPrice }));
}

const cut = (data: Array<{ date: string; value: number }>, from?: string) => (from ? data.filter((p) => p.date >= from) : data);
const rebase = (data: Array<{ date: string; value: number }>) => {
  const first = data[0]?.value;
  return first ? data.map((p) => ({ date: p.date, value: (p.value / first - 1) * 100 })) : data;
};

export function buildSeries(layout: Layout, d: Derived, ds: Dataset, benches: Record<string, Array<{ date: string; value: number }>>): BuiltSeries[] {
  const out: BuiltSeries[] = [];
  const mainData = (id: Layout['main'][number]) =>
    id === 'nav' ? d.nav : id === 'value' ? d.value : id.startsWith('fund:') ? fundPrices(ds, id.slice(5)) : benches[id.slice(6)] ?? [];
  const label = (id: string) => (id === 'nav' ? 'Portfolio' : id === 'value' ? 'Value $' : id.startsWith('fund:') ? id.slice(5).split(' - ')[0]! : id.slice(6));
  layout.main.forEach((id, i) => {
    const data = cut(mainData(id), layout.from);
    // percent from the start when asked; otherwise dollars for the value and fund prices, the index (100 = start) for the rest
    const unit = layout.percentFrom ? '%' : id === 'value' || id.startsWith('fund:') ? '$' : 'index';
    out.push({ pane: 0, kind: 'line', name: label(id), color: COLORS[i % COLORS.length]!, unit, data: layout.percentFrom ? rebase(data) : data });
  });
  let pane = 1;
  if (layout.contributions) {
    const pays = d.paychecks.filter((p) => !layout.from || p.payCheckDate >= layout.from);
    out.push({ pane, kind: 'histogram', name: 'EE + ER', color: '#2563eb', unit: '$', data: pays.map((p) => ({ date: p.payCheckDate, value: p.total / 100 })) });
    out.push({ pane, kind: 'histogram', name: 'ER', color: '#16a34a', unit: '$', data: pays.map((p) => ({ date: p.payCheckDate, value: (p.ER_MATCH + p.ER_NEC) / 100 })) });
    // the step line covers the shown days only: the level on the start day comes from the last change before it,
    // and the last level is held up to the last day of the data
    const lastDay = d.nav[d.nav.length - 1]?.date ?? '9999-12-31';
    const all = ds.rates.map((r) => ({ date: r.date, value: r.rothPct + r.preTaxPct })).filter((p) => p.date <= lastDay);
    const steps = all.filter((p) => !layout.from || p.date >= layout.from);
    const before = layout.from ? all.filter((p) => p.date < layout.from!).pop() : undefined;
    if (before && (!steps.length || steps[0]!.date > layout.from!)) steps.unshift({ date: layout.from!, value: before.value });
    const lastStep = steps[steps.length - 1];
    if (lastStep && d.nav.length && lastDay > lastStep.date) steps.push({ date: lastDay, value: lastStep.value });
    out.push({ pane, kind: 'step', name: 'Contribution %', color: '#f59e0b', scale: 'pct', unit: '%', data: steps });
    pane++;
  }
  if (layout.drawdown) {
    layout.main.forEach((id, i) => {
      if (id === 'value') return; // dollars include contributions: not a drawdown
      const data = cut(mainData(id), layout.from);
      out.push({ pane, kind: 'line', name: `${label(id)} drawdown`, color: COLORS[i % COLORS.length]!, unit: '%', data: drawdownSeries(data).map((p) => ({ date: p.date, value: p.drawdown * 100 })) });
    });
  }
  return out;
}

const KEY = 'mykplan-adp-layouts';
export function loadLayouts(storage: Pick<Storage, 'getItem'> | undefined = globalThis.localStorage): Layout[] {
  try { const v = storage?.getItem(KEY); return v ? (JSON.parse(v) as Layout[]) : PRESETS; } catch { return PRESETS; }
}
export function saveLayouts(list: Layout[], storage: Pick<Storage, 'setItem'> | undefined = globalThis.localStorage): void {
  try { storage?.setItem(KEY, JSON.stringify(list)); } catch { /* private window */ }
}

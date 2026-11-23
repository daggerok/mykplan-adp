/// <reference lib="esnext" />
// Several panes on one time axis for the chart builder (M8b): lines, histograms and step lines per pane
import { HistogramSeries, LineSeries, createChart, type IChartApi, type ISeriesApi, type Time } from 'lightweight-charts';
import { PAGE_SCROLLS, RIGHT_ROOM } from './chart';
import { priceFormat, roomFor, type Unit } from './units';
import { t } from '../app/i18n';
import { mountLegend, type LegendGroup } from './legend';

export interface PaneSeries {
  pane: number;
  kind: 'line' | 'histogram' | 'step';
  name: string;
  color: string;
  scale?: string;
  unit: Unit;
  data: Array<{ date: string; value: number }>;
}

const css = (name: string, fallback: string) => {
  try { return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback; } catch { return fallback; }
};
// panes looked merged (owner 2026-11-22): a clear separator line between them, the main pane twice as tall as the
// extra ones, and room above and below every pane's lines so their scale labels do not touch the neighbour's
const theme = () => ({
  layout: {
    background: { color: css('--chart-bg', '#ffffff') }, textColor: css('--chart-text', '#334155'),
    panes: { separatorColor: css('--chart-text', '#334155'), separatorHoverColor: css('--line', '#2563eb'), enableResize: true },
  },
  grid: { vertLines: { color: css('--chart-grid', '#e2e8f0') }, horzLines: { color: css('--chart-grid', '#e2e8f0') } },
});

// the unit after the name, unless the name already says it ("Contribution %")
const withUnit = (x: PaneSeries): string => {
  const unit = x.unit === 'index' ? t('100 = start') : x.unit;
  return x.name.endsWith(unit) ? x.name : `${x.name}, ${unit}`;
};

const MARGINS = { scaleMargins: { top: 0.12, bottom: 0.08 } };

export interface PanesHandle { set(series: PaneSeries[]): void; applyTheme(): void; destroy(): void }

export function mountPanes(el: HTMLElement): PanesHandle {
  const chart: IChartApi = createChart(el, { autoSize: true, ...theme(), ...PAGE_SCROLLS, timeScale: { borderVisible: false, ...RIGHT_ROOM }, rightPriceScale: { borderVisible: false } });
  const legend = mountLegend(el);
  let named: PaneSeries[] = [];
  // one legend per pane, at the pane's top: the pane heights change with the window, so they are measured again
  const placeLegend = () => {
    let top = 0;
    const groups: LegendGroup[] = chart.panes().map((p, i) => {
      // past a left scale, when the pane has one (the contribution % pane)
      const left = named.some((x) => x.pane === i && x.scale) ? chart.priceScale('left', i).width() : 0;
      const g = { top, left, items: named.filter((x) => x.pane === i).map((x) => ({ name: withUnit(x), color: x.color })) };
      top += p.getHeight() + 1;
      return g;
    });
    legend.set(groups);
  };
  const resize = new ResizeObserver(() => requestAnimationFrame(placeLegend));
  resize.observe(el);
  let live: Array<ISeriesApi<'Line'> | ISeriesApi<'Histogram'>> = [];
  return {
    set(series) {
      live.forEach((s) => chart.removeSeries(s));
      live = series.map((x) => {
        const data = x.data.map((p) => ({ time: p.date as Time, value: p.value }));
        if (x.kind === 'histogram') {
          const s = chart.addSeries(HistogramSeries, { color: x.color, priceFormat: priceFormat(x.unit) }, x.pane);
          s.setData(data);
          return s;
        }
        const s = chart.addSeries(LineSeries, { color: x.color, lineWidth: 2, priceFormat: priceFormat(x.unit), lineType: x.kind === 'step' ? 1 : 0, priceScaleId: x.scale ? 'left' : 'right' }, x.pane);
        s.setData(data);
        if (x.scale) s.priceScale().applyOptions({ ...MARGINS, visible: true, borderVisible: false });
        return s;
      });
      chart.panes().forEach((p, i) => {
        p.setStretchFactor(i === 0 ? 2 : 1);
        chart.priceScale('right', i).applyOptions(MARGINS);
      });
      chart.timeScale().applyOptions({ rightOffset: roomFor(Math.max(0, ...series.map((x) => x.data.length))) });
      chart.timeScale().fitContent();
      named = series;
      requestAnimationFrame(placeLegend);
    },
    applyTheme() { chart.applyOptions(theme()); placeLegend(); },
    destroy() { resize.disconnect(); legend.destroy(); chart.remove(); },
  };
}

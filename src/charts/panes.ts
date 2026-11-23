/// <reference lib="esnext" />
// Several panes on one time axis for the chart builder (M8b): lines, histograms and step lines per pane
import { HistogramSeries, LineSeries, createChart, type IChartApi, type ISeriesApi, type Time } from 'lightweight-charts';

export interface PaneSeries {
  pane: number;
  kind: 'line' | 'histogram' | 'step';
  name: string;
  color: string;
  scale?: string;
  data: Array<{ date: string; value: number }>;
}

const css = (name: string, fallback: string) => {
  try { return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback; } catch { return fallback; }
};
const theme = () => ({
  layout: { background: { color: css('--chart-bg', '#ffffff') }, textColor: css('--chart-text', '#334155') },
  grid: { vertLines: { color: css('--chart-grid', '#e2e8f0') }, horzLines: { color: css('--chart-grid', '#e2e8f0') } },
});

export interface PanesHandle { set(series: PaneSeries[]): void; applyTheme(): void; destroy(): void }

export function mountPanes(el: HTMLElement): PanesHandle {
  const chart: IChartApi = createChart(el, { autoSize: true, ...theme(), timeScale: { borderVisible: false }, rightPriceScale: { borderVisible: false } });
  let live: Array<ISeriesApi<'Line'> | ISeriesApi<'Histogram'>> = [];
  return {
    set(series) {
      live.forEach((s) => chart.removeSeries(s));
      live = series.map((x) => {
        const data = x.data.map((p) => ({ time: p.date as Time, value: p.value }));
        if (x.kind === 'histogram') {
          const s = chart.addSeries(HistogramSeries, { color: x.color, title: x.name }, x.pane);
          s.setData(data);
          return s;
        }
        const s = chart.addSeries(LineSeries, { color: x.color, lineWidth: 2, title: x.name, lineType: x.kind === 'step' ? 1 : 0, priceScaleId: x.scale ? 'left' : 'right' }, x.pane);
        s.setData(data);
        if (x.scale) chart.priceScale('left', x.pane).applyOptions({ visible: true, borderVisible: false });
        return s;
      });
      chart.timeScale().fitContent();
    },
    applyTheme() { chart.applyOptions(theme()); },
    destroy() { chart.remove(); },
  };
}

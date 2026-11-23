/// <reference lib="esnext" />
// The only module that talks to lightweight-charts: mount, set data, set theme, destroy (the plan section 3).
// Colors come from CSS variables (--chart-bg, --chart-grid, --chart-text, --up, --down, --line, --band) so a theme
// switch is applyOptions, not a rebuild
import {
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type SeriesMarker,
  type Time,
} from 'lightweight-charts';

export interface LinePoint { date: string; value: number }
export interface CandlePoint { date: string; open: number; high: number; low: number; close: number }
export interface ChartMarker { date: string; kind: 'contribution' | 'rate' | 'rebalance'; text: string }
export interface Overlay { name: string; color: string; data: LinePoint[] }
export interface BarPoint { date: string; value: number; up: boolean }

const css = (name: string, fallback: string) => {
  try { return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback; } catch { return fallback; }
};

function themeOptions() {
  return {
    layout: { background: { color: css('--chart-bg', '#ffffff') }, textColor: css('--chart-text', '#334155') },
    grid: { vertLines: { color: css('--chart-grid', '#e2e8f0') }, horzLines: { color: css('--chart-grid', '#e2e8f0') } },
  };
}

export interface ChartHandle {
  setLine(data: LinePoint[]): void;
  setCandles(data: CandlePoint[]): void;
  setBars(data: BarPoint[]): void; // a histogram as the main series: green up, red down
  setVolume(data: LinePoint[]): void;
  setMarkers(markers: ChartMarker[]): void;
  setOverlays(overlays: Overlay[]): void;
  setLog(on: boolean): void;
  applyTheme(): void;
  fit(): void;
  destroy(): void;
}

export function mountChart(el: HTMLElement): ChartHandle {
  const chart: IChartApi = createChart(el, { autoSize: true, ...themeOptions(), rightPriceScale: { borderVisible: false }, timeScale: { borderVisible: false } });
  let main: ISeriesApi<'Line'> | ISeriesApi<'Candlestick'> | ISeriesApi<'Histogram'> | null = null;
  let markers: ISeriesMarkersPluginApi<Time> | null = null;
  let lastMarkers: ChartMarker[] = [];
  const volume = chart.addSeries(HistogramSeries, { priceScaleId: 'volume', priceFormat: { type: 'volume' }, color: css('--band', 'rgba(37,99,235,.2)') });
  chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });
  let overlays: Array<ISeriesApi<'Line'>> = [];

  const replaceMain = (next: ISeriesApi<'Line'> | ISeriesApi<'Candlestick'> | ISeriesApi<'Histogram'>) => {
    if (main) chart.removeSeries(main);
    main = next;
    markers = createSeriesMarkers(main, []);
    paintMarkers();
  };
  const paintMarkers = () => {
    if (!markers) return;
    const list: Array<SeriesMarker<Time>> = lastMarkers.map((m) => ({
      time: m.date as Time,
      position: m.kind === 'contribution' ? 'belowBar' : 'aboveBar',
      shape: m.kind === 'contribution' ? 'arrowUp' : m.kind === 'rate' ? 'circle' : 'square',
      color: m.kind === 'contribution' ? css('--up', '#16a34a') : m.kind === 'rate' ? css('--line', '#2563eb') : css('--down', '#dc2626'),
      text: m.kind === 'contribution' ? '' : m.text,
    }));
    markers.setMarkers(list);
  };

  return {
    setLine(data) {
      const s = chart.addSeries(LineSeries, { color: css('--line', '#2563eb'), lineWidth: 2 });
      s.setData(data.map((p) => ({ time: p.date as Time, value: p.value })));
      replaceMain(s);
    },
    setCandles(data) {
      const s = chart.addSeries(CandlestickSeries, { upColor: css('--up', '#16a34a'), downColor: css('--down', '#dc2626'), wickUpColor: css('--up', '#16a34a'), wickDownColor: css('--down', '#dc2626'), borderVisible: false });
      s.setData(data.map((c) => ({ time: c.date as Time, open: c.open, high: c.high, low: c.low, close: c.close })));
      replaceMain(s);
    },
    setBars(data) {
      const s = chart.addSeries(HistogramSeries, { priceFormat: { type: 'price', precision: 2, minMove: 0.01 } });
      s.setData(data.map((p) => ({ time: p.date as Time, value: p.value, color: p.up ? css('--up', '#16a34a') : css('--down', '#dc2626') })));
      replaceMain(s);
    },
    setVolume(data) { volume.setData(data.map((p) => ({ time: p.date as Time, value: p.value }))); },
    setMarkers(m) { lastMarkers = m; paintMarkers(); },
    setOverlays(list) {
      overlays.forEach((s) => chart.removeSeries(s));
      overlays = list.map((o) => {
        const s = chart.addSeries(LineSeries, { color: o.color, lineWidth: 1, title: o.name });
        s.setData(o.data.map((p) => ({ time: p.date as Time, value: p.value })));
        return s;
      });
    },
    setLog(on) { chart.priceScale('right').applyOptions({ mode: on ? 1 : 0 }); },
    applyTheme() {
      chart.applyOptions(themeOptions());
      volume.applyOptions({ color: css('--band', 'rgba(37,99,235,.2)') });
      paintMarkers();
    },
    fit() { chart.timeScale().fitContent(); },
    destroy() { chart.remove(); },
  };
}

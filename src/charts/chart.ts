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
import { mountLegend, type LegendItem } from './legend';
import { formatUnit, roomFor, type Unit } from './units';
import { attachView, type ViewControls } from './view';
export { roomFor } from './units';

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
  setVolume(data: LinePoint[], name?: string): void; // contributions per candle; the name goes into the legend
  setMarkers(markers: ChartMarker[]): void;
  setOverlays(overlays: Overlay[]): void;
  setUnit(unit: Unit, name?: string): void; // the scale's unit and the main series' legend line
  setLog(on: boolean): void;
  applyTheme(): void;
  fit(): void;
  zoom: ViewControls['zoom'];
  pan: ViewControls['pan'];
  reset(): void; // the shown period over the full width and the lines over the full height
  destroy(): void;
}

// the mouse wheel scrolls the page, never the chart: over a chart it used to zoom, so the tables and the time axis
// below could not be reached (owner 2026-11-22: "we should be able to scroll down"). Zoom by dragging the time axis
// or a pinch, move by dragging the chart; vertical touch drags scroll the page too
export const PAGE_SCROLLS = {
  handleScroll: { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
  // a double click on the time axis is ours (view.ts: the period over the full width WITH the room on the right, like
  // gex), on a price axis the library's autoscale
  handleScale: { mouseWheel: false, pinch: true, axisPressedMouseMove: true, axisDoubleClickReset: { time: false, price: true } },
} as const;

export const RIGHT_ROOM = { rightOffset: 6 } as const;

export function mountChart(el: HTMLElement): ChartHandle {
  const chart: IChartApi = createChart(el, { autoSize: true, ...themeOptions(), ...PAGE_SCROLLS, rightPriceScale: { borderVisible: false }, timeScale: { borderVisible: false, ...RIGHT_ROOM } });
  const legend = mountLegend(el);
  let legendItems: LegendItem[] = [];
  let bars = 0;
  let mainItem: LegendItem | null = null;
  let barsItem: LegendItem | null = null;
  const paintLegend = () => legend.set([{ top: 0, items: [mainItem, ...legendItems, barsItem].filter((x): x is LegendItem => !!x) }]);
  const fitAll = () => {
    chart.timeScale().applyOptions({ rightOffset: roomFor(bars) });
    chart.timeScale().fitContent();
  };
  const view = attachView(chart, el, fitAll);
  let main: ISeriesApi<'Line'> | ISeriesApi<'Candlestick'> | ISeriesApi<'Histogram'> | null = null;
  let markers: ISeriesMarkersPluginApi<Time> | null = null;
  let lastMarkers: ChartMarker[] = [];
  // contributions per candle along the bottom, in their own color (--bars) and a fifth of the height: at 8% opacity
  // and a seventh of the height they were hard to see (owner 2026-11-23)
  const barsColor = () => css('--bars', 'rgba(16,185,129,.45)');
  const volume = chart.addSeries(HistogramSeries, { priceScaleId: 'volume', priceFormat: { type: 'volume' }, color: barsColor(), lastValueVisible: false, priceLineVisible: false });
  chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
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
      // rebalances in their own amber, not the down color: red squares read as losses (owner 2026-11-23)
      color: m.kind === 'contribution' ? css('--up', '#16a34a') : m.kind === 'rate' ? css('--line', '#2563eb') : css('--rebalance', '#f59e0b'),
      text: m.kind === 'contribution' ? '' : m.text,
    }));
    markers.setMarkers(list);
  };

  return {
    setLine(data) {
      bars = data.length;
      const s = chart.addSeries(LineSeries, { color: css('--line', '#2563eb'), lineWidth: 2 });
      s.setData(data.map((p) => ({ time: p.date as Time, value: p.value })));
      replaceMain(s);
    },
    setCandles(data) {
      bars = data.length;
      const s = chart.addSeries(CandlestickSeries, { upColor: css('--up', '#16a34a'), downColor: css('--down', '#dc2626'), wickUpColor: css('--up', '#16a34a'), wickDownColor: css('--down', '#dc2626'), borderVisible: false });
      s.setData(data.map((c) => ({ time: c.date as Time, open: c.open, high: c.high, low: c.low, close: c.close })));
      replaceMain(s);
    },
    setBars(data) {
      bars = data.length;
      const s = chart.addSeries(HistogramSeries, { priceFormat: { type: 'price', precision: 2, minMove: 0.01 } });
      s.setData(data.map((p) => ({ time: p.date as Time, value: p.value, color: p.up ? css('--up', '#16a34a') : css('--down', '#dc2626') })));
      replaceMain(s);
    },
    setVolume(data, name) {
      volume.setData(data.map((p) => ({ time: p.date as Time, value: p.value })));
      barsItem = name && data.length ? { name, color: barsColor() } : null;
      paintLegend();
    },
    setMarkers(m) { lastMarkers = m; paintMarkers(); },
    setOverlays(list) {
      overlays.forEach((s) => chart.removeSeries(s));
      overlays = list.map((o) => {
        const s = chart.addSeries(LineSeries, { color: o.color, lineWidth: 1 });
        s.setData(o.data.map((p) => ({ time: p.date as Time, value: p.value })));
        return s;
      });
      legendItems = list.map((o) => ({ name: o.name, color: o.color }));
      paintLegend();
    },
    setUnit(unit, name) {
      chart.applyOptions({ localization: { priceFormatter: formatUnit(unit) } });
      mainItem = name ? { name, color: css('--line', '#2563eb') } : null;
      paintLegend();
    },
    setLog(on) { chart.priceScale('right').applyOptions({ mode: on ? 1 : 0 }); },
    applyTheme() {
      chart.applyOptions(themeOptions());
      volume.applyOptions({ color: barsColor() });
      if (barsItem) barsItem = { ...barsItem, color: barsColor() };
      if (mainItem) mainItem = { ...mainItem, color: css('--line', '#2563eb') };
      paintMarkers();
      paintLegend();
    },
    fit: fitAll,
    zoom: view.zoom,
    pan: view.pan,
    reset: view.reset,
    destroy() { view.destroy(); legend.destroy(); chart.remove(); },
  };
}

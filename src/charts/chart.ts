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
  setVolume(data: LinePoint[]): void;
  setMarkers(markers: ChartMarker[]): void;
  setOverlays(overlays: Overlay[]): void;
  setUnit(unit: Unit, name?: string): void; // the scale's unit and the main series' legend line
  setLog(on: boolean): void;
  applyTheme(): void;
  fit(): void;
  destroy(): void;
}

// the mouse wheel scrolls the page, never the chart: over a chart it used to zoom, so the tables and the time axis
// below could not be reached (owner 2026-11-22: "we should be able to scroll down"). Zoom by dragging the time axis
// or a pinch, move by dragging the chart; vertical touch drags scroll the page too
export const PAGE_SCROLLS = {
  handleScroll: { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
  handleScale: { mouseWheel: false, pinch: true, axisPressedMouseMove: true, axisDoubleClickReset: true },
} as const;

export const RIGHT_ROOM = { rightOffset: 6 } as const;

export function mountChart(el: HTMLElement): ChartHandle {
  const chart: IChartApi = createChart(el, { autoSize: true, ...themeOptions(), ...PAGE_SCROLLS, rightPriceScale: { borderVisible: false }, timeScale: { borderVisible: false, ...RIGHT_ROOM } });
  const legend = mountLegend(el);
  let legendItems: LegendItem[] = [];
  let bars = 0;
  let mainItem: LegendItem | null = null;
  const paintLegend = () => legend.set([{ top: 0, items: mainItem ? [mainItem, ...legendItems] : legendItems }]);
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
    setVolume(data) { volume.setData(data.map((p) => ({ time: p.date as Time, value: p.value }))); },
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
      volume.applyOptions({ color: css('--band', 'rgba(37,99,235,.2)') });
      paintMarkers();
      paintLegend();
    },
    fit() {
      chart.timeScale().applyOptions({ rightOffset: roomFor(bars) });
      chart.timeScale().fitContent();
    },
    destroy() { legend.destroy(); chart.remove(); },
  };
}

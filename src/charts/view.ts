/// <reference lib="esnext" />
// Moving and zooming a chart the way gex does it (src/views/GexView.tsx zoom row and ChartView axis double click),
// owner 2026-11-23: "make same controls for chart like we have in gex ... +, -, move chart, zoom in/out":
// - buttons: move left, zoom out, reset, zoom in, move right (ChartFrame draws them under the chart)
// - a double click on the time axis spreads the shown period over the full width, with the room right of the last bar
// - a click on a price axis (not the end of a drag on it) spreads the lines over the full height again (autoscale);
//   a double click there does the same through the library
// - the reset button does both
// No React here: the screens get the functions through their chart handle
import type { IChartApi } from 'lightweight-charts';

export interface ViewControls {
  zoom(dir: 'in' | 'out'): void;
  pan(dir: -1 | 1): void;
  reset(): void;
  destroy(): void;
}

export const ZOOM_STEP = 0.7; // the shown bars after one zoom in: 70% of before (zoom out: the reverse)
export const PAN_STEP = 0.2; // one move: a fifth of the shown width

// the logical range after a zoom around its middle or a move by a share of its width (pure, tested)
export function zoomed(r: { from: number; to: number }, dir: 'in' | 'out'): { from: number; to: number } {
  const mid = (r.from + r.to) / 2;
  const half = ((r.to - r.from) / 2) * (dir === 'in' ? ZOOM_STEP : 1 / ZOOM_STEP);
  return { from: mid - half, to: mid + half };
}
export function panned(r: { from: number; to: number }, dir: -1 | 1): { from: number; to: number } {
  const step = (r.to - r.from) * PAN_STEP * dir;
  return { from: r.from + step, to: r.to + step };
}

export function attachView(chart: IChartApi, el: HTMLElement, fit: () => void): ViewControls {
  const ts = () => chart.timeScale();
  const autoScaleAll = () => chart.panes().forEach((_, i) => {
    chart.priceScale('right', i).applyOptions({ autoScale: true });
    chart.priceScale('left', i).applyOptions({ autoScale: true });
  });
  const area = (e: MouseEvent): 'time' | 'price' | 'plot' => {
    const r = el.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    if (y > r.height - ts().height()) return 'time';
    const right = chart.priceScale('right').width();
    const left = chart.priceScale('left').width();
    return x > r.width - right || (left > 0 && x < left) ? 'price' : 'plot';
  };
  let down: { x: number; y: number } | null = null;
  const onDown = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY }; };
  const onClick = (e: MouseEvent) => {
    const moved = down ? Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4 : false;
    if (!moved && area(e) === 'price') autoScaleAll();
  };
  const onDouble = (e: MouseEvent) => {
    if (area(e) !== 'time') return;
    fit();
    e.preventDefault();
  };
  el.addEventListener('pointerdown', onDown);
  el.addEventListener('click', onClick);
  el.addEventListener('dblclick', onDouble);
  const range = () => ts().getVisibleLogicalRange();
  return {
    zoom(dir) { const r = range(); if (r) ts().setVisibleLogicalRange(zoomed(r, dir)); },
    pan(dir) { const r = range(); if (r) ts().setVisibleLogicalRange(panned(r, dir)); },
    reset() { fit(); autoScaleAll(); },
    destroy() {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('click', onClick);
      el.removeEventListener('dblclick', onDouble);
    },
  };
}

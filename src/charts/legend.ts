/// <reference lib="esnext" />
// Names of the lines in the top-left corner of each pane, instead of series titles on the price scale: a title is
// drawn inside the plot next to the scale and hid the lines behind it (owner 2026-11-22: "I cannot see chart behind
// text ... or add legend"). The box ignores the pointer, so dragging and the crosshair work through it
export interface LegendItem { name: string; color: string }
export interface LegendGroup { top: number; left?: number; items: LegendItem[] }

const css = (name: string, fallback: string) => {
  try { return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback; } catch { return fallback; }
};

export interface LegendHandle { set(groups: LegendGroup[]): void; destroy(): void }

export function mountLegend(el: HTMLElement): LegendHandle {
  if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
  const layer = document.createElement('div');
  layer.dataset.chartLegend = '';
  layer.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:3';
  el.appendChild(layer);
  return {
    set(groups) {
      layer.replaceChildren(...groups.filter((g) => g.items.length).map((g) => {
        const box = document.createElement('div');
        box.style.cssText = `position:absolute;left:${(g.left ?? 0) + 8}px;top:${g.top + 6}px;display:flex;flex-wrap:wrap;gap:4px 10px;max-width:70%;padding:2px 6px;border-radius:6px;font:11px/16px system-ui,sans-serif;color:${css('--chart-text', '#334155')};background:color-mix(in srgb, ${css('--chart-bg', '#ffffff')} 80%, transparent)`;
        g.items.forEach((it) => {
          const row = document.createElement('span');
          row.style.cssText = 'display:inline-flex;align-items:center;gap:4px;white-space:nowrap';
          const dot = document.createElement('span');
          dot.style.cssText = `display:inline-block;width:10px;height:3px;border-radius:2px;background:${it.color}`;
          row.append(dot, document.createTextNode(it.name));
          box.appendChild(row);
        });
        return box;
      }));
    },
    destroy() { layer.remove(); },
  };
}

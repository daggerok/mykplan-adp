import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { t } from '../../app/i18n';

// The chart controls of gex (GexView zoom row, FullscreenButton, HelpButton), owner 2026-11-23: "make same controls for
// chart like we have in gex ... +, -, move chart, zoom in/out". Under the chart, in the middle: move left, zoom out,
// reset (↻), zoom in, move right; the "?" guide on the left, full screen on the right. The keyboard does the same while
// the chart has the focus (click it): arrows move, up and down or + and - zoom, Escape leaves full screen or resets.
export interface ViewHandle { zoom(dir: 'in' | 'out'): void; pan(dir: -1 | 1): void; reset(): void }

// gex's icon set (src/views/GexView.tsx ZOOM_ICON_SHAPES): strokes and heads in currentColor, so they follow the theme
type IconKind = 'plus' | 'minus' | 'reset' | 'left' | 'right';
const SHAPES: Record<IconKind, ReactNode> = {
  plus: <path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeWidth="2.6" />,
  minus: <path d="M5 12h14" fill="none" stroke="currentColor" strokeWidth="2.6" />,
  reset: (
    <>
      <path d="M5.6 9.6 A7 7 0 0 1 18.8 10.4" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M18.4 14.4 A7 7 0 0 1 5.2 13.6" fill="none" stroke="currentColor" strokeWidth="2" />
      <polygon points="15.6,10 22,10 18.8,13.8" fill="currentColor" />
      <polygon points="2,14 8.4,14 5.2,10.2" fill="currentColor" />
    </>
  ),
  left: (<><path d="M20 12H9" fill="none" stroke="currentColor" strokeWidth="2.6" /><polygon points="3,12 11,5.5 11,18.5" fill="currentColor" /></>),
  right: (<><path d="M4 12h11" fill="none" stroke="currentColor" strokeWidth="2.6" /><polygon points="21,12 13,5.5 13,18.5" fill="currentColor" /></>),
};
const Icon = ({ kind }: { kind: IconKind }) => <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" className="block">{SHAPES[kind]}</svg>;
const BTN = 'shrink-0 select-none rounded-md px-1.5 py-1 leading-none text-slate-500 hover:bg-slate-200/70 dark:text-slate-400 dark:hover:bg-slate-700/70';

// the "?" of gex: hover or focus shows the guide, a click pins it, a click outside closes it
function Guide({ lines }: { lines: string[] }) {
  const [hover, setHover] = useState(false);
  const [pinned, setPinned] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!pinned) return undefined;
    const off = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setPinned(false); };
    window.addEventListener('pointerdown', off);
    return () => window.removeEventListener('pointerdown', off);
  }, [pinned]);
  const open = hover || pinned;
  return (
    <span ref={wrap} className="relative inline-flex" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <button type="button" className={BTN} aria-label={t('Chart controls')} aria-expanded={open} onClick={() => setPinned((v) => !v)} onFocus={() => setHover(true)} onBlur={() => setHover(false)} data-chart-guide>
        <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" className="block">
          <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2.5" />
          <path d="M9.2 9.3a2.9 2.9 0 1 1 4.3 2.5c-.9.6-1.5 1.1-1.5 2.2" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="12" cy="17.2" r="1.5" fill="currentColor" />
        </svg>
      </button>
      {open && (
        <div className="absolute bottom-full left-0 z-30 mb-2 w-80 max-w-[80vw] space-y-1.5 rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-600 shadow-lg dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
          <div className="font-semibold">{t('Chart controls')}</div>
          {lines.map((l) => <p key={l}>{l}</p>)}
        </div>
      )}
    </span>
  );
}

export const chartGuide = (): string[] => [
  t('Drag the chart to move it; drag the dates under it or the numbers on the right to stretch or squeeze'),
  t('← and → move, − and + zoom out and in, ↻ puts the whole period back over the full width and height'),
  t('Double click the dates under the chart: the shown period over the full width, with room after the last bar'),
  t('Click (or double click) the numbers on the right: the lines over the full height again'),
  t('Click the chart, then: arrows move and zoom, + and - zoom, Escape resets or leaves full screen'),
  t('The mouse wheel scrolls the page, not the chart'),
];

export function ChartFrame({ elRef, view, className, data }: { elRef: RefObject<HTMLDivElement | null>; view: () => ViewHandle | null; className: string; data: string }) {
  const [full, setFull] = useState(false);
  const act = (f: (v: ViewHandle) => void) => () => { const v = view(); if (v) f(v); };
  const onKey = (e: React.KeyboardEvent) => {
    const v = view();
    if (!v) return;
    const keys: Record<string, () => void> = {
      ArrowLeft: () => v.pan(-1), ArrowRight: () => v.pan(1), ArrowUp: () => v.zoom('in'), ArrowDown: () => v.zoom('out'),
      '+': () => v.zoom('in'), '=': () => v.zoom('in'), '-': () => v.zoom('out'),
      Escape: () => (full ? setFull(false) : v.reset()),
    };
    const run = keys[e.key];
    if (run) { run(); e.preventDefault(); }
  };
  return (
    <section tabIndex={0} onKeyDown={onKey} data-chart-frame={full ? 'full' : 'inline'}
      className={`flex flex-col gap-1 outline-none ${full ? 'fixed inset-0 z-[60] bg-white p-3 dark:bg-slate-900' : className}`}>
      <div ref={elRef} className="relative min-h-0 w-full flex-1" {...{ [`data-${data}`]: '' }} />
      <div className="grid grid-cols-[1fr_auto_1fr] items-center">
        <div><Guide lines={chartGuide()} /></div>
        <div className="flex items-center gap-1" role="group" aria-label={t('Chart controls')}>
          <button type="button" className={BTN} title={t('Move left')} aria-label={t('Move left')} onClick={act((v) => v.pan(-1))}><Icon kind="left" /></button>
          <button type="button" className={BTN} title={t('Zoom out')} aria-label={t('Zoom out')} onClick={act((v) => v.zoom('out'))}><Icon kind="minus" /></button>
          <button type="button" className={BTN} title={t('Reset: the whole period over the full width and height')} aria-label={t('Reset: the whole period over the full width and height')} onClick={act((v) => v.reset())} data-chart-reset><Icon kind="reset" /></button>
          <button type="button" className={BTN} title={t('Zoom in')} aria-label={t('Zoom in')} onClick={act((v) => v.zoom('in'))}><Icon kind="plus" /></button>
          <button type="button" className={BTN} title={t('Move right')} aria-label={t('Move right')} onClick={act((v) => v.pan(1))}><Icon kind="right" /></button>
        </div>
        <div className="flex justify-end">
          <button type="button" className={BTN} title={full ? t('Leave full screen') : t('Full screen')} aria-label={full ? t('Leave full screen') : t('Full screen')} aria-pressed={full} onClick={() => setFull((v) => !v)} data-fullscreen-button>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {full ? <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" /> : <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />}
            </svg>
          </button>
        </div>
      </div>
    </section>
  );
}

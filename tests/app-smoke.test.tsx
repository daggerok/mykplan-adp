/// <reference types="bun" />
/// <reference types="node" />
/// <reference lib="esnext" />
// UI smoke on happy-dom: the shell renders, the theme button cycles light -> dark -> system and stores the mode,
// system mode follows the OS, the userscript mark lights its status dot
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, beforeAll, expect, mock, test } from 'bun:test';

// happy-dom has no canvas: the chart library is replaced by a stub, the shell is what this test checks
const series = () => ({ setData() {}, applyOptions() {} });
mock.module('lightweight-charts', () => ({
  createChart: () => ({ addSeries: series, removeSeries() {}, priceScale: () => ({ applyOptions() {} }), applyOptions() {}, timeScale: () => ({ fitContent() {}, applyOptions() {} }), panes: () => [], remove() {} }),
  createSeriesMarkers: () => ({ setMarkers() {} }),
  LineSeries: {}, CandlestickSeries: {}, HistogramSeries: {},
}));

let osDark = false;
const listeners = new Set<(e: { matches: boolean }) => void>();

beforeAll(() => {
  GlobalRegistrator.register({ url: 'http://localhost:1234/' });
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  window.matchMedia = ((q: string) => ({
    matches: osDark, media: q,
    addEventListener: (_: string, fn: (e: { matches: boolean }) => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: (e: { matches: boolean }) => void) => listeners.delete(fn),
  })) as unknown as typeof window.matchMedia;
  globalThis.matchMedia = window.matchMedia;
});
afterAll(() => GlobalRegistrator.unregister());

test('shell, theme cycle, system follow, userscript dot', async () => {
  const { act } = await import('react');
  const { createRoot } = await import('react-dom/client');
  const { App, SCREENS } = await import('../src/ui/react/App');
  const { THEME_KEY } = await import('../shared/theme');

  localStorage.setItem(THEME_KEY, 'light');
  document.body.innerHTML = '<div id="root"></div>';
  const root = createRoot(document.getElementById('root')!);
  await act(async () => root.render(<App />));

  const html = document.documentElement;
  // no data: no screens to switch to, only the run note
  expect(document.querySelectorAll('nav button')).toHaveLength(0);
  expect(document.querySelector('[data-empty-note]')).not.toBeNull();
  expect(html.classList.contains('dark')).toBe(false);

  const btn = () => document.querySelector<HTMLButtonElement>('[data-theme-button]')!;
  await act(async () => btn().click());
  expect(btn().dataset.themeButton).toBe('dark');
  expect(html.classList.contains('dark')).toBe(true);
  expect(localStorage.getItem(THEME_KEY)).toBe('dark');

  await act(async () => btn().click());
  expect(btn().dataset.themeButton).toBe('system');
  expect(html.classList.contains('dark')).toBe(false);
  await act(async () => { osDark = true; listeners.forEach((fn) => fn({ matches: true })); });
  expect(html.classList.contains('dark')).toBe(true);

  await act(async () => btn().click());
  expect(btn().dataset.themeButton).toBe('light');

  // ⬇ Sync and 🔄 Full in the toolbar: disabled without the script, then they post a command and open mykplan
  const runBtn = (m: string) => document.querySelector<HTMLButtonElement>(`[data-run-button="${m}"]`)!;
  expect(runBtn('sync').disabled).toBe(true);
  const posted: unknown[] = [];
  const opened: string[] = [];
  window.addEventListener('message', (e) => posted.push(e.data));
  window.open = ((url: string, name: string) => { opened.push(`${name} ${url}`); return null; }) as typeof window.open;

  const dot = () => document.querySelector<HTMLElement>('[data-status][title^="Userscript"]')!;
  expect(dot().dataset.status).toBe('off');
  await act(async () => { html.dataset.mykplanAdpUserscript = '0.1.0'; await new Promise((r) => setTimeout(r, 0)); });
  expect(dot().dataset.status).toBe('ok');
  expect(runBtn('full').disabled).toBe(false);
  await act(async () => { runBtn('full').click(); await new Promise((r) => setTimeout(r, 0)); });
  expect(posted).toContainEqual({ type: 'mykplan-adp:command', mode: 'full' });
  expect(opened).toEqual(['mykplan-adp-sync https://mykplan.adp.com/ParticipantSecure_Net/AccountHighlights.aspx']);
  // a live run shows ⏹ instead
  const { acceptRun } = await import('../src/app/data');
  await act(async () => acceptRun(JSON.stringify({ status: 'running', mode: 'full', done: 3, total: 10, current: null, message: null, at: Date.now() })));
  expect(runBtn('stop')).not.toBeNull();
  expect(document.querySelector('[data-run-button="full"]')).toBeNull();
  await act(async () => acceptRun(JSON.stringify({ status: 'stopped', mode: 'full', done: 3, total: 10, current: null, message: null, at: Date.now() })));

  // settings and log slide down under the toolbar (twitter style): settings open while there is no data
  const wrap = (id: string) => document.getElementById(id)!;
  const panelBtn = (name: string) => document.querySelector<HTMLButtonElement>(`[data-panel-button="${name}"]`)!;
  expect(wrap('settings-wrap').classList.contains('open')).toBe(true);
  expect(wrap('log-wrap').classList.contains('open')).toBe(false);
  expect(document.querySelector('[data-get-started="panel"]')).not.toBeNull();
  expect(document.querySelector('main [data-get-started]')).toBeNull(); // the steps live in the settings only
  expect(document.querySelector('[data-start-hint]')).toBeNull();
  await act(async () => panelBtn('settings').click());
  expect(wrap('settings-wrap').classList.contains('open')).toBe(false);
  expect(localStorage.getItem('mykplan-adp-panel-setup')).toBe('closed');
  // closed settings and no data: the hint points at them and opens them
  const hint = document.querySelector<HTMLButtonElement>('[data-start-hint]')!;
  expect(hint.textContent).toContain('Start here');
  await act(async () => hint.click());
  expect(wrap('settings-wrap').classList.contains('open')).toBe(true);
  await act(async () => panelBtn('settings').click());
  await act(async () => panelBtn('log').click());
  expect(wrap('log-wrap').classList.contains('open')).toBe(true);
  expect(panelBtn('log').getAttribute('aria-expanded')).toBe('true');

  // with data (the made-up demo set) the screens appear
  const { accept } = await import('../src/app/data');
  const { sampleDataset } = await import('../shared/sample');
  await act(async () => accept(JSON.stringify(sampleDataset('2024-03-29')), 'demo'));
  expect(Array.from(document.querySelectorAll('nav button')).map((b) => b.textContent)).toEqual([...SCREENS]);
  await act(async () => { const all = document.querySelectorAll<HTMLButtonElement>('nav button'); all[all.length - 1]!.click(); });
  expect(document.querySelector('main')!.dataset.screen).toBe('Forecast');
  await act(async () => root.unmount());
});

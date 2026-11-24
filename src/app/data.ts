/// <reference lib="esnext" />
// Where the dataset comes from and lives in the viewer: the userscript bridge (window message
// 'mykplan-adp:dataset'), Import JSON, and IndexedDB of the viewer origin for the next visit (offline)
import type { Dataset } from '../../shared/dataset';
import { createStore } from '../../shared/store';
import { contributionRates } from '../../shared/parse/journal';
import { t } from './i18n';

export interface Settings {
  birthDate: string | null; // optional override; the site's birth month is used without it
  retireAge: number;
  inflation: number;
  real: boolean;
  monteCarloPaths: number;
  benchmarks: string[];
  // chart colors chosen in ⚙️ (owner 2026-11-23: "bars candles colors also needs to be configurable"); empty = the theme's
  chartColors: ChartColors;
}

export interface ChartColors { up?: string; down?: string; line?: string; bars?: string }

// the CSS variables the charts read (src/charts/chart.ts): a chosen color wins over both themes; bars are see-through
export function chartColorVars(c: ChartColors): Record<string, string | null> {
  const rgba = (hex: string, a: number) => {
    const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
    return m ? `rgba(${parseInt(m[1]!, 16)}, ${parseInt(m[2]!, 16)}, ${parseInt(m[3]!, 16)}, ${a})` : null;
  };
  return { '--up': c.up ?? null, '--down': c.down ?? null, '--line': c.line ?? null, '--bars': c.bars ? rgba(c.bars, 0.35) : null };
}

export const DEFAULT_SETTINGS: Settings = {
  birthDate: null,
  retireAge: 67,
  inflation: 0.03,
  real: false,
  monteCarloPaths: 5000,
  benchmarks: ['SPY', 'QQQ', 'SMH', 'SOXQ', 'VTV', 'RSP', 'DIVO', 'SCHD'],
  chartColors: {},
};

const SETTINGS_KEY = 'mykplan-adp-settings';

export function loadSettings(storage: Pick<Storage, 'getItem'> | undefined = globalThis.localStorage): Settings {
  try {
    const raw = storage?.getItem(SETTINGS_KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(s: Settings, storage: Pick<Storage, 'setItem'> | undefined = globalThis.localStorage): void {
  try { storage?.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* private window */ }
}

export type Source = 'userscript' | 'import' | 'cache' | 'demo';
export const dataset = createStore<{ ds: Dataset | null; source: Source | null; error: string | null }>({ ds: null, source: null, error: null });
export const settings = createStore<Settings>(loadSettings());
settings.subscribe(() => saveSettings(settings.get()));

// the last run on mykplan, published by the userscript (RUN_KEY): running, done, paused, stopped or failed
export interface RunState { status: 'running' | 'done' | 'paused' | 'stopped' | 'failed'; mode: 'full' | 'sync'; done: number; total: number; current: string | null; message: string | null; at: number }
export const runState = createStore<RunState | null>(null);

// a run counts as going only while it updates: no update for 2 minutes means the mykplan tab was closed or reloaded
export const RUN_STALE_MS = 2 * 60 * 1000;
export function runIsLive(r: RunState | null, now = Date.now()): boolean {
  return !!r && r.status === 'running' && now - r.at < RUN_STALE_MS;
}

export function acceptRun(json: string): void {
  try { runState.set(JSON.parse(json) as RunState); } catch { /* ignore a broken message */ }
}

export function parseDataset(json: string): Dataset {
  const d = JSON.parse(json) as Dataset;
  if (!d || d.version !== 1 || !Array.isArray(d.transactions) || !Array.isArray(d.dailyFunds)) throw new Error(t('not a mykplan-adp dataset (version 1)'));
  // a partial or hand-made JSON may lack lists: they become empty, so no screen or writer trips over a missing one
  (['transactions', 'periods', 'dailyFunds', 'journal', 'journalDetails', 'rates', 'rebalances', 'documents', 'warnings'] as const).forEach((k) => {
    if (!Array.isArray(d[k])) (d as unknown as Record<string, unknown>)[k] = [];
  });
  // derived fields are recomputed here, so a fix in their rules reaches data built by an older script at once
  if (Array.isArray(d.journalDetails) && d.journalDetails.length) d.rates = contributionRates(d.journalDetails);
  return d;
}

const DB = 'mykplan-adp-viewer';
function idb<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB, 1);
    open.onupgradeneeded = () => open.result.createObjectStore('kv');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const req = fn(open.result.transaction('kv', mode).objectStore('kv'));
      req.onsuccess = () => resolve(req.result as T);
      req.onerror = () => reject(req.error);
    };
  });
}

async function remember(json: string): Promise<void> {
  try { await idb('readwrite', (s) => s.put(json, 'dataset')); } catch { /* storage blocked: works for this visit only */ }
}

export function accept(json: string, source: Source): void {
  try {
    const ds = parseDataset(json);
    const cur = dataset.get();
    // an older copy (cache arriving after the bridge) never replaces a newer one; real data always replaces the demo,
    // and the demo never replaces real data
    // the demo may cover real data only while that has no daily series yet (nothing to look at); hiding it brings
    // the real copy back from IndexedDB
    const realHasDays = !!cur.ds && cur.source !== 'demo' && cur.ds.dailyFunds.length > 0;
    if (source === 'demo' && realHasDays) return;
    if (cur.ds && cur.source !== 'demo' && source !== 'demo' && cur.ds.builtAt > ds.builtAt) return;
    dataset.set({ ds, source, error: null });
    if (source !== 'cache' && source !== 'demo') void remember(json);
  } catch (err) {
    dataset.set((s) => ({ ...s, error: err instanceof Error ? err.message : String(err) }));
  }
}

// made-up data to look around before the first sync; never stored, gone on reload
export async function showDemo(): Promise<void> {
  const { sampleDataset } = await import('../../shared/sample');
  accept(JSON.stringify(sampleDataset()), 'demo');
}

export function clearDemo(): void {
  if (dataset.get().source !== 'demo') return;
  dataset.set({ ds: null, source: null, error: null });
  loadCache();
}

function loadCache(): void {
  void idb<string | undefined>('readonly', (s) => s.get('dataset')).then((json) => { if (json) accept(json, 'cache'); }).catch(() => {});
}

export async function importFile(file: Blob): Promise<void> {
  accept(await file.text(), 'import');
}

export function startData(): void {
  window.addEventListener('message', (e) => {
    if (e.origin === location.origin && e.data && e.data.type === 'mykplan-adp:dataset' && typeof e.data.json === 'string') accept(e.data.json, 'userscript');
    if (e.origin === location.origin && e.data && e.data.type === 'mykplan-adp:run' && typeof e.data.json === 'string') acceptRun(e.data.json);
  });
  window.postMessage({ type: 'mykplan-adp:request' }, location.origin);
  loadCache();
}

// ⬇ Sync and 🔄 Full in the viewer toolbar (as in the twitter viewer): the userscript bridge on this page stores the
// command, the mykplan tab opened here runs it. Always the same named tab, so repeated clicks do not pile up tabs
export const MYKPLAN_HOME = 'https://mykplan.adp.com/ParticipantSecure_Net/AccountHighlights.aspx';
export function askRun(mode: 'sync' | 'full'): void {
  window.postMessage({ type: 'mykplan-adp:command', mode }, location.origin);
  window.open(MYKPLAN_HOME, 'mykplan-adp-sync');
}
export function askStop(): void {
  window.postMessage({ type: 'mykplan-adp:command', mode: 'stop' }, location.origin);
}

/// <reference lib="esnext" />
// One Google connection for the whole viewer and automatic writing to the mykplan_* tabs (as the twitter viewer does):
// after ☁️ Connect, every new dataset (also the partial ones during a run) is upserted by itself. The token stays in
// memory only; a reload needs ☁️ again
import type { Dataset } from '../../shared/dataset';
import { SheetsClient } from '../../shared/sheets/client';
import { GoogleAuth, loadConfig } from '../../shared/sheets/gis';
import { createStore } from '../../shared/store';
import { accept, dataset } from './data';
import { OLD_TAB_NAMES, TABS, TOTAL_FUND } from '../../shared/sheets/tabs';
import { rebalancesOf } from '../../shared/dataset';
import { derive } from './derive';
import { pushAll } from './sheetsSync';
import { t } from './i18n';

export const auth = new GoogleAuth({ config: loadConfig });

export interface SheetsState { connected: boolean; busy: boolean; log: string[]; lastWritten: string | null; error: string | null; oldTabs: string[] }
export const sheets = createStore<SheetsState>({ connected: false, busy: false, log: [], lastWritten: null, error: null, oldTabs: [] });

const add = (line: string) => sheets.set((s) => ({ ...s, log: [...s.log.slice(-50), `${new Date().toLocaleTimeString()} ${line}`] }));

export const worthWriting = (ds: Dataset | null, source: string | null): ds is Dataset =>
  !!ds && source !== 'demo' && ((ds.transactions?.length ?? 0) > 0 || (ds.dailyFunds?.length ?? 0) > 0 || (ds.periods?.length ?? 0) > 0);

export async function writeNow(ds: Dataset): Promise<void> {
  const cfg = loadConfig();
  if (!cfg.spreadsheetId) { sheets.set((s) => ({ ...s, error: t('no spreadsheet: set it in ⚙️ Settings') })); return; }
  sheets.set((s) => ({ ...s, busy: true, error: null }));
  try {
    const client = new SheetsClient({ fetch: window.fetch.bind(window), getToken: auth.getter(), spreadsheetId: cfg.spreadsheetId });
    const d = ds.dailyFunds.length ? derive(ds) : null;
    await pushAll(client, ds, d, add);
    sheets.set((s) => ({ ...s, busy: false, lastWritten: ds.builtAt }));
    add(t('written: data built {at}', { at: ds.builtAt.slice(0, 16).replace('T', ' ') }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    sheets.set((s) => ({ ...s, busy: false, error: msg }));
    add(t('failed: {error}', { error: msg }));
  }
}

// hand the token to the userscript (mykplan tab writes during runs); renewed silently every 10 min while connected
export function handOff(): void {
  const tok = auth.peek();
  const spreadsheetId = loadConfig().spreadsheetId;
  if (!tok || !spreadsheetId) return;
  window.postMessage({ type: 'mykplan-adp:google', json: JSON.stringify({ token: tok.value, expiresAt: tok.expiresAt, spreadsheetId }) }, location.origin);
}
let renewTimer: ReturnType<typeof setInterval> | null = null;
function keepFresh(): void {
  if (renewTimer) return;
  renewTimer = setInterval(() => {
    if (!sheets.get().connected) return;
    // get() renews silently when less than a minute is left; force a renew when under 15 minutes
    const tok = auth.peek();
    void auth.get(!!tok && tok.expiresAt - Date.now() < 15 * 60 * 1000).then(handOff, (err: unknown) => {
      sheets.set((st) => ({ ...st, error: t('could not renew the Google token: {error}; press ☁️', { error: err instanceof Error ? err.message : String(err) }) }));
    });
  }, 10 * 60 * 1000);
}

// ☁️ in the toolbar: needs a click (Google opens its window only on a user action), then writes at once
export async function connectGoogle(): Promise<void> {
  try {
    await auth.connect();
    sheets.set((s) => ({ ...s, connected: true, error: null }));
    add(t('connected: the mykplan tab writes the mykplan_* tabs during runs too'));
    handOff();
    keepFresh();
    void findOldTabs();
    const { ds, source } = dataset.get();
    if (worthWriting(ds, source)) { latest = ds; await drainWrites(); }
  } catch (err) {
    sheets.set((s) => ({ ...s, connected: false, error: err instanceof Error ? err.message : String(err) }));
  }
}

export function disconnectGoogle(): void {
  auth.disconnect();
  window.postMessage({ type: 'mykplan-adp:google', json: JSON.stringify({ token: '', expiresAt: 0, spreadsheetId: '' }) }, location.origin);
  sheets.set((s) => ({ ...s, connected: false }));
  add(t('disconnected'));
}

// while connected, each new dataset goes to the sheet by itself: one loop writes the newest one until it is the
// one written (review 2026-11-22: a pending copy could be skipped, or an older one written over a newer one)
let latest: Dataset | null = null;
let draining = false;
export async function drainWrites(): Promise<void> {
  if (draining) return;
  draining = true;
  try {
    while (latest && sheets.get().connected && latest.builtAt !== sheets.get().lastWritten) {
      const ds = latest;
      await writeNow(ds);
      if (sheets.get().error) break; // the next dataset starts the loop again
    }
  } finally {
    draining = false;
  }
}
dataset.subscribe(() => {
  const { ds, source } = dataset.get();
  if (!worthWriting(ds, source)) return;
  latest = ds;
  void drainWrites();
});

// Automatic connect (owner 2026-11-22: "do that automatically, so if I don't want to connect I will simply decline"):
// on page load when a client id and a spreadsheet are saved. Chrome blocks Google's window without a user action,
// so a blocked try waits for the first click or key on the page. A declined or closed window is not asked again in
// this browser session; ☁️ still connects by hand
const DECLINED_KEY = 'mykplan-adp-google-declined';
const declined = (): boolean => { try { return sessionStorage.getItem(DECLINED_KEY) === '1'; } catch { return false; } };
const markDeclined = (): void => { try { sessionStorage.setItem(DECLINED_KEY, '1'); } catch { /* blocked storage */ } };

export function autoConnectGoogle(doc: Document = document): void {
  const cfg = loadConfig();
  if (!cfg.clientId || !cfg.spreadsheetId || declined() || sheets.get().connected) return;
  const onGesture = () => {
    doc.removeEventListener('pointerdown', onGesture, true);
    doc.removeEventListener('keydown', onGesture, true);
    if (sheets.get().connected || declined()) return;
    void connectGoogle().then(() => { if (!sheets.get().connected) markDeclined(); });
  };
  void connectGoogle().then(() => {
    if (sheets.get().connected) return;
    // most likely the window was blocked (no user action yet): try again on the first click or key
    sheets.set((s) => ({ ...s, error: null }));
    doc.addEventListener('pointerdown', onGesture, true);
    doc.addEventListener('keydown', onGesture, true);
  });
}

// ↻ like twitter: read the mykplan_* tabs back into the viewer (another computer without the script, or after clearing
// the browser); what the sheet does not keep (journal details, documents, profile) stays empty
export async function loadFromSheets(): Promise<void> {
  const cfg = loadConfig();
  if (!cfg.spreadsheetId || !sheets.get().connected) return;
  sheets.set((s) => ({ ...s, busy: true, error: null }));
  try {
    const client = new SheetsClient({ fetch: window.fetch.bind(window), getToken: auth.getter(), spreadsheetId: cfg.spreadsheetId });
    const [transactions, periods, daily, elections] = await Promise.all([
      client.readRows(TABS.tx), client.readRows(TABS.period), client.readRows(TABS.daily), client.readRows(TABS.election),
    ]);
    // the Total rows are the account; the fund rows are the daily data the viewer computes from
    const dailyFunds = daily.filter((r) => r.fund !== TOTAL_FUND).map((r) => ({
      date: r.date, fund: r.fund, begUnits: r.begUnits ?? 0, begPrice: r.begPrice ?? 0, endUnits: r.endUnits ?? 0, endPrice: r.endPrice ?? 0,
      begValue: r.begValue, endValue: r.endValue, contributions: r.contributions, dividends: r.dividends, transfersIn: r.transfersIn, transfersOut: r.transfersOut, mvc: r.mvc,
    }));
    // contribution percents back from the journal rows (last state per day)
    const rateByDay = new Map<string, { date: string; rothPct: number; preTaxPct: number }>();
    elections.filter((e) => e.rothPct !== undefined && e.preTaxPct !== undefined).sort((a, b) => (a.requestedAt < b.requestedAt ? -1 : 1))
      .forEach((e) => rateByDay.set(e.requestedAt.slice(0, 10), { date: e.requestedAt.slice(0, 10), rothPct: e.rothPct!, preTaxPct: e.preTaxPct! }));
    const rates = Array.from(rateByDay.values());
    const asOf = dailyFunds.reduce((m, r) => (r.date > m ? r.date : m), '') || null;
    const ds: Dataset = {
      version: 1, builtAt: new Date().toISOString(), asOf, profile: null,
      transactions, periods, dailyFunds, journal: [], journalDetails: [], rates,
      rebalances: rebalancesOf(transactions), documents: [], warnings: [],
    };
    accept(JSON.stringify(ds), 'import');
    sheets.set((s) => ({ ...s, busy: false, lastWritten: ds.builtAt }));
    add(t('loaded from the sheet: {tx} transactions, {days} fund-days', { tx: transactions.length, days: dailyFunds.length }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    sheets.set((s) => ({ ...s, busy: false, error: msg }));
    add(t('load failed: {error}', { error: msg }));
  }
}

// tabs of the earlier layouts (adp_* names and split tables): listed for the owner to delete, never deleted by the app
async function findOldTabs(): Promise<void> {
  try {
    const client = new SheetsClient({ fetch: window.fetch.bind(window), getToken: auth.getter(), spreadsheetId: loadConfig().spreadsheetId });
    const { tabs } = await client.listTabs();
    const old = tabs.map((x) => x.title).filter((name) => OLD_TAB_NAMES.indexOf(name) >= 0);
    sheets.set((s) => ({ ...s, oldTabs: old }));
    if (old.length) add(t('old tabs you can delete (the data moved to the mykplan_* tabs): {tabs}', { tabs: old.join(', ') }));
  } catch { /* the list is only a hint */ }
}

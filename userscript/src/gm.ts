/// <reference lib="esnext" />
// Tampermonkey functions are local bindings of its wrapper, NOT globalThis properties (twitter 2.2.4 lesson):
// check them with typeof inside try/catch
declare const GM_getValue: ((key: string, def?: unknown) => unknown) | undefined;
declare const GM_setValue: ((key: string, value: unknown) => void) | undefined;
declare const GM_deleteValue: ((key: string) => void) | undefined;
declare const GM_notification: ((details: { title: string; text: string; timeout?: number }) => void) | undefined;
declare const GM_addValueChangeListener: ((key: string, fn: (name: string, oldValue: unknown, newValue: unknown, remote: boolean) => void) => number) | undefined;

export const DATASET_KEY = 'mykplan-adp.dataset';
// state of the last run for the viewer: { status, mode, done, total, current, at } (at = ms of the last update)
export const RUN_KEY = 'mykplan-adp.run';

export function gmGet<T>(key: string, def: T): T {
  try { return typeof GM_getValue === 'function' ? (GM_getValue(key, def) as T) : def; } catch { return def; }
}

export function gmSet(key: string, value: unknown): boolean {
  try { if (typeof GM_setValue === 'function') { GM_setValue(key, value); return true; } } catch { /* storage full or blocked */ }
  return false;
}

export function gmWatch(key: string, fn: (value: unknown) => void): void {
  try { if (typeof GM_addValueChangeListener === 'function') GM_addValueChangeListener(key, (_n, _o, v) => fn(v)); } catch { /* not available */ }
}

export function gmDelete(key: string): void {
  try { if (typeof GM_deleteValue === 'function') GM_deleteValue(key); } catch { /* not available */ }
}

// a Chrome notification, so a paused run in a background tab is not missed
export function notify(title: string, text: string): void {
  try { if (typeof GM_notification === 'function') GM_notification({ title, text, timeout: 0 }); } catch { /* not available */ }
}

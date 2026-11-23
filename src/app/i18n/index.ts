/// <reference lib="esnext" />
// English and Russian for the viewer (owner 2026-11-22: "by default en but we should have ru"). Like gex: a flag
// button switches, the choice is remembered. Unlike gex the key IS the English text: t('Settings') shows it as is
// in English and looks it up in RU in Russian, so English needs no dictionary and a missing translation falls back
// to English. Placeholders: t('Beat {cmp} in {n} of {m}', { cmp, n, m }). Keys must be plain literals (no ${}):
// src/app/i18n/i18n.test.ts checks that every t('...') in src has its Russian line
import { createStore } from '../../../shared/store';
import { RU } from './ru';

export type Lang = 'en' | 'ru';
export const LANGS: Lang[] = ['en', 'ru'];
export const LANG_FLAGS: Record<Lang, string> = { en: '🇺🇸', ru: '🇷🇺' };
const KEY = 'mykplan-adp.lang';

const read = (): Lang => {
  try { const v = globalThis.localStorage?.getItem(KEY); return v === 'ru' ? 'ru' : 'en'; } catch { return 'en'; }
};

export const lang = createStore<Lang>(read());

export function setLang(next: Lang): void {
  try { globalThis.localStorage?.setItem(KEY, next); } catch { /* private window: this session only */ }
  try { document.documentElement.lang = next; } catch { /* tests */ }
  lang.set(next);
}

export function t(text: string, params?: Record<string, string | number>): string {
  let out = lang.get() === 'ru' ? RU[text] ?? text : text;
  if (params) Object.keys(params).forEach((k) => { out = out.split(`{${k}}`).join(String(params[k])); });
  return out;
}

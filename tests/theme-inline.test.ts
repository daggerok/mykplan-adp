/// <reference types="bun" />
/// <reference types="node" />
/// <reference lib="esnext" />
// The inline <head> script of src/index.html must agree with shared/theme for every stored value and OS setting
import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { THEME_KEY, isDarkTheme, readThemeMode } from '../shared/theme';

const html = readFileSync(join(__dirname, '..', 'src', 'index.html'), 'utf8');
const code = html.match(/<script id="theme-boot">([\s\S]*?)<\/script>/)![1]!;

test('inline theme boot = shared/theme', () => {
  for (const stored of [null, 'light', 'dark', 'system', 'junk']) {
    for (const sys of [false, true]) {
      const classes = new Set<string>();
      const dataset: Record<string, string> = {};
      const store = { getItem: (k: string) => (k === THEME_KEY ? stored : null), setItem() {} };
      const fakeWindow = { matchMedia: () => ({ matches: sys }) };
      const fakeDocument = { documentElement: { classList: { toggle: (c: string, on: boolean) => (on ? classes.add(c) : classes.delete(c)) }, dataset } };
      new Function('localStorage', 'window', 'document', code)(store, fakeWindow, fakeDocument);
      const mode = readThemeMode(store);
      expect(classes.has('dark')).toBe(isDarkTheme(mode, sys));
      expect(dataset.themeMode).toBe(mode);
    }
  }
});

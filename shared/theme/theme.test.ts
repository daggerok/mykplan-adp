/// <reference types="bun" />
/// <reference types="node" />
/// <reference lib="esnext" />
import { describe, expect, test } from 'bun:test';
import { DEFAULT_THEME_MODE, THEME_KEY, isDarkTheme, isThemeMode, nextThemeMode, readThemeMode, saveThemeMode, themeIcon, themeTitle } from './index';

const memory = (init: Record<string, string> = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
};

describe('theme', () => {
  test('cycles light -> dark -> system -> light', () => {
    expect(nextThemeMode('light')).toBe('dark');
    expect(nextThemeMode('dark')).toBe('system');
    expect(nextThemeMode('system')).toBe('light');
  });

  test('dark only for dark, or system when the OS is dark', () => {
    expect(isDarkTheme('light', true)).toBe(false);
    expect(isDarkTheme('dark', false)).toBe(true);
    expect(isDarkTheme('system', true)).toBe(true);
    expect(isDarkTheme('system', false)).toBe(false);
  });

  test('icon shows the other theme, system shows the current one with A', () => {
    expect(themeIcon('light', true)).toEqual({ icon: '🌙', auto: false });
    expect(themeIcon('dark', false)).toEqual({ icon: '☀', auto: false });
    expect(themeIcon('system', true)).toEqual({ icon: '🌙', auto: true });
    expect(themeIcon('system', false)).toEqual({ icon: '☀', auto: true });
  });

  test('title names the next mode', () => {
    expect(themeTitle('light', false)).toContain('Click: dark');
    expect(themeTitle('dark', false)).toContain('Click: system');
    expect(themeTitle('system', true)).toContain('now dark');
  });

  test('storage: default system, junk ignored, throwing storage is safe', () => {
    expect(readThemeMode(undefined)).toBe(DEFAULT_THEME_MODE);
    expect(readThemeMode(memory({ [THEME_KEY]: 'auto' }))).toBe('system');
    expect(readThemeMode(memory({ [THEME_KEY]: 'dark' }))).toBe('dark');
    const boom = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    expect(readThemeMode(boom)).toBe('system');
    expect(() => saveThemeMode(boom, 'dark')).not.toThrow();
    const s = memory();
    saveThemeMode(s, 'light');
    expect(s.m.get(THEME_KEY)).toBe('light');
    expect(isThemeMode('nope')).toBe(false);
  });
});

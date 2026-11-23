/// <reference lib="esnext" />
// Theme modes of the toolbar button: light -> dark -> system -> light.
// system follows matchMedia('(prefers-color-scheme: dark)'). Pattern of theme-utils in daggerok/youtube,
// with its clock-based "auto" replaced by the OS setting. The inline script in src/index.html
// repeats isDarkTheme(readThemeMode(...)) in a few lines; tests/theme-inline.test.ts keeps both in step.
export const THEME_MODES = ['light', 'dark', 'system'] as const;
export type ThemeMode = (typeof THEME_MODES)[number];
export const THEME_KEY = 'mykplan-adp-theme';
export const DEFAULT_THEME_MODE: ThemeMode = 'system';
export const DARK_QUERY = '(prefers-color-scheme: dark)';

export const isThemeMode = (v: unknown): v is ThemeMode => typeof v === 'string' && (THEME_MODES as readonly string[]).indexOf(v) >= 0;

export const nextThemeMode = (m: ThemeMode): ThemeMode => (m === 'light' ? 'dark' : m === 'dark' ? 'system' : 'light');

export const isDarkTheme = (m: ThemeMode, systemDark: boolean): boolean => (m === 'system' ? systemDark : m === 'dark');

// light and dark show the icon of the other theme (a moon on the light page, a sun on the dark one);
// system shows the current theme with an "A" badge
export const themeIcon = (m: ThemeMode, systemDark: boolean): { icon: string; auto: boolean } =>
  m === 'system' ? { icon: systemDark ? '🌙' : '☀', auto: true } : { icon: m === 'dark' ? '☀' : '🌙', auto: false };

export const themeTitle = (m: ThemeMode, systemDark: boolean): string =>
  m === 'light'
    ? 'Light theme. Click: dark theme'
    : m === 'dark'
      ? 'Dark theme. Click: system theme'
      : `System theme, now ${systemDark ? 'dark' : 'light'}. Click: light theme`;

type KeyValue = Pick<Storage, 'getItem' | 'setItem'>;

export function readThemeMode(storage: KeyValue | undefined): ThemeMode {
  try {
    const v = storage?.getItem(THEME_KEY);
    return isThemeMode(v) ? v : DEFAULT_THEME_MODE;
  } catch {
    return DEFAULT_THEME_MODE;
  }
}

export function saveThemeMode(storage: KeyValue | undefined, m: ThemeMode): void {
  try {
    storage?.setItem(THEME_KEY, m);
  } catch {
    // private window or blocked storage: the choice lives until reload
  }
}

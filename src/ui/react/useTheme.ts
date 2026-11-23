/// <reference lib="esnext" />
import { useCallback, useEffect, useState } from 'react';
import { DARK_QUERY, isDarkTheme, nextThemeMode, readThemeMode, saveThemeMode, type ThemeMode } from '../../../shared/theme';

const storage = (): Storage | undefined => {
  try { return globalThis.localStorage; } catch { return undefined; }
};
const systemDarkNow = (): boolean => {
  try { return globalThis.matchMedia?.(DARK_QUERY).matches ?? false; } catch { return false; }
};

// Theme state of the toolbar button; system mode listens to the OS 'change' event
export function useTheme() {
  const [mode, setMode] = useState<ThemeMode>(() => readThemeMode(storage()));
  const [systemDark, setSystemDark] = useState(systemDarkNow);

  useEffect(() => {
    const mq = globalThis.matchMedia?.(DARK_QUERY);
    if (!mq) return undefined;
    const on = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  const dark = isDarkTheme(mode, systemDark);
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', dark);
    root.dataset.themeMode = mode;
  }, [dark, mode]);

  const cycle = useCallback(() => {
    setMode((m) => {
      const next = nextThemeMode(m);
      saveThemeMode(storage(), next);
      return next;
    });
  }, []);

  return { mode, systemDark, dark, cycle };
}

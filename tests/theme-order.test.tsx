/// <reference types="bun" />
/// <reference types="node" />
/// <reference lib="esnext" />
// A chart reads its colors from CSS variables in its own useEffect([dark]); React runs a child's effects before the
// parent's, so the theme hook must move the html class in a layout effect or the chart keeps the old colors
// (charts one switch behind, pattern theme-toggle, 2026-11-22)
import { afterAll, beforeAll, expect, test } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';

beforeAll(() => GlobalRegistrator.register({ url: 'https://daggerok.github.io/mykplan-adp/' }));
afterAll(() => GlobalRegistrator.unregister());

test('a child effect on [dark] already sees the new html class', async () => {
  const React = await import('react');
  const { act } = React;
  const { createRoot } = await import('react-dom/client');
  const { useTheme } = await import('../src/ui/react/useTheme');
  const { THEME_KEY } = await import('../shared/theme');
  localStorage.setItem(THEME_KEY, 'light');
  const seen: Array<[boolean, boolean]> = [];
  let cycle = () => {};
  function Chart({ dark }: { dark: boolean }) {
    React.useEffect(() => { seen.push([dark, document.documentElement.classList.contains('dark')]); }, [dark]);
    return null;
  }
  function Shell() {
    const theme = useTheme();
    cycle = theme.cycle;
    return <Chart dark={theme.dark} />;
  }
  document.body.innerHTML = '<div id="root"></div>';
  const root = createRoot(document.getElementById('root')!);
  await act(async () => root.render(<Shell />));
  await act(async () => cycle()); // -> dark
  await act(async () => cycle()); // -> system (light OS)
  expect(seen).toEqual([[false, false], [true, true], [false, false]]);
  await act(async () => root.unmount());
});

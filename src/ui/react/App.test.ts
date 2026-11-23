/// <reference types="bun" />
/// <reference lib="esnext" />
import { expect, test } from 'bun:test';
import { screenOfHash } from './App';

test('the screen comes back from the address after a reload', () => {
  expect(screenOfHash('#Contributions')).toBe('Contributions');
  expect(screenOfHash('')).toBe('Chart');
  expect(screenOfHash('#nope')).toBe('Chart');
});

test('every screen has its help', async () => {
  const { help } = await import('./help');
  const { SCREENS } = await import('./App');
  SCREENS.forEach((s) => { expect(help(s).items.length).toBeGreaterThan(0); });
});

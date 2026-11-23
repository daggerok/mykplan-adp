/// <reference types="bun" />
/// <reference types="node" />
/// <reference lib="esnext" />
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, beforeAll, expect, test } from 'bun:test';

beforeAll(() => GlobalRegistrator.register({ url: 'https://daggerok.github.io/mykplan-adp/' }));
afterAll(() => GlobalRegistrator.unregister());

test('auto connect: nothing without a saved client id and sheet; a blocked try waits for the first click; a refusal is remembered for the session', async () => {
  const google = await import('./google');
  const tries: string[] = [];
  // no config: no try at all
  localStorage.removeItem('mykplan-adp-gs-config');
  google.autoConnectGoogle(document);
  await new Promise((r) => setTimeout(r, 0));
  expect(google.sheets.get().connected).toBe(false);

  localStorage.setItem('mykplan-adp-gs-config', JSON.stringify({ clientId: 'id.apps.googleusercontent.com', spreadsheetId: 'sheet' }));
  // every connect fails here (no GIS in tests): the first on load, the second on the first click -> declined
  const auth = google.auth as unknown as { connect: () => Promise<void> };
  auth.connect = async () => { tries.push('connect'); throw new Error('popup_failed_to_open'); };
  google.autoConnectGoogle(document);
  await new Promise((r) => setTimeout(r, 0));
  expect(tries).toEqual(['connect']);
  document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 0));
  expect(tries).toEqual(['connect', 'connect']);
  expect(sessionStorage.getItem('mykplan-adp-google-declined')).toBe('1');
  // declined: no more tries this session
  google.autoConnectGoogle(document);
  await new Promise((r) => setTimeout(r, 0));
  expect(tries).toEqual(['connect', 'connect']);
});

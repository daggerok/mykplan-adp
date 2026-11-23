/// <reference types="bun" />
/// <reference types="node" />
/// <reference lib="esnext" />
import { afterEach, describe, expect, test } from 'bun:test';
import { CONFIG_KEY, GoogleAuth, loadConfig, mask, parseSpreadsheetId, saveConfig, type Gis, type GsConfig } from './gis';

// placeholders only: no real client id, spreadsheet id or token anywhere in tests
const SHEET_ID = 'sheet_ID-0123456789abcdef';

type G = { localStorage?: unknown };
const g = globalThis as unknown as G;
const saved = g.localStorage;

function memoryStorage(): Storage {
  const m: Record<string, string> = {};
  return {
    getItem: (k: string) => (k in m ? m[k] : null),
    setItem: (k: string, v: string) => { m[k] = String(v); },
    removeItem: (k: string) => { delete m[k]; },
    clear: () => { Object.keys(m).forEach((k) => delete m[k]); },
    key: (i: number) => Object.keys(m)[i] || null,
    get length() { return Object.keys(m).length; },
  };
}

afterEach(() => { g.localStorage = saved; });

describe('parseSpreadsheetId', () => {
  test.each([
    ['https://docs.google.com/spreadsheets/d/' + SHEET_ID + '/edit#gid=0', SHEET_ID],
    ['https://docs.google.com/spreadsheets/d/' + SHEET_ID, SHEET_ID],
    ['  ' + SHEET_ID + '  ', SHEET_ID],
    ['', ''],
    ['https://example.com/not a sheet', ''],
  ])('%s', (input, id) => expect(parseSpreadsheetId(input)).toBe(id));
});

describe('config in localStorage', () => {
  test('save and load, a pasted URL stored as its id, no token key', () => {
    g.localStorage = memoryStorage();
    expect(saveConfig({ clientId: ' client.example ', spreadsheetId: 'https://docs.google.com/spreadsheets/d/' + SHEET_ID + '/edit', email: 'me@example.com' })).toBe(true);
    expect(loadConfig()).toEqual({ clientId: 'client.example', spreadsheetId: SHEET_ID, email: 'me@example.com' });
    const raw = (g.localStorage as Storage).getItem(CONFIG_KEY) || '';
    expect(Object.keys(JSON.parse(raw)).sort()).toEqual(['clientId', 'email', 'spreadsheetId']);
    saveConfig({ email: '' });
    expect(loadConfig().clientId).toBe('client.example');
  });

  test('broken JSON and a throwing storage read as empty, saving reports false', () => {
    g.localStorage = memoryStorage();
    (g.localStorage as Storage).setItem(CONFIG_KEY, '{oops');
    expect(loadConfig()).toEqual({ clientId: '', spreadsheetId: '', email: '' });
    g.localStorage = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); }, removeItem: () => { throw new Error('blocked'); } };
    expect(loadConfig()).toEqual({ clientId: '', spreadsheetId: '', email: '' });
    expect(saveConfig({ clientId: 'x' })).toBe(false);
  });

  test('mask keeps only the edges', () => {
    expect(mask('abcdefghijklmnop')).toBe('abcd••••••••mnop');
    expect(mask('short')).toBe('•••••');
  });
});

describe('GoogleAuth', () => {
  function fakeGis(expiresIn = 3600) {
    const prompts: string[] = [];
    let n = 0;
    const gis: Gis = {
      accounts: {
        oauth2: {
          initTokenClient: (o) => ({
            requestAccessToken: (r) => {
              prompts.push(r.prompt);
              n += 1;
              const token = 'tok-' + n;
              setTimeout(() => o.callback({ access_token: token, expires_in: expiresIn }), 0);
            },
          }),
          revoke: () => { /* nothing */ },
        },
      },
    };
    return { gis, prompts };
  }

  const cfg = (c: Partial<GsConfig> = {}) => (): GsConfig => ({ clientId: 'client.example', spreadsheetId: SHEET_ID, email: '', ...c });

  test('consent on the first connect, silent after; tokens reused until near expiry', async () => {
    let now = 1000000;
    const f = fakeGis(3600);
    const auth = new GoogleAuth({ config: cfg(), gis: async () => f.gis, now: () => now });
    await auth.connect();
    expect(f.prompts).toEqual(['consent']);
    expect(await auth.get()).toBe('tok-1');
    now += 3600 * 1000 - 30000; // under a minute left
    expect(await auth.get()).toBe('tok-2');
    expect(await auth.get(true)).toBe('tok-3');
    await auth.connect();
    expect(f.prompts).toEqual(['consent', '', '', '']);
  });

  test('a saved email means connected before: no consent', async () => {
    const f = fakeGis();
    const auth = new GoogleAuth({ config: cfg({ email: 'me@example.com' }), gis: async () => f.gis });
    await auth.connect();
    expect(f.prompts).toEqual(['']);
  });

  test('a failed forced renew keeps the token that still works', async () => {
    let fail = false;
    let n = 0;
    const gis: Gis = { accounts: { oauth2: {
      initTokenClient: (o) => ({ requestAccessToken: () => { n += 1; setTimeout(() => (fail ? o.error_callback?.({ type: 'popup_failed_to_open' }) : o.callback({ access_token: 'tok-' + n, expires_in: 3600 })), 0); } }),
      revoke: () => { /* nothing */ },
    } } };
    const auth = new GoogleAuth({ config: cfg(), gis: async () => gis });
    expect(await auth.get()).toBe('tok-1');
    fail = true;
    await expect(auth.get(true)).rejects.toThrow('popup_failed_to_open');
    expect(auth.peek()?.value).toBe('tok-1');
    expect(await auth.get()).toBe('tok-1');
  });

  test('concurrent renewals share one request', async () => {
    const f = fakeGis();
    const auth = new GoogleAuth({ config: cfg(), gis: async () => f.gis });
    const both = await Promise.all([auth.get(), auth.get()]);
    expect(both).toEqual(['tok-1', 'tok-1']);
    expect(f.prompts).toHaveLength(1);
  });

  test('no client id, an error response and disconnect fail clearly', async () => {
    const f = fakeGis();
    await expect(new GoogleAuth({ config: cfg({ clientId: '' }), gis: async () => f.gis }).get()).rejects.toThrow('Client ID');
    const denied: Gis = { accounts: { oauth2: { initTokenClient: (o) => ({ requestAccessToken: () => { setTimeout(() => o.callback({ error: 'access_denied' }), 0); } }), revoke: () => { /* nothing */ } } } };
    await expect(new GoogleAuth({ config: cfg(), gis: async () => denied }).get()).rejects.toThrow('access_denied');
    const auth = new GoogleAuth({ config: cfg(), gis: async () => f.gis });
    await auth.connect();
    auth.disconnect();
    expect(auth.peek()).toBeNull();
    await expect(auth.get()).rejects.toThrow('disconnected');
  });
});

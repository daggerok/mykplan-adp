/// <reference types="bun" />
/// <reference types="node" />
/// <reference lib="esnext" />
import { expect, test } from 'bun:test';
import { gmFetch, usableHandoff } from './sheets-gm';

test('gmFetch turns GM_xmlhttpRequest into a Response', async () => {
  const seen: Array<{ method: string; url: string; headers?: Record<string, string>; data?: string }> = [];
  const fetcher = gmFetch((d) => { seen.push(d); d.onload({ status: 200, responseText: '{"ok":1}', responseHeaders: 'content-type: application/json\r\nx-a: b' }); });
  const r = await fetcher('https://sheets.googleapis.com/v4/x', { method: 'PUT', headers: { Authorization: 'Bearer t' }, body: '{"a":1}' });
  expect(await r.json()).toEqual({ ok: 1 });
  expect(r.headers.get('x-a')).toBe('b');
  expect(seen[0]).toMatchObject({ method: 'PUT', url: 'https://sheets.googleapis.com/v4/x', data: '{"a":1}' });
  expect(seen[0]!.headers!.authorization).toBe('Bearer t');
  const failing = gmFetch((d) => d.onerror(new Error('x')));
  await expect(failing('https://x')).rejects.toThrow('network error');
});

test('a handed-over token is used only with more than a minute left', () => {
  const now = 1_000_000;
  const raw = (expiresAt: number) => JSON.stringify({ token: 't', expiresAt, spreadsheetId: 's' });
  expect(usableHandoff(raw(now + 120_000), now)?.token).toBe('t');
  expect(usableHandoff(raw(now + 30_000), now)).toBeNull();
  expect(usableHandoff('{bad', now)).toBeNull();
  expect(usableHandoff(JSON.stringify({ token: 't', expiresAt: now + 999_999 }), now)).toBeNull();
});

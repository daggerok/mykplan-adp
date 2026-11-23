/// <reference types="bun" />
/// <reference types="node" />
/// <reference lib="esnext" />
import { describe, expect, test } from 'bun:test';
import { classifySession, probeSession } from './session';

const BASE = 'https://mykplan.adp.com/ParticipantSecure_Net/';

describe('classifySession', () => {
  test('secure page with view state is ok', () => {
    expect(classifySession(`${BASE}AccountHighlights.aspx`, '<input type="hidden" name="__VIEWSTATE" value="x">')).toBe('ok');
  });
  test('timeout and logout pages are expired', () => {
    expect(classifySession(`${BASE}ISITimeout.aspx`, '')).toBe('expired');
    expect(classifySession(`${BASE}ISIlogout.aspx`, '__VIEWSTATE')).toBe('expired');
  });
  test('a password field means the login form', () => {
    expect(classifySession('https://mykplan.adp.com/', '<input id="pw" type="password">')).toBe('expired');
  });
  test('anything else is unknown', () => {
    expect(classifySession('https://mykplan.adp.com/', '<p>hello</p>')).toBe('unknown');
  });
});

describe('probeSession', () => {
  const fake = (url: string, body: string, type = 'basic', status = 200) =>
    (async (_: string, init: RequestInit) => {
      expect(init.redirect).toBe('manual');
      return { url, type, status, text: async () => body };
    }) as unknown as typeof fetch;
  test('a page with view state is ok, a timeout page is expired', async () => {
    expect(await probeSession(fake(`${BASE}AccountHighlights.aspx`, '__VIEWSTATE'))).toBe('ok');
    expect(await probeSession(fake(`${BASE}ISITimeout.aspx`, ''))).toBe('expired');
  });
  test('any redirect (to online.adp.com sign-in) is expired', async () => {
    expect(await probeSession(fake('', '', 'opaqueredirect', 0))).toBe('expired');
    expect(await probeSession(fake(`${BASE}AccountHighlights.aspx`, '', 'basic', 302))).toBe('expired');
  });
  test('the sign-in url itself is expired', () => {
    expect(classifySession('https://online.adp.com/signin/v1/?APPID=401K', '<html></html>')).toBe('expired');
  });
  test('network error is unknown', async () => {
    expect(await probeSession((async () => { throw new Error('offline'); }) as unknown as typeof fetch)).toBe('unknown');
  });
});

test('the SSO hold page is not a working session', async () => {
  const { classifySession } = await import('./session');
  expect(classifySession('https://mykplan.adp.com/ParticipantSecure_Net/AccountHighlights.aspx', 'This page is used to hold your data while you are being authorized for your request. __VIEWSTATE')).toBe('expired');
});

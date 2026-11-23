/// <reference types="bun" />
/// <reference types="node" />
/// <reference lib="esnext" />
import { describe, expect, test } from 'bun:test';
import { SessionExpired, SiteError, getText, hiddenFields, postForm, siteError, windowOpenTarget, type Fetcher } from './http';
import { withBackoff } from './throttle';

const res = (url: string, body: string, extra: Partial<Response> = {}) =>
  ({ url, ok: true, status: 200, type: 'basic', text: async () => body, headers: new Headers(), ...extra }) as unknown as Response;

const FORM = '<form><input type="hidden" name="__VIEWSTATE" id="__VIEWSTATE" value="abc&amp;1" /><input type="hidden" name="__VIEWSTATEGENERATOR" value="XYZ" /></form>';

describe('http', () => {
  test('hidden fields are read and unescaped', () => {
    expect(hiddenFields(FORM)).toEqual({ __VIEWSTATE: 'abc&1', __VIEWSTATEGENERATOR: 'XYZ' });
  });

  test('postForm takes a fresh GET, posts view state + fields', async () => {
    const calls: Array<{ input: string; init?: RequestInit }> = [];
    const fetcher: Fetcher = async (input, init) => {
      calls.push({ input, init });
      return init?.method === 'POST' ? res('https://x/ParticipantSecure_Net/TransactionHistoryPrint.aspx', 'ok') : res('https://x/form', FORM);
    };
    const r = await postForm('/ParticipantSecure_Net/TransactionHistory.aspx', { a: '1' }, { fetcher });
    expect(r.text).toBe('ok');
    expect(calls.map((c) => c.init?.method ?? 'GET')).toEqual(['GET', 'POST']);
    const body = calls[1]!.init!.body as URLSearchParams;
    expect(body.get('__VIEWSTATE')).toBe('abc&1');
    expect(body.get('a')).toBe('1');
  });

  test('change forms are never posted', async () => {
    for (const p of ['/ParticipantSecure_Net/Contributions.aspx', '/ParticipantSecure_Net/Investment_Allocations.aspx', '/ParticipantSecure_Net/SaveSmartSelect.aspx']) {
      await expect(postForm(p, {})).rejects.toThrow('refusing to post');
    }
  });

  test('redirect to sign-in, timeout page or a password form is an expired session', async () => {
    await expect(getText('/x', async () => res('', '', { type: 'opaqueredirect' as ResponseType }))).rejects.toBeInstanceOf(SessionExpired);
    await expect(getText('/x', async () => res('https://online.adp.com/signin/v1/?APPID=401K', ''))).rejects.toBeInstanceOf(SessionExpired);
    await expect(getText('/x', async () => res('https://x/ISITimeout.aspx', ''))).rejects.toBeInstanceOf(SessionExpired);
    await expect(getText('/x', async () => res('https://x/p', '<input type="password">'))).rejects.toBeInstanceOf(SessionExpired);
  });

  test('window.open target of a postback answer', () => {
    const html = `<script>window.open('/ParticipantSecure_Net/participant/redirectAdvicePartner')</script><script>window.open('StatementPDF.aspx?rand=0.5&amp;x=1','_blank')</script>`;
    expect(windowOpenTarget(html, /StatementPDF/, 'https://mykplan.adp.com/ParticipantSecure_Net/RSOnDemandReports/Statements.aspx'))
      .toBe('https://mykplan.adp.com/ParticipantSecure_Net/RSOnDemandReports/StatementPDF.aspx?rand=0.5&x=1');
    expect(windowOpenTarget(html, /Quicken/, 'https://mykplan.adp.com/')).toBeNull();
  });

  test('site errors', () => {
    expect(siteError('https://x/ErrorP.aspx', '<p>The date range cannot exceed 13 months. To continue</p>')).toBe('The date range cannot exceed 13 months');
    expect(siteError('https://x/ErrorP.aspx', 'The ending date must be prior to or equal to the last price date: . 11/20/2026. ')).toContain('11/20/2026');
    expect(siteError('https://x/TransactionHistoryPrint.aspx', 'fine')).toBeNull();
  });
});

describe('withBackoff', () => {
  test('retries with the delays, then gives up', async () => {
    const waits: number[] = [];
    let n = 0;
    const r = await withBackoff(async () => { if (++n < 3) throw new Error('flaky'); return 'done'; }, { wait: async (ms) => void waits.push(ms) });
    expect(r).toBe('done');
    expect(waits).toEqual([5000, 15000]);
    await expect(withBackoff(async () => { throw new Error('down'); }, { wait: async () => {} })).rejects.toThrow('down');
  });
  test('a site error is not retried (the same answer would come again)', async () => {
    let n = 0;
    await expect(withBackoff(async () => { n++; throw new SiteError('no Quicken download link'); }, { wait: async () => {} })).rejects.toBeInstanceOf(SiteError);
    expect(n).toBe(1);
  });
  test('an expired session is not retried', async () => {
    let n = 0;
    await expect(withBackoff(async () => { n++; throw new SessionExpired(); }, { wait: async () => {} })).rejects.toBeInstanceOf(SessionExpired);
    expect(n).toBe(1);
  });
});

test('a CORS failure from the cross-origin sign-in redirect is an ended session (review 2026-11-22)', async () => {
  // the real request follows the redirect to online.adp.com and throws; the probe (redirect manual) sees the redirect
  const fetcher: Fetcher = async (input, init) => {
    if (init?.redirect === 'manual') return { type: 'opaqueredirect', url: '', ok: false, status: 0, text: async () => '' } as unknown as Response;
    throw new TypeError('Failed to fetch');
  };
  await expect(getText('/ParticipantSecure_Net/TransactionHistory.aspx', fetcher)).rejects.toBeInstanceOf(SessionExpired);
  // a plain network failure with a live session stays a network error (it is retried)
  const offline: Fetcher = async (input, init) => {
    if (init?.redirect === 'manual') return { type: 'basic', url: 'https://mykplan.adp.com/ParticipantSecure_Net/AccountHighlights.aspx', ok: true, status: 200, text: async () => '__VIEWSTATE' } as unknown as Response;
    throw new TypeError('Failed to fetch');
  };
  await expect(getText('/x', offline)).rejects.toBeInstanceOf(TypeError);
});

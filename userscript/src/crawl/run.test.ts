/// <reference types="bun" />
/// <reference types="node" />
/// <reference lib="esnext" />
import { expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import type { Fetcher } from '../http';
import { memoryStore } from '../rawStore';
import { HISTORY_START, tradingDays } from './plan';
import { run, type Progress } from './run';

const ORIGIN = 'https://mykplan.adp.com';
const HL = '<span id="_ctl0_PageContent_lblLastPrice">As of November 20, 2026</span><span id="_ctl0_PageContent_lblAge">Age: 40 years 6 months</span>';
const FORM = '<input type="hidden" name="__VIEWSTATE" value="vs" />';
const res = (url: string, body: string) => ({ url: ORIGIN + url, ok: true, status: 200, type: 'basic', headers: new Headers(), text: async () => body, arrayBuffer: async () => new TextEncoder().encode(body).buffer }) as unknown as Response;
const parseHtml = (h: string) => new (new Window().DOMParser)().parseFromString(h, 'text/html') as unknown as Document;

// a fake site that serves everything; `expireAfter` posts later every request is a redirect to sign-in
function site(expireAfter = Infinity) {
  let posts = 0;
  const fetcher: Fetcher = async (input, init) => {
    const path = input.replace(ORIGIN, '').split('?')[0]!;
    if (init?.method === 'POST' && ++posts > expireAfter) return { type: 'opaqueredirect', url: '', ok: false, status: 0 } as unknown as Response;
    if (path.endsWith('AccountHighlights.aspx')) return res(path, HL);
    if (path.endsWith('Statements.aspx') && init?.method !== 'POST') return res(path, `${FORM}<select name="x_ddlOndemandStatement"></select>`);
    if (path.endsWith('AccountUpdatesSummary.aspx')) return res(path, FORM);
    if (path.endsWith('TransactionHistoryDownloads.aspx')) return res(path, init?.method === 'POST' ? "<script>window.open('TransactionHistoryQuickenDownload.aspx')</script>" : FORM);
    if (path.endsWith('TransactionHistoryQuickenDownload.aspx')) return res(path, 'OFXHEADER:100 <OFX>');
    // a real print page carries its table header (pages without it are not saved)
    if (path.endsWith('TransactionHistory.aspx')) return res(init?.method === 'POST' ? '/ParticipantSecure_Net/TransactionHistoryPrint.aspx' : path, init?.method === 'POST' ? '<td>Unit/Share Balance</td><td>Activity by Source</td>' : FORM);
    return res(path, '<html>page</html>');
  };
  return { fetcher, posts: () => posts };
}

const deps = (store: ReturnType<typeof memoryStore>, fetcher: Fetcher, log: Progress[], stopAt = Infinity) => ({
  store, fetcher, parseHtml, today: () => '2026-11-21', pause: async () => {}, backoffWait: async () => {},
  shouldStop: () => log.length >= stopAt, onProgress: (p: Progress) => void log.push(p),
});

test('a full run saves every step, a second sync asks only the open ones', async () => {
  const store = memoryStore();
  const s = site();
  const log: Progress[] = [];
  const p = await run('full', deps(store, s.fetcher, log));
  expect(p.status).toBe('done');
  expect(p.failed).toEqual([]);
  expect(p.done).toBe(p.total);
  const all = store.map.size;
  expect(await store.keys('tx/day/')).toHaveLength(tradingDays(HISTORY_START, '2026-11-20').length);
  const before = s.posts();
  const p2 = await run('sync', deps(store, s.fetcher, []));
  expect(p2.status).toBe('done');
  expect(s.posts() - before).toBe(3 + 2 + 1); // year window + November in two views, two open Quicken half-years, journal list
  expect(store.map.size).toBeGreaterThanOrEqual(all);
});

test('an expired session pauses the run; the next run continues from the saved steps', async () => {
  const store = memoryStore();
  const p = await run('full', deps(store, site(10).fetcher, []));
  expect(p.status).toBe('paused');
  expect(p.message).toContain('log in');
  const savedAfterLogout = store.map.size;
  const p2 = await run('full', deps(store, site().fetcher, []));
  expect(p2.status).toBe('done');
  expect(p2.total).toBeLessThan(p.total);
  expect(store.map.size).toBeGreaterThan(savedAfterLogout);
});

test('Stop ends the run between steps', async () => {
  const store = memoryStore();
  const log: Progress[] = [];
  const p = await run('full', deps(store, site().fetcher, log, 20));
  expect(p.status).toBe('stopped');
  expect(p.done).toBeLessThan(p.total);
});

test('a long step reports its own progress', async () => {
  const store = memoryStore();
  const log: Progress[] = [];
  const row = (n: number) => `<tr><td>01/0${n}/2026 10:00:00</td><td>X</td><td>Add</td><td>Internet</td><td>P</td><td>${n}00</td><td></td><td><a id="_ctl0_PageContent_dgATSumm__ctl${n}_lnkbtnDetail">Detail</a></td></tr>`;
  const base = site().fetcher;
  const fetcher: Fetcher = async (input, init) => {
    const path = input.replace(ORIGIN, '').split('?')[0]!;
    if (path.endsWith('AccountUpdatesSummary.aspx')) return res(path, init?.method === 'POST' && !(init.body as URLSearchParams).get('__EVENTTARGET') ? `${FORM}<table>${row(2)}${row(3)}</table>` : "<script>window.open('AccountUpdatesDetail.aspx')</script>");
    if (path.endsWith('AccountUpdatesDetail.aspx')) return res(path, 'detail');
    return base(input, init);
  };
  await run('sync', deps(store, fetcher, log));
  expect(log.map((p) => p.note).filter(Boolean)).toEqual(['journal details 1/2', 'journal details 2/2']);
});

test('pages saved without their table are asked again', async () => {
  const store = memoryStore();
  await run('full', deps(store, site().fetcher, []));
  await store.put({ key: 'tx/day/2024-06-14.html', type: 'text/html', savedAt: 'x', text: 'This page is used to hold your data while you are being authorized for your request.' });
  const log: Progress[] = [];
  const s2 = site();
  await run('sync', deps(store, s2.fetcher, log));
  expect(log.some((p) => /1 saved pages had no data/.test(p.note ?? ''))).toBe(true);
  expect(store.map.get('tx/day/2024-06-14.html')!.text).toContain('Unit/Share Balance');
});

// a site with real rows: the account starts with its first contribution, a day page before it has no fund table
// (live 2026-11-22); `ledger` can change between runs like ADP posting a transaction with an earlier date
const us = (iso: string) => { const [y, m, d] = iso.split('-'); return `${m}/${d}/${y}`; };
const fromUs = (us: string) => { const [m, d, y] = us.split('/'); return `${y}-${m!.padStart(2, '0')}-${d!.padStart(2, '0')}`; };
function ledgerSite(ledger: string[]) {
  const asked: string[] = [];
  const base = site().fetcher;
  const fetcher: Fetcher = async (input, init) => {
    const path = input.replace(ORIGIN, '').split('?')[0]!;
    if (!(path.endsWith('TransactionHistory.aspx') && init?.method === 'POST')) return base(input, init);
    const body = init.body as URLSearchParams;
    const from = fromUs(body.get('_ctl0:PageContent:TextBoxStartDate')!);
    const to = fromUs(body.get('_ctl0:PageContent:TextBoxEndDate')!);
    asked.push(`${from}_${to}`);
    const print = '/ParticipantSecure_Net/TransactionHistoryPrint.aspx';
    if (to < ledger.slice().sort()[0]!) return res(print, '<p>There is no activity for the selected period.</p>');
    const row = (d: string) => `<tr><td></td><td>Fund A</td><td></td><td>${us(d)}</td><td></td><td>${us(d)}</td><td></td><td>Contribution - Roth</td><td>1.000</td><td>10.00</td><td>$10.00</td><td></td></tr>`;
    const rows = ledger.filter((d) => d >= from && d <= to).map(row).join('');
    return res(print, `<table><tr><td>Investment Fund</td><td>Unit/Share Balance</td><td>Price</td></tr>${rows}</table><td>Activity by Source</td>`);
  };
  return { fetcher, asked };
}

test('pages before the first transaction are not failures and are not asked again', async () => {
  const store = memoryStore();
  const s = ledgerSite(['2023-08-01', '2024-01-12']);
  const p = await run('full', deps(store, s.fetcher, []));
  expect(p.status).toBe('done');
  expect(p.failed).toEqual([]);
  expect(p.emptyBefore).toBe('2023-08-01');
  const before = s.asked.length;
  const p2 = await run('full', deps(store, s.fetcher, []));
  expect(p2.failed).toEqual([]);
  // only the open windows again: the year window and November in both views (no early days, no May or June 2023)
  expect(s.asked.slice(before).sort()).toEqual(['2026-05-12_2026-11-20', '2026-11-01_2026-11-20', '2026-11-01_2026-11-20']);
});

test('a transaction ADP posts later with an earlier date makes the pages from that date stale', async () => {
  const store = memoryStore();
  const ledger = ['2023-08-01', '2026-06-12', '2026-10-16'];
  const s = ledgerSite(ledger);
  await run('full', deps(store, s.fetcher, []));
  ledger.push('2026-07-03'); // posted after the first run, dated in a closed month
  const before = s.asked.length;
  const notes: Progress[] = [];
  const p = await run('sync', deps(store, s.fetcher, notes));
  expect(p.backdated).toMatch(/^ADP changed history from 2026-07-03: \d+ saved pages are asked again$/);
  const again = s.asked.slice(before);
  expect(again).toContain('2026-07-01_2026-07-31');
  expect(again).toContain('2026-07-03_2026-07-03');
  expect(again).toContain('2026-11-20_2026-11-20');
  expect(again).not.toContain('2026-06-01_2026-06-30');
  expect(again).not.toContain('2026-07-02_2026-07-02');
  expect(store.map.get('tx/fund/month/2026-07-01_2026-07-31.html')!.text).toContain('07/03/2026');
  // the next run sees nothing new
  const p3 = await run('sync', deps(store, s.fetcher, []));
  expect(p3.backdated).toBeUndefined();
});

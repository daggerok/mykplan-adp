/// <reference types="bun" />
/// <reference types="node" />
/// <reference lib="esnext" />
import { describe, expect, test } from 'bun:test';
import type { Transaction } from '../model';
import { SheetsClient, type FetchLike } from './client';
import { TABS, defineTab } from './tabs';

// a small tab for layout tests
const RATE = defineTab<{ date: string; rothPct: number; preTaxPct: number }>('mykplan_rate', [
  { key: 'date', kind: 'text' },
  { key: 'rothPct', kind: 'num' },
  { key: 'preTaxPct', kind: 'num' },
], (r) => r.date);

// A tiny in-memory Sheets v4: tabs with a grid row count, values by row; enough for the calls the client makes
type FakeTab = { sheetId: number; rows: number; frozen: number; values: unknown[][] };
type Call = { method: string; url: string; body: unknown; auth: string };

function fakeSheets(opts: { expiredTokens?: string[]; gridRows?: number } = {}) {
  const tabs: Record<string, FakeTab> = {};
  const calls: Call[] = [];
  let nextId = 1;
  const json = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const rangeOf = (url: string): { tab: string; r1: number; r2: number } => {
    const m = /\/values\/([^?:]+)/.exec(url);
    const a1 = decodeURIComponent(m ? m[1] : '');
    // whole tab ("'mykplan_rate'") and whole rows ("'mykplan_rate'!1:1"), as the client uses for old layouts
    if (a1.indexOf('!') === -1) return { tab: a1.replace(/^'|'$/g, ''), r1: 1, r2: -1 };
    const rows = /^(.+)!(\d+):(\d+)$/.exec(a1);
    if (rows) return { tab: rows[1].replace(/^'|'$/g, ''), r1: Number(rows[2]), r2: Number(rows[3]) };
    const p = /^(.+)!([A-Z]+)(\d+)(?::([A-Z]+)(\d*))?$/.exec(a1);
    if (!p) throw new Error('bad range ' + a1);
    return { tab: p[1].replace(/^'|'$/g, ''), r1: Number(p[3]), r2: p[5] ? Number(p[5]) : Infinity };
  };
  const fetch: FetchLike = async (url, init) => {
    const method = (init && init.method) || 'GET';
    const headers = (init && init.headers) as Record<string, string>;
    const auth = headers.Authorization;
    const body: unknown = init && typeof init.body === 'string' ? JSON.parse(init.body) : undefined;
    calls.push({ method, url, body, auth });
    if ((opts.expiredTokens || []).some((t) => auth === 'Bearer ' + t)) return json(401, { error: { message: 'Request had invalid authentication credentials.' } });
    if (method === 'GET' && /\/spreadsheets\/[^/]+\?fields=/.test(url)) {
      return json(200, {
        properties: { title: 'Book' },
        sheets: Object.keys(tabs).map((t) => ({ properties: { title: t, sheetId: tabs[t].sheetId, gridProperties: { rowCount: tabs[t].rows, frozenRowCount: tabs[t].frozen || undefined } } })),
      });
    }
    if (method === 'POST' && url.endsWith(':batchUpdate')) {
      const req = (body as { requests: Record<string, { properties: { title?: string; sheetId?: number; gridProperties?: { frozenRowCount?: number } } }>[] }).requests[0];
      if (req.addSheet) {
        const title = req.addSheet.properties.title || '';
        if (tabs[title]) return json(400, { error: { message: 'A sheet with the name "' + title + '" already exists.' } });
        tabs[title] = { sheetId: nextId++, rows: opts.gridRows || 1000, frozen: (req.addSheet.properties.gridProperties || {}).frozenRowCount || 0, values: [] };
        return json(200, { replies: [{ addSheet: { properties: { title, sheetId: tabs[title].sheetId, gridProperties: { rowCount: tabs[title].rows, frozenRowCount: tabs[title].frozen } } } }] });
      }
      if (req.updateSheetProperties) {
        const id = req.updateSheetProperties.properties.sheetId;
        Object.keys(tabs).forEach((t) => { if (tabs[t].sheetId === id) tabs[t].frozen = 1; });
        return json(200, { replies: [{}] });
      }
    }
    if (url.indexOf('/values/') !== -1) {
      const r = rangeOf(url);
      const tab = tabs[r.tab];
      if (!tab) return json(400, { error: { message: 'Unable to parse range: ' + r.tab } });
      if (method === 'PUT') {
        const values = (body as { values: unknown[][] }).values;
        // like the real API: only the cells of the range change, cells to the right of it stay (ranges start at A)
        values.forEach((row, i) => { const next = (tab.values[r.r1 - 1 + i] || []).slice(); row.forEach((v, j) => { next[j] = v; }); tab.values[r.r1 - 1 + i] = next; });
        tab.rows = Math.max(tab.rows, r.r1 - 1 + values.length);
        return json(200, { updatedRows: values.length });
      }
      if (method === 'POST' && url.indexOf(':clear') !== -1) {
        if (r.r2 === -1) { tab.values = []; return json(200, {}); }
        if (r.r2 > tab.rows) return json(400, { error: { message: 'Range exceeds grid limits' } });
        for (let i = r.r1 - 1; i < Math.min(r.r2, tab.values.length); i++) tab.values[i] = [];
        return json(200, {});
      }
      if (method === 'GET') {
        const rows = tab.values.slice(r.r1 - 1);
        while (rows.length && !(rows[rows.length - 1] || []).length) rows.pop();
        return json(200, rows.length ? { values: rows.map((x) => x || []) } : {});
      }
    }
    return json(404, { error: { message: 'Requested entity was not found.' } });
  };
  return { tabs, calls, fetch };
}

const tx = (n: number, amount = n * 100): Transaction => ({
  id: 'tx-' + n, activityDate: '2026-01-0' + n, fund: 'Fund', type: 'contribution', rawType: 'Contribution', amount, origin: 'txPrint',
});

function client(fake: ReturnType<typeof fakeSheets>, tokens: string[] = ['t1']) {
  const asked: boolean[] = [];
  let i = 0;
  const c = new SheetsClient({
    fetch: fake.fetch,
    getToken: async (force) => { asked.push(force); if (force) i += 1; return tokens[Math.min(i, tokens.length - 1)]; },
    spreadsheetId: 'book',
  });
  return { c, asked };
}

describe('SheetsClient', () => {
  test('ensureTab creates the tab with a frozen header row', async () => {
    const fake = fakeSheets();
    const { c } = client(fake);
    const tab = await c.ensureTab(TABS.tx);
    expect(tab.title).toBe('mykplan_tx');
    expect(fake.tabs.mykplan_tx.frozen).toBe(1);
    expect(fake.tabs.mykplan_tx.values[0]).toEqual(TABS.tx.columns);
    const put = fake.calls.filter((x) => x.method === 'PUT')[0];
    expect(put.url).toContain('valueInputOption=RAW');
    // a second call keeps the tab and rewrites only the header
    await c.ensureTab(TABS.tx);
    expect(fake.calls.filter((x) => x.url.endsWith(':batchUpdate'))).toHaveLength(1);
  });

  test('a tab with another header is never cleared: writing stops with a clear error', async () => {
    const fake = fakeSheets();
    fake.tabs.mykplan_rate = { sheetId: 7, rows: 10, frozen: 1, values: [['id', 'date', 'roth_pct', 'pre_tax_pct'], ['2026-01-01', '2026-01-01', 4, 0]] };
    const { c } = client(fake);
    await expect(c.upsertById(RATE, [{ date: '2026-02-01', rothPct: 6, preTaxPct: 0 }])).rejects.toThrow('header differs');
    expect(fake.tabs.mykplan_rate.values[1]).toEqual(['2026-01-01', '2026-01-01', 4, 0]);
    expect(fake.calls.some((x) => x.url.indexOf(':clear') !== -1)).toBe(false);
  });

  test('extra columns on the right (the owner\'s notes) are kept', async () => {
    const fake = fakeSheets();
    fake.tabs.mykplan_rate = { sheetId: 7, rows: 10, frozen: 1, values: [['date', 'roth_pct', 'pre_tax_pct', 'my notes'], ['2026-01-01', 4, 0, 'raise']] };
    const { c } = client(fake);
    await c.upsertById(RATE, [{ date: '2026-02-01', rothPct: 6, preTaxPct: 0 }]);
    expect(fake.tabs.mykplan_rate.values[0]).toEqual(['date', 'roth_pct', 'pre_tax_pct', 'my notes']);
    expect(fake.tabs.mykplan_rate.values[2]!.slice(0, 3)).toEqual(['2026-02-01', 6, 0]);
  });

  test('ensureTab freezes row 1 of an existing unfrozen tab', async () => {
    const fake = fakeSheets();
    fake.tabs.mykplan_rate = { sheetId: 7, rows: 10, frozen: 0, values: [] };
    const { c } = client(fake);
    await c.ensureTab(RATE);
    expect(fake.tabs.mykplan_rate.frozen).toBe(1);
  });

  test('writeAll puts rows 2..n+1 in one PUT and clears the tail up to the grid row count', async () => {
    const fake = fakeSheets({ gridRows: 20 });
    const { c } = client(fake);
    await c.writeAll(TABS.tx, [tx(1), tx(2), tx(3), tx(4)]);
    fake.calls.length = 0;
    await c.writeAll(TABS.tx, [tx(5), tx(6)]);
    const puts = fake.calls.filter((x) => x.method === 'PUT');
    expect(puts.map((x) => decodeURIComponent(x.url.split('/values/')[1].split('?')[0]))).toEqual(['mykplan_tx!A1:K1', 'mykplan_tx!A2:K3']);
    const clears = fake.calls.filter((x) => x.url.indexOf(':clear') !== -1);
    expect(clears.map((x) => decodeURIComponent(x.url.split('/values/')[1].split(':clear')[0]))).toEqual(['mykplan_tx!A4:K20']);
    expect(await c.readRows(TABS.tx)).toEqual([tx(5), tx(6)]);
  });

  test('writeAll of more rows than the grid: no clear past the grid', async () => {
    const fake = fakeSheets({ gridRows: 3 });
    const { c } = client(fake);
    await c.writeAll(TABS.tx, [tx(1), tx(2), tx(3), tx(4), tx(5)]);
    expect(fake.calls.filter((x) => x.url.indexOf(':clear') !== -1)).toHaveLength(0);
    expect(await c.readRows(TABS.tx)).toHaveLength(5);
  });

  test('writeAll of nothing clears every data row', async () => {
    const fake = fakeSheets({ gridRows: 5 });
    const { c } = client(fake);
    await c.writeAll(TABS.tx, [tx(1)]);
    await c.writeAll(TABS.tx, []);
    expect(await c.readRows(TABS.tx)).toEqual([]);
  });

  test('upsertById keeps stored rows, replaces known ids, appends new ones', async () => {
    const fake = fakeSheets({ gridRows: 10 });
    const { c } = client(fake);
    await c.writeAll(TABS.tx, [tx(1), tx(2), tx(3)]);
    const res = await c.upsertById(TABS.tx, [tx(2, 999), tx(4), tx(4, 444)]);
    expect(res).toEqual({ inserted: 1, updated: 1, total: 4 });
    expect(await c.readRows(TABS.tx)).toEqual([tx(1), tx(2, 999), tx(3), tx(4, 444)]);
  });

  test('upsertById with merge and sort', async () => {
    const fake = fakeSheets();
    const { c } = client(fake);
    await c.upsertById(TABS.tx, [tx(2), tx(1)]);
    await c.upsertById(TABS.tx, [tx(1, 5)], {
      merge: (old, inc) => ({ ...inc, amount: old.amount + inc.amount }),
      sort: (a, b) => (a.id < b.id ? -1 : 1),
    });
    expect(await c.readRows(TABS.tx)).toEqual([tx(1, 105), tx(2)]);
  });

  test('a 401 renews the token once and repeats the call', async () => {
    const fake = fakeSheets({ expiredTokens: ['old'] });
    const { c, asked } = client(fake, ['old', 'new']);
    const res = await c.listTabs();
    expect(res.title).toBe('Book');
    expect(asked).toEqual([false, true]);
    expect(fake.calls.map((x) => x.auth)).toEqual(['Bearer old', 'Bearer new']);
  });

  test('a second 401 surfaces as a clear error, no endless retry', async () => {
    const fake = fakeSheets({ expiredTokens: ['old', 'still-old'] });
    const { c } = client(fake, ['old', 'still-old']);
    let err: unknown;
    try { await c.listTabs(); } catch (e) { err = e; }
    expect(fake.calls).toHaveLength(2);
    expect((err as { status: number }).status).toBe(401);
    expect(String(err)).toContain('Google Sheets 401 on list tabs');
  });

  test('errors carry the status and Google\'s message', async () => {
    const fake = fakeSheets();
    const { c } = client(fake);
    let err: unknown;
    try { await c.readRows(TABS.fund); } catch (e) { err = e; }
    expect((err as { status: number }).status).toBe(400);
    expect(String(err)).toContain('read mykplan_fund: Unable to parse range');
  });

  test('no spreadsheet id is a clear error before any request', async () => {
    const fake = fakeSheets();
    const c = new SheetsClient({ fetch: fake.fetch, getToken: async () => 't', spreadsheetId: ' ' });
    await expect(c.listTabs()).rejects.toThrow('No spreadsheet');
    expect(fake.calls).toHaveLength(0);
  });

  test('works with a fetch typed as the global one', async () => {
    const fake = fakeSheets();
    const f = fake.fetch as unknown as typeof fetch;
    const c = new SheetsClient({ fetch: f, getToken: async () => 't', spreadsheetId: 'book' });
    expect((await c.listTabs()).tabs).toEqual([]);
  });
});

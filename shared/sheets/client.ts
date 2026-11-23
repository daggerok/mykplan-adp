/// <reference lib="esnext" />
// Google Sheets API v4 over an injected fetch and token getter, so the viewer (window.fetch + GIS) and
// the userscript (GM_xmlhttpRequest + the token the viewer shared) run the same code. Rewritten after
// daggerok/twitter src/sheets.ts: writes are "overwrite rows 2..n+1 in one PUT, then clear the tail",
// so a failed PUT leaves the old rows in place; the clear ends at the grid row count (a range past the
// grid is a 400). A 401 asks the getter for a fresh token once and repeats the call once
import type { Cell, TabSpec } from './tabs';

const API = 'https://sheets.googleapis.com/v4';

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;
// force = true: the last token got a 401, renew it even when it looks fresh
export type TokenGetter = (force: boolean) => Promise<string>;

export interface SheetsClientOptions {
  fetch: FetchLike;
  getToken: TokenGetter;
  spreadsheetId: string;
}

export interface TabInfo {
  title: string;
  sheetId: number;
  rows: number;
  frozenRows: number;
}

export class SheetsError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'SheetsError';
    this.status = status;
  }
}

export const statusOf = (e: unknown): number =>
  typeof e === 'object' && e !== null && typeof (e as { status?: unknown }).status === 'number' ? (e as { status: number }).status : 0;

/** Tab names here are mykplan_*, but any name is quoted the way A1 notation wants it. */
export const quoteTab = (name: string): string => (/^[A-Za-z0-9_]+$/.test(name) ? name : "'" + name.replace(/'/g, "''") + "'");
const a1 = (tab: string, cells: string): string => quoteTab(tab) + '!' + cells;
const enc = (tab: string, cells: string): string => encodeURIComponent(a1(tab, cells));

type Meta = {
  properties?: { title?: string };
  sheets?: { properties?: SheetProps }[];
};
type SheetProps = { title?: string; sheetId?: number; gridProperties?: { rowCount?: number; frozenRowCount?: number } };

const toInfo = (p: SheetProps | undefined): TabInfo => ({
  title: (p && p.title) || '',
  sheetId: p && typeof p.sheetId === 'number' ? p.sheetId : -1,
  rows: (p && p.gridProperties && p.gridProperties.rowCount) || 0,
  frozenRows: (p && p.gridProperties && p.gridProperties.frozenRowCount) || 0,
});

export interface UpsertOptions<T> {
  // how a stored record and an incoming one with the same id combine (default: the incoming one wins)
  merge?: (stored: T, incoming: T) => T;
  // order of the written rows (default: stored order, new ids appended in their incoming order)
  sort?: (a: T, b: T) => number;
}

export class SheetsClient {
  private readonly opts: SheetsClientOptions;

  constructor(opts: SheetsClientOptions) {
    this.opts = opts;
  }

  get spreadsheetId(): string {
    return this.opts.spreadsheetId;
  }

  /** One Sheets call; a 401 renews the token and repeats once. Errors carry the status and Google's message. */
  async call<T>(method: string, path: string, body?: unknown, what?: string): Promise<T> {
    let token = await this.opts.getToken(false);
    let res = await this.send(method, path, token, body);
    if (res.status === 401) {
      token = await this.opts.getToken(true);
      res = await this.send(method, path, token, body);
    }
    const textBody = await res.text();
    let json: unknown = null;
    try { json = textBody ? JSON.parse(textBody) : null; } catch { /* not json */ }
    if (!res.ok) {
      const err = json as { error?: { message?: string } } | null;
      const msg = (err && err.error && err.error.message) || textBody.slice(0, 200) || 'HTTP ' + res.status;
      const hint = res.status === 401 ? ' (sign in to Google again)'
        : res.status === 403 ? ' (no access to this spreadsheet with this Google account)'
        : res.status === 404 ? ' (spreadsheet not found: check its URL)'
        : '';
      throw new SheetsError('Google Sheets ' + res.status + ' on ' + (what || method + ' ' + path.split('?')[0]) + ': ' + msg + hint, res.status);
    }
    return json as T;
  }

  private send(method: string, path: string, token: string, body: unknown): Promise<Response> {
    const headers: Record<string, string> = { Authorization: 'Bearer ' + token };
    const init: RequestInit = { method, headers };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    return this.opts.fetch(API + path, init);
  }

  private get base(): string {
    const id = this.opts.spreadsheetId.trim();
    if (!id) throw new SheetsError('No spreadsheet: attach one in Setup first', 0);
    return '/spreadsheets/' + encodeURIComponent(id);
  }

  /** The spreadsheet title and its tabs (Attach checks access with it). */
  async listTabs(): Promise<{ title: string; tabs: TabInfo[] }> {
    const m = await this.call<Meta>('GET', this.base + '?fields=properties.title,sheets.properties(title,sheetId,gridProperties(rowCount,frozenRowCount))', undefined, 'list tabs');
    const tabs = (m && m.sheets ? m.sheets : []).map((s) => toInfo(s.properties)).filter((t) => !!t.title);
    return { title: (m && m.properties && m.properties.title) || '', tabs };
  }

  /** A new spreadsheet (Create in Setup); does not need the bound spreadsheet id. */
  async createSpreadsheet(title: string): Promise<{ id: string; url: string }> {
    const res = await this.call<{ spreadsheetId?: string; spreadsheetUrl?: string }>('POST', '/spreadsheets', {
      properties: { title: title.trim() || 'mykplan-adp' },
    }, 'create spreadsheet');
    if (!res || !res.spreadsheetId) throw new SheetsError('Google Sheets did not return the new spreadsheet id', 0);
    return { id: res.spreadsheetId, url: res.spreadsheetUrl || 'https://docs.google.com/spreadsheets/d/' + res.spreadsheetId + '/edit' };
  }

  /** The tab exists, row 1 holds the header and is frozen. Returns the tab with its grid size. */
  async ensureTab<T>(spec: TabSpec<T>): Promise<TabInfo> {
    const { tabs } = await this.listTabs();
    let tab: TabInfo | undefined = tabs.filter((t) => t.title === spec.name)[0];
    if (!tab) {
      try {
        const r = await this.call<{ replies?: { addSheet?: { properties?: SheetProps } }[] }>('POST', this.base + ':batchUpdate', {
          requests: [{ addSheet: { properties: { title: spec.name, gridProperties: { frozenRowCount: 1 } } } }],
        }, 'create tab ' + spec.name);
        const added = r && r.replies && r.replies[0] && r.replies[0].addSheet ? r.replies[0].addSheet.properties : undefined;
        tab = added ? toInfo(added) : undefined;
      } catch (e) {
        // a concurrent writer (viewer and userscript) may have added it: 400 "already exists"; others surface
        if (statusOf(e) !== 400) throw e;
      }
      if (!tab) tab = (await this.listTabs()).tabs.filter((t) => t.title === spec.name)[0];
      if (!tab) throw new SheetsError('Tab ' + spec.name + ' could not be created', 0);
    } else if (tab.frozenRows < 1 && tab.sheetId >= 0) {
      await this.call('POST', this.base + ':batchUpdate', {
        requests: [{ updateSheetProperties: { properties: { sheetId: tab.sheetId, gridProperties: { frozenRowCount: 1 } }, fields: 'gridProperties.frozenRowCount' } }],
      }, 'freeze header of ' + spec.name);
      tab = { title: tab.title, sheetId: tab.sheetId, rows: tab.rows, frozenRows: 1 };
    }
    // The header must start with this version's columns; extra columns on the right (the owner's notes, formulas)
    // are kept. A different layout is never cleared (review 2026-11-22: a hand-edited header or a viewer newer than
    // the installed script would wipe the tab): writing stops with a clear error instead
    const head = await this.call<{ values?: unknown[][] }>('GET', this.base + '/values/' + enc(spec.name, '1:1') + '?valueRenderOption=UNFORMATTED_VALUE', undefined, 'read header of ' + spec.name);
    const current = (head && head.values && head.values[0] ? head.values[0] : []).map((v) => String(v).trim());
    const ours = current.slice(0, spec.columns.length);
    const empty = ours.every((v) => v === '');
    if (!empty && ours.join('\u0001') !== spec.columns.join('\u0001')) {
      throw new SheetsError(`${spec.name}: its header differs from this version (${ours.slice(0, 4).join(', ')}…): update the script and the page to the same version, or rename the tab to start it fresh`, 409);
    }
    const cells = 'A1:' + spec.lastCol + '1';
    await this.call('PUT', this.base + '/values/' + enc(spec.name, cells) + '?valueInputOption=RAW', {
      range: a1(spec.name, cells),
      majorDimension: 'ROWS',
      values: [spec.columns.slice()],
    }, 'write header of ' + spec.name);
    return tab;
  }

  /** Every record of a tab (rows 2..), rows without an id skipped. */
  async readRows<T>(spec: TabSpec<T>): Promise<T[]> {
    const r = await this.call<{ values?: unknown[][] }>('GET', this.base + '/values/' + enc(spec.name, 'A2:' + spec.lastCol) + '?valueRenderOption=UNFORMATTED_VALUE&majorDimension=ROWS', undefined, 'read ' + spec.name);
    const out: T[] = [];
    (r && r.values ? r.values : []).forEach((row) => {
      const rec = spec.fromRow(row);
      if (rec) out.push(rec);
    });
    return out;
  }

  /**
   * Replace the tab's rows with these records: header ensured, rows 2..n+1 in one PUT (the grid grows as
   * needed), then the old rows past n+1 cleared up to the grid row count. Duplicate ids: the last one wins
   */
  async writeAll<T>(spec: TabSpec<T>, records: T[]): Promise<{ written: number }> {
    return this.writeRows(spec, await this.ensureTab(spec), records);
  }

  private async writeRows<T>(spec: TabSpec<T>, tab: TabInfo, records: T[]): Promise<{ written: number }> {
    const rows = dedupe(spec, records).map(spec.toRow);
    if (rows.length) {
      const cells = 'A2:' + spec.lastCol + (rows.length + 1);
      await this.call('PUT', this.base + '/values/' + enc(spec.name, cells) + '?valueInputOption=RAW', {
        range: a1(spec.name, cells),
        majorDimension: 'ROWS',
        values: rows as Cell[][],
      }, 'write ' + spec.name);
    }
    // the PUT only adds grid rows up to n+1, so the grid size seen before it bounds the old tail
    if (tab.rows > rows.length + 1) {
      const tail = 'A' + (rows.length + 2) + ':' + spec.lastCol + tab.rows;
      await this.call('POST', this.base + '/values/' + enc(spec.name, tail) + ':clear', {}, 'clear the tail of ' + spec.name);
    }
    return { written: rows.length };
  }

  /** Read the tab, merge the records in by id, write it back. */
  async upsertById<T>(spec: TabSpec<T>, records: T[], options?: UpsertOptions<T>): Promise<{ inserted: number; updated: number; total: number }> {
    const tab = await this.ensureTab(spec);
    const stored = await this.readRows(spec);
    const merge = options && options.merge;
    const order: string[] = [];
    const byId = new Map<string, T>();
    stored.forEach((r) => {
      const id = spec.idOf(r);
      if (!byId.has(id)) order.push(id);
      byId.set(id, r);
    });
    const storedIds = new Set<string>(order);
    const counted = new Set<string>();
    let inserted = 0;
    let updated = 0;
    records.forEach((r) => {
      const id = spec.idOf(r);
      const old = byId.get(id);
      if (old === undefined) order.push(id);
      if (!counted.has(id)) {
        counted.add(id);
        if (storedIds.has(id)) updated += 1;
        else inserted += 1;
      }
      byId.set(id, old !== undefined && merge ? merge(old, r) : r);
    });
    const all = order.map((id) => byId.get(id) as T);
    if (options && options.sort) all.sort(options.sort);
    await this.writeRows(spec, tab, all);
    return { inserted, updated, total: all.length };
  }
}

function dedupe<T>(spec: TabSpec<T>, records: T[]): T[] {
  const last = new Map<string, number>();
  records.forEach((r, i) => last.set(spec.idOf(r), i));
  return records.filter((r, i) => last.get(spec.idOf(r)) === i);
}

/// <reference lib="esnext" />
// The adp_* tabs of the shared Google Sheet (the plan section 9): one record type per tab, column A is always
// the id (the record's own id or a key built from its fields), row 1 is the header. Cells go out through
// valueInputOption=RAW: cents and other numbers as numbers, ISO dates and ids as text, undefined as an
// empty cell. Rows come back as UNFORMATTED_VALUE, so numbers arrive as numbers; strings are parsed too,
// a hand-edited cell must not break a read
import type { Period, Transaction } from '../model';
import type { Document, ElectionChange, ForecastScenario, Fund, Snapshot, Statement } from '../model/records';

export type Cell = string | number | boolean;

// text: as is; cents: integer (rounded); num: any finite number; bool: TRUE/FALSE; json: an array or object
export type Kind = 'text' | 'cents' | 'num' | 'bool' | 'json';

export interface Col<T> {
  key: Extract<keyof T, string>;
  kind: Kind;
  optional?: boolean;
  // allowed values of a text column (an unknown value reads as the first one, or as nothing when optional)
  values?: readonly string[];
  // json columns: the value an empty or broken cell reads as
  empty?: '[]' | '{}';
}

export interface TabSpec<T> {
  name: string;
  // header row: 'id' first only for tabs whose records carry a real id, then the snake_case column names
  columns: string[];
  lastCol: string;
  idOf: (r: T) => string;
  toRow: (r: T) => Cell[];
  fromRow: (row: unknown[]) => T | null;
}

// owner 2026-11-22: the tabs carry the app name (mykplan_), not the provider (adp_)
export const TAB_PREFIX = 'mykplan_';
const CELL_LIMIT = 50000; // Google Sheets: characters per cell

/** 1 -> A, 26 -> Z, 27 -> AA */
export function columnLetter(n: number): string {
  let s = '';
  for (let i = n; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s;
  return s;
}

function text(v: unknown): string {
  return v === undefined || v === null ? '' : String(v);
}

function number(v: unknown): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  const t = text(v).trim().replace(/,/g, '');
  if (!t) return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

function encode<T>(col: Col<T>, v: unknown): Cell {
  if (v === undefined || v === null) return '';
  switch (col.kind) {
    case 'cents': return typeof v === 'number' ? Math.round(v) : text(v);
    case 'num': return typeof v === 'number' ? v : text(v);
    case 'bool': return v === true;
    case 'json': return JSON.stringify(v).slice(0, CELL_LIMIT);
    default: return text(v).slice(0, CELL_LIMIT);
  }
}

// undefined = leave the field out
function decode<T>(col: Col<T>, v: unknown): unknown {
  const raw = text(v);
  switch (col.kind) {
    case 'cents': {
      const n = number(v);
      if (n === undefined) return col.optional ? undefined : 0;
      return Math.round(n);
    }
    case 'num': {
      const n = number(v);
      return n === undefined ? (col.optional ? undefined : 0) : n;
    }
    case 'bool':
      if (raw === '' && col.optional) return undefined;
      return v === true || raw.toUpperCase() === 'TRUE';
    case 'json': {
      const empty = col.empty || '[]';
      let parsed: unknown;
      try { parsed = JSON.parse(raw || empty); } catch { parsed = JSON.parse(empty); }
      const wantArray = empty === '[]';
      const ok = wantArray ? Array.isArray(parsed) : typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed);
      return ok ? parsed : JSON.parse(empty);
    }
    default: {
      if (col.values) {
        if (col.values.indexOf(raw) !== -1) return raw;
        return col.optional ? undefined : col.values[0];
      }
      if (raw === '' && col.optional) return undefined;
      return raw;
    }
  }
}

/**
 * A tab from its columns. With `idKey` the record carries its own id (column A holds it and fromRow puts it
 * back), otherwise `idOf` builds the key from fields and column A is only for upserts.
 */
export const snakeCase = (k: string): string => k.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/([A-Z])([A-Z][a-z])/g, '$1_$2').toLowerCase();

export function defineTab<T>(name: string, cols: Col<T>[], idOf: (r: T) => string, idKey?: Extract<keyof T, string>): TabSpec<T> {
  // an "id" column only where the record has a real id (transactions, scenarios). Other tabs are matched by their
  // own key columns (from|to|scope|key, date|fund, ...): a glued key in column A only repeated them (owner
  // 2026-11-22: "why we haven't split it into many columns")
  const hasId = !!idKey;
  const data = cols.map((c) => snakeCase(c.key));
  const columns = hasId ? ['id'].concat(data) : data;
  const offset = hasId ? 1 : 0;
  return {
    name,
    columns,
    lastCol: columnLetter(columns.length),
    idOf,
    toRow: (r) => {
      const fields = r as unknown as Record<string, unknown>;
      const cells = cols.map((c) => encode(c, fields[c.key]));
      return hasId ? [idOf(r) as Cell].concat(cells) : cells;
    },
    fromRow: (row) => {
      if (hasId ? !text(row[0]).trim() : row.every((v) => text(v).trim() === '')) return null;
      const out: Record<string, unknown> = {};
      if (idKey) out[idKey] = text(row[0]).trim();
      cols.forEach((c, i) => {
        const v = decode(c, row[i + offset]);
        if (v !== undefined) out[c.key] = v;
      });
      return out as unknown as T;
    },
  };
}

const key = (...parts: (string | undefined)[]): string => parts.map((p) => p || '').join('|');

const ORIGINS = ['txPrint', 'statement', 'qfx'] as const;
const SOURCES = ['EE_ROTH', 'EE_PRETAX', 'ER_MATCH', 'ER_NEC'] as const;
const TX_TYPES = ['contribution', 'dividend', 'transferIn', 'transferOut', 'other'] as const;

export const TX = defineTab<Transaction>('mykplan_tx', [
  { key: 'activityDate', kind: 'text' },
  { key: 'payCheckDate', kind: 'text', optional: true },
  { key: 'fund', kind: 'text' },
  { key: 'source', kind: 'text', optional: true, values: SOURCES },
  { key: 'type', kind: 'text', values: TX_TYPES },
  { key: 'rawType', kind: 'text' },
  { key: 'units', kind: 'num', optional: true },
  { key: 'price', kind: 'num', optional: true },
  { key: 'amount', kind: 'cents' },
  { key: 'origin', kind: 'text', values: ORIGINS },
], (r) => r.id, 'id');

// Denormalized (owner 2026-11-22: "if there are few tables used for the same purpose I would prefer
// denormalization"): one tab per kind of row, a scope column for rows of the same shape, small fixed sets as
// columns, nothing that is only a regrouping of adp_tx (paychecks, contributions, rebalances: the viewer derives them)

// every summary of a span of time: windows and months per account, fund and source, the YTD block of
// AccountHighlights (scope ytd) and quarterly statement summaries (scope statement)
export const PERIOD = defineTab<Period>('mykplan_period', [
  { key: 'from', kind: 'text' },
  { key: 'to', kind: 'text' },
  { key: 'scope', kind: 'text', values: ['account', 'fund', 'source', 'ytd', 'statement'] },
  { key: 'key', kind: 'text', optional: true },
  { key: 'begin', kind: 'cents' },
  { key: 'contributions', kind: 'cents' },
  { key: 'dividends', kind: 'cents' },
  { key: 'transfersIn', kind: 'cents' },
  { key: 'transfersOut', kind: 'cents' },
  { key: 'mvc', kind: 'cents' },
  { key: 'end', kind: 'cents' },
  { key: 'begUnits', kind: 'num', optional: true },
  { key: 'begPrice', kind: 'num', optional: true },
  { key: 'endUnits', kind: 'num', optional: true },
  { key: 'endPrice', kind: 'num', optional: true },
  { key: 'personalRoR', kind: 'num', optional: true },
  { key: 'vested', kind: 'cents', optional: true },
  { key: 'credits', kind: 'cents', optional: true },
  { key: 'debits', kind: 'cents', optional: true },
  { key: 'ytdContributions', kind: 'cents', optional: true },
], (r) => key(r.from, r.to, r.scope, r.key));

// one row per day and fund, and one row per day with fund = TOTAL_FUND carrying the account NAV and day return
// (was adp_daily_fund + adp_daily_portfolio)
export const TOTAL_FUND = 'Total';
export interface DailyRow {
  date: string;
  fund: string;
  begUnits?: number;
  begPrice?: number;
  endUnits?: number;
  endPrice?: number;
  begValue?: number;
  endValue: number;
  contributions: number;
  dividends?: number;
  transfersIn: number;
  transfersOut: number;
  mvc: number;
  dayReturn?: number;
  nav?: number;
}
export const DAILY = defineTab<DailyRow>('mykplan_daily', [
  { key: 'date', kind: 'text' },
  { key: 'fund', kind: 'text' },
  { key: 'begUnits', kind: 'num', optional: true },
  { key: 'begPrice', kind: 'num', optional: true },
  { key: 'endUnits', kind: 'num', optional: true },
  { key: 'endPrice', kind: 'num', optional: true },
  { key: 'begValue', kind: 'cents', optional: true },
  { key: 'endValue', kind: 'cents' },
  { key: 'contributions', kind: 'cents' },
  { key: 'dividends', kind: 'cents', optional: true },
  { key: 'transfersIn', kind: 'cents' },
  { key: 'transfersOut', kind: 'cents' },
  { key: 'mvc', kind: 'cents' },
  { key: 'dayReturn', kind: 'num', optional: true },
  { key: 'nav', kind: 'num', optional: true },
], (r) => key(r.date, r.fund));

// balances on a day per fund or source, with the allocation of that day (was adp_snapshot + adp_alloc)
export type SnapshotRow = Snapshot & { assetClass?: string; pct?: number; futurePct?: number };
export const SNAPSHOT = defineTab<SnapshotRow>('mykplan_snapshot', [
  { key: 'asOf', kind: 'text' },
  { key: 'scope', kind: 'text', values: ['fund', 'source'] },
  { key: 'key', kind: 'text' },
  { key: 'units', kind: 'num', optional: true },
  { key: 'price', kind: 'num', optional: true },
  { key: 'value', kind: 'cents' },
  { key: 'vested', kind: 'cents', optional: true },
  { key: 'assetClass', kind: 'text', optional: true },
  { key: 'pct', kind: 'num', optional: true },
  { key: 'futurePct', kind: 'num', optional: true },
], (r) => key(r.asOf, r.scope, r.key));

// the change journal with the contribution percents in force after each request (was adp_election + adp_rate)
export type ElectionRow = ElectionChange & { rothPct?: number; preTaxPct?: number };
export const ELECTION = defineTab<ElectionRow>('mykplan_election', [
  { key: 'requestedAt', kind: 'text' },
  { key: 'type', kind: 'text' },
  { key: 'system', kind: 'text' },
  { key: 'confirmNo', kind: 'text' },
  { key: 'oldValue', kind: 'text', optional: true },
  { key: 'newValue', kind: 'text', optional: true },
  { key: 'effectiveDate', kind: 'text', optional: true },
  { key: 'details', kind: 'text' },
  { key: 'rothPct', kind: 'num', optional: true },
  { key: 'preTaxPct', kind: 'num', optional: true },
], (r) => key(r.requestedAt, r.type, r.confirmNo));

// statement facts that are not money summaries (those are adp_period rows with scope statement)
export const STMT = defineTab<Statement>('mykplan_stmt', [
  { key: 'period', kind: 'text' },
  { key: 'planNumber', kind: 'text' },
  { key: 'contributionsThrough', kind: 'text' },
  { key: 'preTaxPct', kind: 'num' },
  { key: 'rothPct', kind: 'num' },
  { key: 'ratesAsOf', kind: 'text' },
  { key: 'vestingStart', kind: 'text' },
  { key: 'hireDate', kind: 'text' },
  { key: 'rorQuarter', kind: 'num' },
  { key: 'ror1y', kind: 'num' },
  { key: 'ror3yAnn', kind: 'num' },
  { key: 'annuitySingle', kind: 'cents' },
  { key: 'annuityJoint', kind: 'cents' },
  { key: 'annuityRate', kind: 'num' },
  { key: 'pdfName', kind: 'text' },
], (r) => r.period);

// a fund with its identifiers and its returns as columns (was adp_fund + adp_fund_return)
export type FundRow = Fund & { cusip?: string; returnsAsOf?: string } & Partial<Record<'retMtd' | 'retQtd' | 'retYtd' | 'ret1y' | 'ret3y' | 'ret5y' | 'ret10y' | 'retSi', number>>;
export const FUND = defineTab<FundRow>('mykplan_fund', [
  { key: 'name', kind: 'text' },
  { key: 'ticker', kind: 'text', optional: true },
  { key: 'cusip', kind: 'text', optional: true },
  { key: 'assetClass', kind: 'text' },
  { key: 'expenseRatio', kind: 'num', optional: true },
  { key: 'returnsAsOf', kind: 'text', optional: true },
  { key: 'retMtd', kind: 'num', optional: true },
  { key: 'retQtd', kind: 'num', optional: true },
  { key: 'retYtd', kind: 'num', optional: true },
  { key: 'ret1y', kind: 'num', optional: true },
  { key: 'ret3y', kind: 'num', optional: true },
  { key: 'ret5y', kind: 'num', optional: true },
  { key: 'ret10y', kind: 'num', optional: true },
  { key: 'retSi', kind: 'num', optional: true },
  { key: 'descUrl', kind: 'text', optional: true },
], (r) => r.name);

export const DOC = defineTab<Document>('mykplan_doc', [
  { key: 'type', kind: 'text' },
  { key: 'title', kind: 'text' },
  { key: 'date', kind: 'text' },
  { key: 'fileName', kind: 'text' },
  { key: 'storedIn', kind: 'text', values: ['fs', 'idb', 'export'] },
], (r) => key(r.type, r.date, r.fileName));

// birthDate is local only (the plan sections 7 and 12): the tab has no column for it, so a full
// ForecastScenario passed to toRow never leaks it, and fromRow returns the scenario without it
export type ScenarioRow = Pick<ForecastScenario, 'id' | 'name' | 'retireAge' | 'horizon' | 'contribMode' | 'contribParams' | 'employerRule' | 'limits' | 'returnSource' | 'returnPeriod' | 'customRate' | 'inflation' | 'real' | 'goals'>;
export const SCENARIO = defineTab<ScenarioRow>('mykplan_scenario', [
  { key: 'name', kind: 'text' },
  { key: 'retireAge', kind: 'num' },
  { key: 'horizon', kind: 'num' },
  { key: 'contribMode', kind: 'text', values: ['asNow', 'fixed', 'pctOfSalary'] },
  { key: 'contribParams', kind: 'json', empty: '{}' },
  { key: 'employerRule', kind: 'json', empty: '{}' },
  { key: 'limits', kind: 'json', empty: '{}' },
  { key: 'returnSource', kind: 'text', values: ['history', 'fund', 'benchmark', 'custom'] },
  { key: 'returnPeriod', kind: 'text' },
  { key: 'customRate', kind: 'num', optional: true },
  { key: 'inflation', kind: 'num' },
  { key: 'real', kind: 'bool' },
  { key: 'goals', kind: 'json', empty: '[]' },
], (r) => r.id, 'id');

/** The mykplan_* tabs, denormalized (9 instead of the plan's 18 adp_* tabs). */
export const TABS = {
  tx: TX,
  period: PERIOD,
  daily: DAILY,
  snapshot: SNAPSHOT,
  election: ELECTION,
  stmt: STMT,
  fund: FUND,
  doc: DOC,
  scenario: SCENARIO,
};

export const TAB_NAMES: string[] = [TX.name, PERIOD.name, DAILY.name, SNAPSHOT.name, ELECTION.name, STMT.name, FUND.name, DOC.name, SCENARIO.name];

// tabs of the earlier layouts (adp_* names, split tables); the viewer lists the ones present so the owner can delete them
export const OLD_TAB_NAMES = ['adp_tx', 'adp_period', 'adp_daily_fund', 'adp_daily_portfolio', 'adp_snapshot', 'adp_highlights', 'adp_contribution', 'adp_paycheck', 'adp_election', 'adp_rate', 'adp_rebalance', 'adp_alloc', 'adp_stmt', 'adp_source', 'adp_fund', 'adp_fund_return', 'adp_doc', 'adp_scenario'];

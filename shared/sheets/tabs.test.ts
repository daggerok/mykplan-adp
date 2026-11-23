/// <reference types="bun" />
/// <reference types="node" />
/// <reference lib="esnext" />
import { describe, expect, test } from 'bun:test';
import type { Period, Transaction } from '../model';
import type { ForecastScenario } from '../model/records';
import { columnLetter, OLD_TAB_NAMES, TAB_NAMES, TABS, type Cell, type TabSpec } from './tabs';

// what Sheets hands back: trailing empty cells are dropped from a row
const asRead = (row: Cell[]): unknown[] => {
  const out = row.slice();
  while (out.length && out[out.length - 1] === '') out.pop();
  return out;
};

const tx: Transaction = {
  id: 'tx-1', activityDate: '2026-01-02', payCheckDate: '2025-12-31', fund: 'Fund A', source: 'EE_ROTH',
  type: 'contribution', rawType: 'Contribution', units: 1.2345, price: 101.23, amount: 12497, origin: 'txPrint',
};
const scenario: ForecastScenario = {
  id: 'sc-1', name: 'Base', birthDate: '1980-06-30', retireAge: 67, horizon: 30, contribMode: 'pctOfSalary',
  contribParams: { pct: 10, raisePct: 3 }, employerRule: { matchPct: 100, matchUpToPct: 4, necPct: 3 },
  limits: { year: 2026, catchUp: true }, returnSource: 'benchmark', returnPeriod: '10Y', inflation: 3, real: false,
  goals: [10000000, 25000000],
};

// one sample per tab, with optional fields both filled and left out
const samples: [TabSpec<unknown>, unknown][] = [
  [TABS.tx as TabSpec<unknown>, tx],
  [TABS.tx as TabSpec<unknown>, { id: 'tx-2', activityDate: '2026-01-03', fund: 'Fund B', type: 'dividend', rawType: 'Dividend', amount: -7, origin: 'qfx' }],
  [TABS.period as TabSpec<unknown>, { from: '2026-01-01', to: '2026-03-31', scope: 'fund', key: 'Fund A', begin: 100000, contributions: 5000, dividends: 12, transfersIn: 0, transfersOut: -300, mvc: 4321, end: 109033, begUnits: 10.5, endPrice: 12.75, personalRoR: 4.21 }],
  [TABS.period as TabSpec<unknown>, { from: '2025-10-01', to: '2025-12-31', scope: 'statement', key: 'EE_PRETAX', begin: 1, contributions: 2, dividends: 3, transfersIn: 0, transfersOut: 0, mvc: 4, end: 10, vested: 10, ytdContributions: 8 }],
  [TABS.period as TabSpec<unknown>, { from: '2025-01-01', to: '2025-12-31', scope: 'ytd', begin: 1, contributions: 2, dividends: 0, transfersIn: 0, transfersOut: 0, mvc: 2, end: 5, credits: 3, debits: -4, personalRoR: 12.3 }],
  [TABS.daily as TabSpec<unknown>, { date: '2026-01-02', fund: 'Fund A', begUnits: 1, begPrice: 2, endUnits: 3, endPrice: 4.5, begValue: 200, endValue: 1350, contributions: 0, dividends: 0, transfersIn: 0, transfersOut: 0, mvc: 5 }],
  [TABS.daily as TabSpec<unknown>, { date: '2026-01-02', fund: 'Total', begValue: 1, endValue: 2, contributions: 3, transfersIn: 0, transfersOut: 0, mvc: -1, dayReturn: -0.0012, nav: 100.5 }],
  [TABS.snapshot as TabSpec<unknown>, { asOf: '2026-01-02', scope: 'source', key: 'ER_MATCH', value: 99999, vested: 50000 }],
  [TABS.snapshot as TabSpec<unknown>, { asOf: '2026-01-02', scope: 'fund', key: 'Fund A', units: 1.5, price: 2, value: 300, assetClass: 'Large Cap', pct: 60, futurePct: 70 }],
  [TABS.election as TabSpec<unknown>, { requestedAt: '2026-01-01', type: 'Contribution rate', system: 'Web', confirmNo: 'C-1', newValue: '10%', details: 'x, "y"', rothPct: 10, preTaxPct: 0 }],
  [TABS.stmt as TabSpec<unknown>, { period: '2025-Q4', planNumber: 'P1', contributionsThrough: '2025-12-31', preTaxPct: 0, rothPct: 10, ratesAsOf: '2025-12-31', vestingStart: '2020-01-01', hireDate: '2020-01-01', rorQuarter: 2.1, ror1y: 15, ror3yAnn: 9.9, annuitySingle: 123400, annuityJoint: 110000, annuityRate: 4.5, pdfName: 'q4.pdf' }],
  [TABS.fund as TabSpec<unknown>, { name: 'Fund A', assetClass: 'Large Cap', ticker: 'AAAA', cusip: '000000001', expenseRatio: 0.04, returnsAsOf: '2025-12-31', ret1y: 15.2, retSi: 7.5 }],
  [TABS.fund as TabSpec<unknown>, { name: 'Fund B', assetClass: 'Bond' }],
  [TABS.doc as TabSpec<unknown>, { type: 'statement', title: 'Q4', date: '2025-12-31', fileName: 'q4.pdf', storedIn: 'idb' }],
];

describe('tabs', () => {
  test('9 denormalized tabs, all mykplan_ prefixed, unique, id only where the record has one', () => {
    expect(TAB_NAMES).toHaveLength(9);
    expect(new Set(TAB_NAMES).size).toBe(9);
    TAB_NAMES.forEach((n) => expect(n.startsWith('mykplan_')).toBe(true));
    OLD_TAB_NAMES.forEach((n) => expect(TAB_NAMES).not.toContain(n));
    Object.keys(TABS).forEach((k) => {
      const spec = (TABS as Record<string, TabSpec<unknown>>)[k];
      // a real id only for transactions and scenarios; the others are matched by their own key columns
      expect(spec.columns[0] === 'id').toBe(k === 'tx' || k === 'scenario');
      expect(new Set(spec.columns).size).toBe(spec.columns.length);
      expect(spec.lastCol).toBe(columnLetter(spec.columns.length));
    });
  });

  test.each(samples.map((s, i) => [s[0].name + ' #' + i, s[0], s[1]] as [string, TabSpec<unknown>, unknown]))('%s round-trips', (_n, spec, rec) => {
    const row = spec.toRow(rec);
    expect(row).toHaveLength(spec.columns.length);
    if (spec.columns[0] === 'id') expect(row[0]).toBe(spec.idOf(rec));
    expect(spec.fromRow(asRead(row))).toEqual(rec);
    // the key is rebuilt from the record's own columns after a read, so upserts still match rows
    expect(spec.idOf(spec.fromRow(asRead(row)) as unknown)).toBe(spec.idOf(rec));
  });

  test('cents are integers, dates text, undefined an empty cell', () => {
    const row = TABS.tx.toRow({ ...tx, payCheckDate: undefined, amount: 12497.4 });
    const col = (name: string): Cell => row[TABS.tx.columns.indexOf(name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase())];
    expect(col('amount')).toBe(12497);
    expect(col('activityDate')).toBe('2026-01-02');
    expect(col('payCheckDate')).toBe('');
    expect(col('units')).toBe(1.2345);
  });

  test('hand-edited cells still read', () => {
    const t = TABS.tx.fromRow(['tx-9', '2026-02-01', '', 'F', 'BOGUS', 'nope', 'Raw', '1,000.5', '', '1,234', 'statement']);
    expect(t).toEqual({ id: 'tx-9', activityDate: '2026-02-01', fund: 'F', type: 'contribution', rawType: 'Raw', units: 1000.5, amount: 1234, origin: 'statement' });
    expect(TABS.tx.fromRow(['', '2026-02-01'])).toBeNull();
    expect(TABS.tx.fromRow([])).toBeNull();
    // a broken json cell reads as its empty value
    const sc = TABS.scenario.fromRow(['s2', 'n', 67, 30, 'asNow', 'not json', '', '', 'custom', '', '', 2, 'FALSE', 'oops']);
    expect(sc && sc.goals).toEqual([]);
    expect<unknown>(TABS.scenario.fromRow(['s', 'n', 67, 30, 'asNow', '[1]', '', '{"year":2026,"catchUp":false}', 'custom', '', '', 2, 'TRUE', ''])).toEqual({
      id: 's', name: 'n', retireAge: 67, horizon: 30, contribMode: 'asNow', contribParams: {}, employerRule: {},
      limits: { year: 2026, catchUp: false }, returnSource: 'custom', returnPeriod: '', inflation: 2, real: true, goals: [],
    });
  });

  test('period id separates scopes and keys', () => {
    const base: Period = { from: 'a', to: 'b', scope: 'account', begin: 0, contributions: 0, dividends: 0, transfersIn: 0, transfersOut: 0, mvc: 0, end: 0 };
    expect(TABS.period.idOf(base)).not.toBe(TABS.period.idOf({ ...base, scope: 'fund', key: 'X' }));
  });

  test('adp_scenario never carries the birth date', () => {
    expect(TABS.scenario.columns.filter((c) => /birth/i.test(c))).toEqual([]);
    const row = TABS.scenario.toRow(scenario);
    expect(row.some((c) => String(c).indexOf('1980-06-30') !== -1)).toBe(false);
    const back = TABS.scenario.fromRow(asRead(row));
    const { birthDate: _b, ...rest } = scenario;
    expect(back).toEqual(rest);
    expect(back && 'birthDate' in back).toBe(false);
  });

  test('no tab has a salary or birth date column (both stay local)', () => {
    Object.keys(TABS).forEach((k) => {
      const cols = (TABS as Record<string, TabSpec<unknown>>)[k].columns;
      expect(cols.some((c) => /implied_pay|salary|birth/.test(c))).toBe(false);
    });
  });

  test('columnLetter', () => {
    expect([1, 26, 27, 52, 53].map(columnLetter)).toEqual(['A', 'Z', 'AA', 'AZ', 'BA']);
  });
});

test('headers are snake_case, data keys stay camelCase (rows are read by position)', async () => {
  const { snakeCase, TX, DAILY } = await import('./tabs');
  expect(snakeCase('activityDate')).toBe('activity_date');
  expect(snakeCase('payCheckDate')).toBe('pay_check_date');
  expect(snakeCase('ror3yAnn')).toBe('ror3y_ann');
  expect(snakeCase('fund')).toBe('fund');
  expect(TX.columns.slice(0, 3)).toEqual(['id', 'activity_date', 'pay_check_date']);
  expect(DAILY.columns.every((c) => c === c.toLowerCase())).toBe(true);
});

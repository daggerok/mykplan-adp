/// <reference types="bun" />
/// <reference types="node" />
/// <reference lib="esnext" />
import { expect, test } from 'bun:test';
import { DEFAULT_SETTINGS, accept, dataset, loadSettings, parseDataset } from './data';

const ds = (builtAt: string) => JSON.stringify({ version: 1, builtAt, transactions: [], dailyFunds: [] });

test('datasets: version check, newer wins, errors are kept for the status line', () => {
  // the store is shared by every test file of the run: start from empty
  dataset.set({ ds: null, source: null, error: null });
  expect(() => parseDataset('{"version":2}')).toThrow('version 1');
  accept(ds('2026-11-21T10:00:00Z'), 'cache');
  accept(ds('2026-11-20T10:00:00Z'), 'cache');
  expect(dataset.get().ds!.builtAt).toBe('2026-11-21T10:00:00Z');
  accept('{bad', 'import');
  expect(dataset.get().error).toBeTruthy();
  expect(dataset.get().ds!.builtAt).toBe('2026-11-21T10:00:00Z');
});

test('settings: defaults, merge, broken storage', () => {
  expect(loadSettings(undefined)).toEqual(DEFAULT_SETTINGS);
  expect(loadSettings({ getItem: () => '{"retireAge":65}' }).retireAge).toBe(65);
  expect(loadSettings({ getItem: () => { throw new Error('blocked'); } })).toEqual(DEFAULT_SETTINGS);
});

test('demo data: shown only while there is no real data, replaced by real data, never stored', () => {
  dataset.set({ ds: null, source: null, error: null });
  accept(ds('2026-11-20T23:00:00Z'), 'demo');
  expect(dataset.get().source).toBe('demo');
  accept(ds('2020-01-01T00:00:00Z'), 'userscript');
  expect(dataset.get().source).toBe('userscript');
  // the real copy has no daily series yet: the demo may be shown over it
  accept(ds('2030-01-01T00:00:00Z'), 'demo');
  expect(dataset.get().source).toBe('demo');
  // real data with days is never covered by the demo
  accept(JSON.stringify({ version: 1, builtAt: '2031-01-01T00:00:00Z', transactions: [], dailyFunds: [{ date: '2026-11-20' }] }), 'userscript');
  accept(ds('2032-01-01T00:00:00Z'), 'demo');
  expect(dataset.get().source).toBe('userscript');
});

test('contribution rates are recomputed from the journal details when data arrives', () => {
  const det = (at: string, action: string, pct: number) => ({ type: 'Contribution - Roth 401(k) Percent', action, confirmNo: '', requestedAt: at, values: [{ name: 'x', pct }], from: [], to: [] });
  const json = JSON.stringify({ version: 1, builtAt: 'x', transactions: [], dailyFunds: [], rates: [{ date: '2026-11-21', rothPct: 0, preTaxPct: 4 }], journalDetails: [det('2026-04-16T01:00:00', 'Add', 4), det('2026-11-21T11:06:32', 'Add', 6), det('2026-11-21T11:08:29', 'Delete', 6)] });
  expect(parseDataset(json).rates).toEqual([{ date: '2026-04-16', rothPct: 4, preTaxPct: 0 }, { date: '2026-11-21', rothPct: 4, preTaxPct: 0 }]);
});

test('a JSON without some lists loads with empty ones (no screen or writer trips over them)', () => {
  dataset.set({ ds: null, source: null, error: null });
  accept(JSON.stringify({ version: 1, builtAt: '2027-01-01T00:00:00Z', transactions: [], dailyFunds: [] }), 'import');
  expect(dataset.get().error).toBeNull();
  expect(dataset.get().ds!.periods).toEqual([]);
  expect(dataset.get().ds!.journal).toEqual([]);
});

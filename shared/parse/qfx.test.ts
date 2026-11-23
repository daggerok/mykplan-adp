/// <reference types="bun" />
/// <reference types="node" />
/// <reference lib="esnext" />
import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Transaction } from '../model';
import { parseQfx, reconcileQfx } from './qfx';

const q = parseQfx(readFileSync(join(__dirname, '..', '..', 'tests', 'fixtures', 'sample.qfx'), 'utf8'));

test('securities, trades and positions', () => {
  expect(q.asOf).toBe('2024-06-30');
  expect([q.from, q.to]).toEqual(['2024-06-01', '2024-06-30']);
  expect(q.securities).toEqual([
    { cusip: '000000001', name: 'Alpha Bond Index Fund - Class X', ticker: 'ALPHX' },
    { cusip: '000000002', name: 'Collective Trust - Class X', ticker: null },
  ]);
  expect(q.trades.map((t) => `${t.kind} ${t.date} ${t.units} ${t.amount}`)).toEqual(['BUYMF 2024-06-14 5 5000', 'BUYMF 2024-06-14 2.5 2500', 'REINVEST 2024-06-30 0.5 500']);
  expect(q.positions).toEqual([{ cusip: '000000001', fund: 'Alpha Bond Index Fund - Class X', units: 98, price: 10.1, value: 98980, priceAsOf: '2024-06-30' }]);
});

test('reconciliation with the site rows', () => {
  const t = (date: string, amount: number, type: Transaction['type'] = 'contribution'): Transaction => ({ id: date + amount, activityDate: date, fund: 'Alpha Bond Index Fund - Class X', type, rawType: '', amount, origin: 'txPrint' });
  expect(reconcileQfx(q, [t('2024-06-14', 5000), t('2024-06-14', 2500), t('2024-06-30', 500, 'dividend')])).toEqual([]);
  expect(reconcileQfx(q, [t('2024-06-14', 5000), t('2024-06-30', 500, 'dividend'), t('2024-07-01', 1)])).toEqual([{ date: '2024-06-14', fund: 'alpha bond index fund - class x', qfx: 7500, site: 5000 }]);
});

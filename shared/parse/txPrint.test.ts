/// <reference types="bun" />
/// <reference types="node" />
/// <reference lib="esnext" />
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Window } from 'happy-dom';
import { classifyType, parseTxPrint, txId } from './txPrint';

const html = readFileSync(join(__dirname, '..', '..', 'tests', 'fixtures', 'txprint-fund-month.html'), 'utf8');
const parse = (src: string) => new (new Window().DOMParser)().parseFromString(src, 'text/html') as unknown as Document;
const W = { from: '2024-06-01', to: '2024-06-30' };

describe('parseTxPrint (synthetic fixture with the live layout)', () => {
  const r = parseTxPrint(parse(html), W);

  test('personal rate of return', () => expect(r.personalRoR).toBe(1.23));

  test('transactions with dates, sources, units, prices, cents', () => {
    expect(r.transactions).toHaveLength(8); // Alpha: 4 contributions, dividend, transfer out; Beta: transfer in, contribution
    const first = r.transactions[0]!;
    expect(first).toMatchObject({ activityDate: '2024-06-14', payCheckDate: '2024-06-12', fund: 'Alpha Bond Index Fund - Class X', type: 'contribution', source: 'EE_ROTH', units: 5, price: 10, amount: 5000, origin: 'txPrint' });
    const out = r.transactions.find((t) => t.type === 'transferOut')!;
    expect(out).toMatchObject({ amount: -20000, units: -20 });
    expect(r.transactions.filter((t) => t.source === 'EE_PRETAX')).toHaveLength(1);
    expect(r.transactions.filter((t) => t.source === 'ER_MATCH')).toHaveLength(1);
  });

  test('two identical rows on one day stay two transactions with different ids', () => {
    const twins = r.transactions.filter((t) => t.activityDate === '2024-06-28');
    expect(twins).toHaveLength(2);
    expect(twins[0]!.id).not.toBe(twins[1]!.id);
    expect(new Set(r.transactions.map((t) => t.id)).size).toBe(r.transactions.length);
  });

  test('ids are stable across parses', () => {
    expect(parseTxPrint(parse(html), W).transactions.map((t) => t.id)).toEqual(r.transactions.map((t) => t.id));
  });

  test('per-fund periods balance: begin + flows + mvc = end', () => {
    expect(r.warnings).toEqual([]);
    const alpha = r.periods.find((p) => p.key?.startsWith('Alpha'))!;
    expect(alpha).toMatchObject({ from: '2024-06-01', to: '2024-06-30', scope: 'fund', begin: 100000, contributions: 17500, dividends: 500, transfersOut: -20000, transfersIn: 0, mvc: 1000, end: 99000, begUnits: 100, endUnits: 98, endPrice: 10.1 });
    const beta = r.periods.find((p) => p.key?.startsWith('Beta'))!;
    expect(beta).toMatchObject({ begin: 300000, transfersIn: 20000, contributions: 3000, mvc: -4550, end: 318450 });
  });

  test('a broken balance and an unknown type are reported, not thrown', () => {
    const bad = html.replace('$3,184.50', '$3,184.51').replace('Dividends and Earnings', 'Loan Repayment');
    const w = parseTxPrint(parse(bad), W).warnings;
    expect(w.some((x) => x.startsWith('Beta') && x.includes('end = 318451'))).toBe(true);
    expect(w).toContain('unknown type "Loan Repayment"');
  });

  test('a page without the fund table (ErrorP) gives a warning and nothing else', () => {
    const r2 = parseTxPrint(parse('<html><body>The date range cannot exceed 13 months.</body></html>'), W);
    expect(r2).toEqual({ personalRoR: null, transactions: [], periods: [], warnings: ['no "Activity by Investment Fund" table'] });
  });
});

test('classifyType', () => {
  expect(classifyType('Contribution - Employer Qualified Non-Elective')).toEqual({ type: 'contribution', source: 'ER_NEC' });
  expect(classifyType('Market Value Change').type).toBe('mvc');
  expect(classifyType('Something new').type).toBe('other');
  expect(txId(['a', 1])).toMatch(/^[0-9a-f]{8}$/);
});

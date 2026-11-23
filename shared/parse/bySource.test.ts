/// <reference types="bun" />
/// <reference types="node" />
/// <reference lib="esnext" />
import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Window } from 'happy-dom';
import { parseBySource, sourceCode } from './bySource';

const parse = (src: string) => new (new Window().DOMParser)().parseFromString(src, 'text/html') as unknown as Document;
const html = readFileSync(join(__dirname, '..', '..', 'tests', 'fixtures', 'txprint-source-month.html'), 'utf8');
const W = { from: '2024-06-01', to: '2024-06-30' };

test('per-source periods that balance', () => {
  const r = parseBySource(parse(html), W);
  expect(r.warnings).toEqual([]);
  expect(r.periods).toEqual([
    { from: '2024-06-01', to: '2024-06-30', scope: 'source', key: 'EE_ROTH', begin: 200000, contributions: 20000, dividends: 300, transfersIn: 0, transfersOut: 0, mvc: -1234, end: 219066 },
    { from: '2024-06-01', to: '2024-06-30', scope: 'source', key: 'ER_MATCH', begin: 100000, contributions: 5000, dividends: 0, transfersIn: 0, transfersOut: 0, mvc: 400, end: 105400 },
  ]);
});

test('broken balance, unknown source, missing table', () => {
  const bad = html.replace('$1,054.00', '$1,054.01').replace('Employee Roth 401k</td><td></td><td>6/1', 'Loan Fund</td><td></td><td>6/1');
  const w = parseBySource(parse(bad), W).warnings;
  expect(w).toContain('unknown source "Loan Fund"');
  expect(w.some((x) => x.startsWith('ER_MATCH'))).toBe(true);
  expect(parseBySource(parse('<html><body></body></html>'), W).warnings).toEqual(['no "Activity by Source" table']);
  expect(sourceCode('Employer Qualified NEC')).toBe('ER_NEC');
  expect(sourceCode('Employee Before-Tax')).toBe('EE_PRETAX');
});

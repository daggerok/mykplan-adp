/// <reference types="bun" />
/// <reference types="node" />
/// <reference lib="esnext" />
import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Window } from 'happy-dom';
import { contributionRates, parseJournalDetail, parseJournalList, type JournalDetail } from './journal';

const parse = (src: string) => new (new Window().DOMParser)().parseFromString(src, 'text/html') as unknown as Document;

test('list rows', () => {
  const html = `<table><tr><td>Date &amp; Time (ET)</td><td>Transaction Requested</td><td>Action</td><td>System</td><td>Requested By</td><td>Confirm #</td><td>Letter</td><td></td></tr>
  <tr><td>04/16/2026 13:05:09</td><td>Contribution - Roth 401(k) Percent</td><td>Change</td><td>Internet</td><td>PARTICIPANT</td><td>654321</td><td></td><td>Detail</td></tr></table>`;
  expect(parseJournalList(parse(html))).toEqual([{ requestedAt: '2026-04-16T13:05:09', type: 'Contribution - Roth 401(k) Percent', action: 'Change', system: 'Internet', confirmNo: '654321' }]);
});

test('transfer detail: header, from and to blocks, nothing from the plan line', () => {
  const d = parseJournalDetail(parse(readFileSync(join(__dirname, '..', '..', 'tests', 'fixtures', 'journal-detail-transfer.html'), 'utf8')));
  expect(d).toEqual({
    type: 'Transfer Balances', action: 'Add', confirmNo: '123456', requestedAt: '2026-01-05T09:15:42',
    values: [], from: [{ name: 'Alpha Bond Index Fund - Class X', pct: 100 }], to: [{ name: 'Beta Equity 500 Index Fund - Class K', pct: 100 }],
  });
});

test('percent and allocation details', () => {
  const html = (type: string, line: string) => `<table><tr><td>Transaction Requested:</td><td>${type}</td><td>Date &amp; Time (ET):</td><td>02/01/2026 08:00:00</td></tr><tr><td>Action:</td><td>Add</td><td>Confirm #:</td><td>1</td></tr><tr><td>${type}</td></tr>${line}</table>`;
  expect(parseJournalDetail(parse(html('Contribution - Roth 401(k) Percent', '<tr><td>Roth 401(k) Percent:</td><td>6%</td></tr>'))).values).toEqual([{ name: 'Roth 401(k) Percent', pct: 6 }]);
  expect(parseJournalDetail(parse(html('Investment Allocation', '<tr><td>Beta Fund - Class K:</td><td>60%</td></tr><tr><td>Alpha Fund:</td><td>40%</td></tr>'))).values.map((v) => v.pct)).toEqual([60, 40]);
});

test('contribution rate history: Add files, Change edits, Delete cancels back to the previous value', () => {
  const det = (at: string, type: string, action: string, pct: number): JournalDetail => ({ type, action, confirmNo: '', requestedAt: at, values: [{ name: 'x', pct }], from: [], to: [] });
  const R = 'Contribution - Roth 401(k) Percent';
  const B = 'Contribution - Before-Tax Percent';
  expect(contributionRates([
    det('2023-06-15T13:09:41', B, 'Add', 2),
    det('2023-06-15T13:09:41', R, 'Add', 2),
    det('2023-07-21T23:54:09', B, 'Add', 0),
    det('2023-07-21T23:54:09', R, 'Add', 4),
    // the live 2025-10-18 sequence: ends at 7
    det('2025-10-18T01:33:22', R, 'Add', 6),
    det('2025-10-18T01:34:37', R, 'Delete', 6),
    det('2025-10-18T01:35:18', R, 'Add', 6),
    det('2025-10-18T01:36:14', R, 'Delete', 6),
    det('2025-10-18T01:36:29', R, 'Add', 6),
    det('2025-10-18T01:45:32', R, 'Change', 7),
    // the live 2026-11-21 sequence: Before-Tax request ends at 4, the Roth request is cancelled (Roth stays 7)
    det('2026-11-21T11:06:13', B, 'Add', 4),
    det('2026-11-21T11:06:32', B, 'Change', 2),
    det('2026-11-21T11:06:32', R, 'Add', 6),
    det('2026-11-21T11:08:29', B, 'Change', 8),
    det('2026-11-21T11:08:29', R, 'Delete', 6),
    det('2026-11-21T11:10:31', B, 'Change', 4),
  ])).toEqual([
    { date: '2023-06-15', rothPct: 2, preTaxPct: 2 },
    { date: '2023-07-21', rothPct: 4, preTaxPct: 0 },
    { date: '2025-10-18', rothPct: 7, preTaxPct: 0 },
    { date: '2026-11-21', rothPct: 7, preTaxPct: 4 },
  ]);
});

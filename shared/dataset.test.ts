/// <reference types="bun" />
/// <reference types="node" />
/// <reference lib="esnext" />
import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Window } from 'happy-dom';
import { buildDataset, type RawText } from './dataset';

const fx = (name: string) => readFileSync(join(__dirname, '..', 'tests', 'fixtures', name), 'utf8');
const parseHtml = (h: string) => new (new Window().DOMParser)().parseFromString(h, 'text/html') as unknown as Document;

test('raw pages -> dataset', () => {
  const month = fx('txprint-fund-month.html');
  const entries: RawText[] = [
    { key: 'highlights/2026-11-21.html', type: 'text/html', text: fx('account-highlights.html') },
    { key: 'tx/fund/month/2024-06-01_2024-06-30.html', type: 'text/html', text: month },
    { key: 'tx/fund/year/2024-05-12_2025-05-11.html', type: 'text/html', text: month },
    { key: 'tx/source/month/2024-06-01_2024-06-30.html', type: 'text/html', text: fx('txprint-source-month.html') },
    { key: 'tx/day/2024-06-14.html', type: 'text/html', text: month },
    { key: 'journal/detail/123456-1.html', type: 'text/html', text: fx('journal-detail-transfer.html') },
    { key: 'stmt/2023-09-30.pdf', type: 'application/pdf' },
    { key: 'qfx/2024-06-01_2024-06-30.qfx', type: 'application/vnd.intu.qfx', text: fx('sample.qfx') },
  ];
  const d = buildDataset(entries, parseHtml, 'T');
  expect(d.asOf).toBe('2026-11-20');
  expect(d.profile!.birthDate).toBe('1986-05-31');
  expect(d.warnings).toEqual([]);
  expect(d.transactions).toHaveLength(8); // month window only, the year page repeats them
  const account = d.periods.filter((p) => p.scope === 'account');
  expect(account.map((p) => `${p.from} ${p.to} ${p.personalRoR}`)).toEqual(['2024-06-01 2024-06-30 1.23', '2024-05-12 2025-05-11 1.23']);
  expect(account[0]).toMatchObject({ begin: 400000, end: 417450 });
  expect(d.periods.filter((p) => p.scope === 'source').map((p) => p.key)).toEqual(['EE_ROTH', 'ER_MATCH']);
  expect(d.dailyFunds.map((x) => `${x.date} ${x.fund.slice(0, 5)} ${x.endValue}`)).toEqual(['2024-06-14 Alpha 99000', '2024-06-14 Beta  318450']);
  expect(d.rebalances).toEqual([{ date: '2024-06-20', out: [{ fund: 'Alpha Bond Index Fund - Class X', amount: -20000 }], in: [{ fund: 'Beta Equity 500 Index Fund - Class K', amount: 20000 }] }]);
  expect(d.journalDetails[0]!.to[0]!.name).toContain('Beta');
  expect(d.documents.map((x) => x.key)).toEqual(['qfx/2024-06-01_2024-06-30.qfx', 'stmt/2023-09-30.pdf']);
  expect(d.securities!.map((x) => x.ticker)).toEqual(['ALPHX', null]);
  // fixture month: QFX has the 75.00 of 6/14 and the dividend, the site page has more rows that day
  expect(d.qfxDiffs!.every((x) => x.date >= '2024-06-01')).toBe(true);
});

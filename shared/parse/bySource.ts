/// <reference lib="esnext" />
// TransactionHistoryPrint.aspx asked with Type = RadioButtonSource -> one period per contribution source.
// Layout seen live 2026-11-21: "Activity by Source" rows have 10 cells, [1] source (first row of a block only),
// [3] activity date, [5] pay check date, [7] type, [8] amount; no units or prices. Contributions with their fund
// already come from the fund view (parseTxPrint), so only the per-source periods are taken here
import { parseDate } from '../dates';
import { parseMoney } from '../money';
import type { Period, SourceCode } from '../model';
import { classifyType } from './txPrint';

const SOURCE_NAMES: Array<[RegExp, SourceCode]> = [
  [/Roth/i, 'EE_ROTH'],
  [/Before-Tax|Pre-Tax/i, 'EE_PRETAX'],
  [/Match/i, 'ER_MATCH'],
  [/Non-?Elective|QNEC|NEC/i, 'ER_NEC'],
];

export function sourceCode(name: string): SourceCode | null {
  const hit = SOURCE_NAMES.find(([re]) => re.test(name));
  return hit ? hit[1] : null;
}

const cellText = (c: Element): string => (c.textContent ?? '').replace(/\s+/g, ' ').trim();

export function parseBySource(doc: Document, window: { from: string; to: string }): { periods: Period[]; warnings: string[] } {
  const warnings: string[] = [];
  const rows = Array.from(doc.querySelectorAll('tr'));
  const head = rows.findIndex((tr) => {
    const c = Array.from((tr as HTMLTableRowElement).cells ?? []).map(cellText);
    return c.length === 10 && c[1] === 'Source' && /Activity Date/.test(c[3] ?? '');
  });
  if (head < 0) return { periods: [], warnings: ['no "Activity by Source" table'] };

  const periods = new Map<string, Period>();
  let source = '';
  rows.slice(head + 1).forEach((tr) => {
    const cells = Array.from((tr as HTMLTableRowElement).cells ?? []);
    if (cells.length !== 10) return;
    const c = cells.map(cellText);
    if (c[1]) source = c[1];
    const raw = c[7] ?? '';
    if (!source || !raw) return;
    const date = parseDate(c[3] ?? '');
    const amount = parseMoney(c[8] ?? '');
    if (!date || amount === null) { warnings.push(`unreadable row: ${source} ${c[3]} ${raw}`); return; }
    const key = sourceCode(source) ?? source;
    if (!sourceCode(source)) warnings.push(`unknown source "${source}"`);
    let p = periods.get(key);
    if (!p) {
      p = { from: window.from, to: window.to, scope: 'source', key, begin: 0, contributions: 0, dividends: 0, transfersIn: 0, transfersOut: 0, mvc: 0, end: 0 };
      periods.set(key, p);
    }
    switch (classifyType(raw).type) {
      case 'begin': p.begin = amount; break;
      case 'end': p.end = amount; break;
      case 'mvc': p.mvc += amount; break;
      case 'contribution': p.contributions += amount; break;
      case 'dividend': p.dividends += amount; break;
      case 'transferIn': p.transfersIn += amount; break;
      case 'transferOut': p.transfersOut += amount; break;
      default: warnings.push(`unknown type "${raw}"`);
    }
  });
  periods.forEach((p) => {
    const sum = p.begin + p.contributions + p.dividends + p.transfersIn + p.transfersOut + p.mvc;
    if (sum !== p.end) warnings.push(`${p.key}: begin + flows + mvc = ${sum} but end = ${p.end}`);
  });
  return { periods: Array.from(periods.values()), warnings };
}

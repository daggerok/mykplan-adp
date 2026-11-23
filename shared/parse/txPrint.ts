/// <reference lib="esnext" />
// TransactionHistoryPrint.aspx (answer to the TransactionHistory POST) -> transactions and per-fund periods.
// Layout seen live 2026-11-21 (the plan section 1): "Activity by Investment Fund" rows have 12 cells,
// [1] fund (first row of a block only), [3] activity date m/d/yyyy, [5] pay check date, [7] type,
// [8] unit balance, [9] price, [10] amount. Tables are found by their header text, never by position on the page
import { parseDate } from '../dates';
import { parseDecimal, parseMoney, parsePercent } from '../money';
import type { Period, SourceCode, Transaction, TxType } from '../model';

const SOURCE_BY_TYPE: Array<[RegExp, SourceCode]> = [
  [/Roth/i, 'EE_ROTH'],
  [/Before-Tax|Pre-Tax/i, 'EE_PRETAX'],
  [/Match/i, 'ER_MATCH'],
  [/Non-?Elective|QNEC|NEC/i, 'ER_NEC'],
];

export function classifyType(raw: string): { type: TxType | 'begin' | 'end' | 'mvc'; source?: SourceCode } {
  if (/^Beginning Balance/i.test(raw)) return { type: 'begin' };
  if (/^Ending Balance/i.test(raw)) return { type: 'end' };
  if (/^Market Value Change/i.test(raw)) return { type: 'mvc' };
  if (/^Transfer In/i.test(raw)) return { type: 'transferIn' };
  if (/^Transfer Out/i.test(raw)) return { type: 'transferOut' };
  if (/^Dividend/i.test(raw)) return { type: 'dividend' };
  if (/^Contribution/i.test(raw)) {
    const hit = SOURCE_BY_TYPE.find(([re]) => re.test(raw));
    return hit ? { type: 'contribution', source: hit[1] } : { type: 'contribution' };
  }
  return { type: 'other' };
}

// Stable id: the same row parsed twice (another window, another run) gets the same id. FNV-1a, 32 bit, hex
export function txId(parts: Array<string | number | undefined>): string {
  let h = 0x811c9dc5;
  const s = parts.map((p) => (p === undefined ? '' : String(p))).join('|');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

export interface TxPrintResult {
  personalRoR: number | null;
  transactions: Transaction[];
  periods: Period[];
  warnings: string[];
}

const cellText = (c: Element): string => (c.textContent ?? '').replace(/\s+/g, ' ').trim();

function fundTableRows(doc: Document): Element[] {
  const rows = Array.from(doc.querySelectorAll('tr'));
  const head = rows.findIndex((tr) => {
    const t = cellText(tr);
    return /Investment Fund/.test(t) && /Unit\/Share Balance/.test(t) && /Price/.test(t);
  });
  return head < 0 ? [] : rows.slice(head + 1);
}

// from and to are the asked window (ISO): periods carry them, the page itself only prints row dates
export function parseTxPrint(doc: Document, window: { from: string; to: string }): TxPrintResult {
  const warnings: string[] = [];
  const text = (doc.body?.textContent ?? '').replace(/\s+/g, ' ');
  const rorMatch = text.match(/Personal Rate of Return[^%]*?(\(?-?[\d.]+%\)?)/i);
  const personalRoR = rorMatch ? parsePercent(rorMatch[1]!) : null;

  const rows = fundTableRows(doc);
  if (!rows.length) warnings.push('no "Activity by Investment Fund" table');

  const transactions: Transaction[] = [];
  const periods = new Map<string, Period>();
  const seen = new Map<string, number>();
  let fund = '';

  for (const tr of rows) {
    const cells = Array.from((tr as HTMLTableRowElement).cells ?? []);
    if (cells.length !== 12) continue;
    const c = cells.map(cellText);
    if (c[1]) fund = c[1];
    const raw = c[7] ?? '';
    if (!fund || !raw) continue;
    const date = parseDate(c[3] ?? '');
    const amount = parseMoney(c[10] ?? '');
    if (!date || amount === null) { warnings.push(`unreadable row: ${fund} ${c[3]} ${raw}`); continue; }
    const units = parseDecimal(c[8] ?? '') ?? undefined;
    const price = parseDecimal(c[9] ?? '') ?? undefined;
    const kind = classifyType(raw);

    let p = periods.get(fund);
    if (!p) {
      p = { from: window.from, to: window.to, scope: 'fund', key: fund, begin: 0, contributions: 0, dividends: 0, transfersIn: 0, transfersOut: 0, mvc: 0, end: 0 };
      periods.set(fund, p);
    }
    switch (kind.type) {
      case 'begin': p.begin = amount; p.begUnits = units; p.begPrice = price; continue;
      case 'end': p.end = amount; p.endUnits = units; p.endPrice = price; continue;
      case 'mvc': p.mvc += amount; continue;
      case 'contribution': p.contributions += amount; break;
      case 'dividend': p.dividends += amount; break;
      case 'transferIn': p.transfersIn += amount; break;
      case 'transferOut': p.transfersOut += amount; break;
      default: warnings.push(`unknown type "${raw}"`);
    }
    const payCheckDate = parseDate(c[5] ?? '') ?? undefined;
    const base = [date, payCheckDate, fund, raw, units, price, amount];
    // two identical rows on one day are real (two paychecks): the n-th copy gets #n in its id
    const key = base.join('|');
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    transactions.push({
      id: txId(n > 1 ? [...base, n] : base),
      activityDate: date,
      payCheckDate,
      fund,
      source: kind.source,
      type: kind.type as TxType,
      rawType: raw,
      units,
      price,
      amount,
      origin: 'txPrint',
    });
  }

  periods.forEach((p) => {
    const sum = p.begin + p.contributions + p.dividends + p.transfersIn + p.transfersOut + p.mvc;
    if (sum !== p.end) warnings.push(`${p.key}: begin + flows + mvc = ${sum} but end = ${p.end}`);
  });
  return { personalRoR, transactions, periods: Array.from(periods.values()), warnings };
}

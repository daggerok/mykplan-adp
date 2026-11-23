/// <reference lib="esnext" />
// AccountUpdatesSummary.aspx (list) and AccountUpdatesDetail.aspx (one change). Seen live 2026-11-21:
// list cells [0] "mm/dd/yyyy hh:mm:ss" (ET), [1] transaction, [2] action Add|Change|Delete, [3] system,
// [4] requested by, [5] confirm #, [6] letter, [7] Detail. A detail shows only the NEW value:
// "Roth 401(k) Percent: | 6%", "<fund>: | 100%" (Investment Allocation), "From:" / "To:" blocks of
// "<fund>: | N%" (Transfer Balances, Reallocate Balance with "All Investments: | 100%" as From)
import { parseDate } from '../dates';
import { parsePercent } from '../money';

export interface JournalRow {
  requestedAt: string; // ISO "2026-04-16T10:00:00" in ET, as printed
  type: string;
  action: string;
  system: string;
  confirmNo: string;
}

export interface JournalDetail {
  type: string;
  action: string;
  confirmNo: string;
  requestedAt: string | null;
  values: Array<{ name: string; pct: number }>; // the new election (allocation, percent)
  from: Array<{ name: string; pct: number }>;
  to: Array<{ name: string; pct: number }>;
}

const cellText = (c: Element): string => (c.textContent ?? '').replace(/\s+/g, ' ').trim();
const rowCells = (tr: Element) => Array.from((tr as HTMLTableRowElement).cells ?? []).map(cellText);

function dateTime(text: string): string | null {
  const m = text.match(/^(\d{1,2}\/\d{1,2}\/\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  const d = m ? parseDate(m[1]!) : null;
  return d ? `${d}T${m![2]!.padStart(2, '0')}:${m![3]}:${m![4] ?? '00'}` : null;
}

export function parseJournalList(doc: Document): JournalRow[] {
  const out: JournalRow[] = [];
  doc.querySelectorAll('tr').forEach((tr) => {
    const c = rowCells(tr);
    if (c.length < 6) return;
    const at = dateTime(c[0] ?? '');
    if (!at || !/^\d+$/.test(c[5] ?? '')) return;
    out.push({ requestedAt: at, type: c[1] ?? '', action: c[2] ?? '', system: c[3] ?? '', confirmNo: c[5]! });
  });
  return out;
}

export function parseJournalDetail(doc: Document): JournalDetail {
  const d: JournalDetail = { type: '', action: '', confirmNo: '', requestedAt: null, values: [], from: [], to: [] };
  let block: 'values' | 'from' | 'to' = 'values';
  doc.querySelectorAll('tr').forEach((tr) => {
    // only innermost rows: a row holding a nested table repeats its children's text
    if (tr.querySelector('table')) return;
    const c = rowCells(tr).filter(Boolean);
    if (!c.length) return;
    if (c[0] === 'Transaction Requested:') { d.type = c[1] ?? ''; d.requestedAt = dateTime(c[3] ?? ''); return; }
    if (c[0] === 'Action:') { d.action = c[1] ?? ''; d.confirmNo = c[3] ?? ''; return; }
    if (c.length === 1 && c[0] === 'From:') { block = 'from'; return; }
    if (c.length === 1 && c[0] === 'To:') { block = 'to'; return; }
    if (c.length === 2 && /:$/.test(c[0]!) && /%$/.test(c[1]!)) {
      const pct = parsePercent(c[1]!);
      if (pct !== null) d[block].push({ name: c[0]!.slice(0, -1), pct });
    }
  });
  return d;
}

// Contribution percent over time from the journal. In ADP's journal an election is a request: Add files a new value,
// Change edits the filed value, Delete cancels it and the value before it stands again (seen live 2026-11-22:
// "Add 6, Delete, Add 6, Delete, Add 6, Change 7" ends at 7; "Roth Add 6, Delete" ends at the old Roth value).
// Applied in request order; the date is the request day (the site does not print the effective day)
export function contributionRates(details: JournalDetail[]): Array<{ date: string; rothPct: number; preTaxPct: number }> {
  const sorted = details.filter((x) => x.requestedAt && /^Contribution - /.test(x.type)).sort((a, b) => (a.requestedAt! < b.requestedAt! ? -1 : a.requestedAt! > b.requestedAt! ? 1 : 0));
  const out: Array<{ date: string; rothPct: number; preTaxPct: number }> = [];
  // per source: the values in force, newest last; the base 0 is never popped
  const stacks: Record<'roth' | 'pre', number[]> = { roth: [0], pre: [0] };
  sorted.forEach((x) => {
    const src = /Roth/i.test(x.type) ? 'roth' : /Before-Tax|Pre-Tax/i.test(x.type) ? 'pre' : null;
    if (!src) return;
    const st = stacks[src];
    const pct = x.values[0]?.pct ?? 0;
    if (/Delete/i.test(x.action)) { if (st.length > 1) st.pop(); }
    else if (/Change/i.test(x.action) && st.length > 1) st[st.length - 1] = pct;
    else st.push(pct);
    const date = x.requestedAt!.slice(0, 10);
    const roth = stacks.roth[stacks.roth.length - 1]!;
    const pre = stacks.pre[stacks.pre.length - 1]!;
    const last = out[out.length - 1];
    if (last && last.date === date) { last.rothPct = roth; last.preTaxPct = pre; } else out.push({ date, rothPct: roth, preTaxPct: pre });
  });
  return out;
}

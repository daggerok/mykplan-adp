/// <reference lib="esnext" />
// Dates are ISO calendar text "YYYY-MM-DD" everywhere (the plan section 4): no time zones, no Date in the model.
// Date objects are used only inside these helpers, always in UTC
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const pad = (n: number, w = 2) => String(n).padStart(w, '0');

export const isIsoDate = (s: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(s) && toUtc(s).toISOString().startsWith(s);

function iso(y: number, m: number, d: number): string | null {
  const s = `${pad(y, 4)}-${pad(m)}-${pad(d)}`;
  return m >= 1 && m <= 12 && d >= 1 && d <= 31 && isIsoDate(s) ? s : null;
}

const monthIndex = (name: string): number => MONTHS.indexOf(name.slice(0, 3).toLowerCase()) + 1;

// Every date format of the site and the benchmark feeds -> ISO:
// "05/12/2023" (mykplan, mm/dd/yyyy), "19-Nov-2026" (SPDR), "Nov 19 2026" / "Nov 19, 2026" (VanEck, Yahoo),
// "2004-01-30" (Vanguard), "2026-11-19T00:00:00Z"
export function parseDate(text: string): string | null {
  const t = text.trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/);
  if (m) return iso(+m[1]!, +m[2]!, +m[3]!);
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return iso(+m[3]!, +m[1]!, +m[2]!);
  m = t.match(/^(\d{1,2})-([A-Za-z]{3,})-(\d{4})$/);
  if (m) return iso(+m[3]!, monthIndex(m[2]!), +m[1]!);
  m = t.match(/^([A-Za-z]{3,})\.? (\d{1,2}),? (\d{4})$/);
  if (m) return iso(+m[3]!, monthIndex(m[1]!), +m[2]!);
  return null;
}

// ISO -> "mm/dd/yyyy" for the mykplan form fields
export function toUsDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-');
  return `${m}/${d}/${y}`;
}

export function toUtc(isoDate: string): Date {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!));
}

export const fromUtc = (d: Date): string => d.toISOString().slice(0, 10);

export function addDays(isoDate: string, n: number): string {
  const d = toUtc(isoDate);
  d.setUTCDate(d.getUTCDate() + n);
  return fromUtc(d);
}

export const daysBetween = (from: string, to: string): number => Math.round((toUtc(to).getTime() - toUtc(from).getTime()) / 86400000);

export const isWeekend = (isoDate: string): boolean => [0, 6].indexOf(toUtc(isoDate).getUTCDay()) >= 0;

export const endOfMonth = (isoDate: string): string => {
  const d = toUtc(isoDate);
  return fromUtc(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)));
};

export type Timeframe = '1D' | '1W' | '1M' | '1Q' | '1Y';

// Bucket key of a day for candles: ISO week starts on Monday (key = that Monday), month "2026-11",
// quarter "2026-Q4", year "2026"
export function periodKey(isoDate: string, tf: Timeframe): string {
  const [y, m] = isoDate.split('-');
  switch (tf) {
    case '1D': return isoDate;
    case '1W': return addDays(isoDate, -((toUtc(isoDate).getUTCDay() + 6) % 7));
    case '1M': return `${y}-${m}`;
    case '1Q': return `${y}-Q${Math.ceil(Number(m) / 3)}`;
    case '1Y': return y!;
  }
}

// Calendar months between two days, clipped to them: the M2 crawl asks the site one month at a time
export function monthWindows(from: string, to: string): Array<{ from: string; to: string }> {
  const out: Array<{ from: string; to: string }> = [];
  let start = from;
  while (start <= to) {
    const end = endOfMonth(start);
    out.push({ from: start, to: end < to ? end : to });
    start = addDays(end, 1);
  }
  return out;
}

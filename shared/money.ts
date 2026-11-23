/// <reference lib="esnext" />
// Money is integer cents (the plan section 4). The site prints "$1,234.56", "(1,234.56)" for negatives,
// "-$1.00" sometimes, and "", "-", "--" or "N/A" for nothing. Parsing goes through the text, never floats,
// so 0.1 + 0.2 never shows up in a balance
const EMPTY = /^(|-|--|n\/a|na)$/i;

function clean(text: string): { negative: boolean; body: string } | null {
  let t = text.replace(/[\s ]/g, '');
  if (EMPTY.test(t)) return null;
  let negative = false;
  if (t.startsWith('(') && t.endsWith(')')) { negative = true; t = t.slice(1, -1); }
  if (t.startsWith('-')) { negative = !negative; t = t.slice(1); }
  if (t.startsWith('$')) t = t.slice(1);
  if (t.startsWith('-')) { negative = !negative; t = t.slice(1); }
  t = t.replace(/,/g, '');
  if (!/^\d*\.?\d*$/.test(t) || t === '' || t === '.') return null;
  return { negative, body: t };
}

// "$1,234.56" -> 123456, "(1,234.56)" -> -123456, "1,234.567" -> 123457 (half away from zero)
export function parseMoney(text: string): number | null {
  const c = clean(text);
  if (!c) return null;
  const [int = '0', frac = ''] = c.body.split('.');
  const padded = (frac + '000').slice(0, 3);
  let cents = Number(int || '0') * 100 + Number(padded.slice(0, 2));
  if (Number(padded[2]) >= 5) cents += 1;
  return c.negative && cents !== 0 ? -cents : cents;
}

// Units, prices and other decimals: "1,234.5678" -> 1234.5678, "(0.5)" -> -0.5
export function parseDecimal(text: string): number | null {
  const c = clean(text);
  if (!c) return null;
  const n = Number(c.body);
  return c.negative && n !== 0 ? -n : n;
}

// "12.34%" -> 12.34 (percent points, not a fraction)
export function parsePercent(text: string): number | null {
  return parseDecimal(text.replace('%', ''));
}

export function formatMoney(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(Math.round(cents));
  const int = Math.floor(abs / 100).toLocaleString('en-US');
  return `${sign}$${int}.${String(abs % 100).padStart(2, '0')}`;
}

export const centsToDollars = (cents: number): number => cents / 100;

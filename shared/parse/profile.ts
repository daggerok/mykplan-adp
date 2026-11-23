/// <reference lib="esnext" />
// Owner profile from AccountHighlights.aspx, so nothing has to be typed into config (owner 2026-11-21):
// lblLastPrice "As of November 20, 2026", lblDOH "Date of Hire: mm/dd/yyyy", lblAge "Age: 40 years 6 months".
// The site gives no birth date, only the age on the as-of day: that pins the birth month to a one-month window,
// enough for retirement age and IRS catch-up. config/user.local.json birthDate, when present, wins
import { addDays, endOfMonth, parseDate } from '../dates';

export interface Profile {
  asOf: string;
  hireDate: string | null;
  age: { years: number; months: number } | null;
  // birth date lies in [birthFrom, birthTo]; birthMonth is the month of birthTo ("YYYY-MM").
  // birthDate = the last day of birthMonth (owner 2026-11-21: "use last month date for approx DOB, because you
  // can count a month and year"): the year and month come from the age, the day is the month end
  birthDate: string | null;
  birthFrom: string | null;
  birthTo: string | null;
  birthMonth: string | null;
}

const text = (doc: Document, id: string): string =>
  (doc.getElementById(id)?.textContent ?? '').replace(/\s+/g, ' ').trim();

// a calendar date minus whole years and months, day clamped to the month end (Mar 31 - 1 month = Feb 28/29)
export function minusYearsMonths(iso: string, years: number, months: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const total = y! * 12 + (m! - 1) - years * 12 - months;
  const ny = Math.floor(total / 12);
  const nm = total - ny * 12 + 1;
  const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return `${String(ny).padStart(4, '0')}-${String(nm).padStart(2, '0')}-${String(Math.min(d!, last)).padStart(2, '0')}`;
}

// Age Y years M months on day A means: birth <= A - (Y, M) and birth > A - (Y, M + 1)
export function birthWindow(asOf: string, years: number, months: number): { from: string; to: string } {
  return { from: addDays(minusYearsMonths(asOf, years, months + 1), 1), to: minusYearsMonths(asOf, years, months) };
}

export function parseProfile(doc: Document): Profile | null {
  const asOfMatch = text(doc, '_ctl0_PageContent_lblLastPrice').match(/As of\s+([A-Za-z]+ \d{1,2}, \d{4})/i);
  const asOf = asOfMatch ? parseDate(asOfMatch[1]!) : null;
  if (!asOf) return null;
  const hire = text(doc, '_ctl0_PageContent_lblDOH').match(/(\d{1,2}\/\d{1,2}\/\d{4})/);
  const ageMatch = text(doc, '_ctl0_PageContent_lblAge').match(/(\d+)\s*years?(?:\s*(\d+)\s*months?)?/i);
  const age = ageMatch ? { years: Number(ageMatch[1]), months: Number(ageMatch[2] ?? 0) } : null;
  const win = age ? birthWindow(asOf, age.years, age.months) : null;
  return {
    asOf,
    hireDate: hire ? parseDate(hire[1]!) : null,
    age,
    birthDate: win ? endOfMonth(win.to) : null,
    birthFrom: win?.from ?? null,
    birthTo: win?.to ?? null,
    birthMonth: win ? win.to.slice(0, 7) : null,
  };
}

// Age in whole years on a day, from a known birth date or, without one, from the site window (latest birth day,
// so the age is never overstated: catch-up eligibility is not claimed a month early)
export function ageOn(day: string, birth: string): number {
  const [by, bm, bd] = birth.split('-').map(Number);
  const [y, m, d] = day.split('-').map(Number);
  return y! - by! - (m! < bm! || (m === bm && d! < bd!) ? 1 : 0);
}

/// <reference lib="esnext" />
// Deterministic forecast by month, today -> retirement (the plan section 7, Forecast M11).
// Order of one month: the balance grows by the monthly rate, then the month's contributions arrive (end of month).
// Employee money is capped by the IRS limit of its calendar year (catch-up by age), employer money follows the
// ratio employer / employee of the last 12 months. Real mode divides every output by the inflation of the time
// passed. Money in and out is integer cents; the simulation itself runs on numbers
import { addDays } from '../dates';
import { SourceCode } from '../model';
import { roundCents } from './stats';

export interface IrsLimits {
  baseYear: number;
  base: number; // cents, employee elective deferral limit of baseYear
  catchUp50: number; // cents, extra from the year one turns 50
  superCatchUp60to63: number; // cents, replaces catchUp50 in the years one turns 60, 61, 62, 63
  growth: number; // yearly growth assumption after baseYear (fraction)
  step: number; // cents: projected limits are rounded down to this step (the IRS uses $500)
  overrides?: Record<string, { base?: number; catchUp50?: number; superCatchUp60to63?: number }>; // by year, exact published values
}

export const DEFAULT_LIMITS: IrsLimits = {
  baseYear: 2026,
  base: 2450000,
  catchUp50: 800000,
  superCatchUp60to63: 1125000,
  growth: 0.02,
  step: 50000,
};

export type ContributionMode =
  | { mode: 'asNow'; eeAnnual: number } // cents per year, usually historyRates().eeAnnual
  | { mode: 'fixed'; annual: number } // cents per year
  | { mode: 'percent'; salary: number; pct: number; salaryGrowth?: number }; // salary cents per year, pct in points

export interface ForecastScenario {
  start: string; // "today", ISO: the balance is as of this date
  startValue: number; // cents
  birthDate: string;
  retireAge: number; // default 67
  endDate?: string; // horizon override, default = the day of retireAge
  contributions: ContributionMode;
  employerRatio: number; // employer cents per employee cent, historyRates().employerRatio
  eeYtd?: number; // cents already contributed by the employee in the start year (counts against its limit)
  annualReturn: number; // nominal, fraction
  inflation?: number; // default 0.03
  real?: boolean; // default false: nominal
  goals?: number[]; // cents, default $100k, $250k, $500k, $1M
  limits?: IrsLimits;
}

export interface MonthStep {
  date: string; // last day of the month
  year: number;
  ee: number; // cents, nominal, already capped
  er: number;
  deflator: number; // (1 + inflation)^(months / 12); 1 in nominal mode
}

export interface ForecastYear {
  year: number;
  endDate: string;
  age: number; // completed years at endDate
  limit: number; // employee limit of the year, nominal cents
  ee: number;
  er: number;
  growth: number;
  value: number; // at endDate
  eeTotal: number;
  erTotal: number;
  growthTotal: number;
}

export interface GoalHit {
  goal: number;
  date: string | null;
  age: number | null;
}

export interface ForecastResult {
  years: ForecastYear[];
  final: { date: string; age: number; value: number; eeTotal: number; erTotal: number; growthTotal: number };
  goals: GoalHit[];
}

export const DEFAULT_GOALS = [10000000, 25000000, 50000000, 100000000];
export const DEFAULT_INFLATION = 0.03;

const EE: SourceCode[] = ['EE_ROTH', 'EE_PRETAX'];
const ER: SourceCode[] = ['ER_MATCH', 'ER_NEC'];

// Completed years of age on a date
export function ageOn(birthDate: string, date: string): number {
  const [by, bm, bd] = birthDate.split('-').map(Number);
  const [y, m, d] = date.split('-').map(Number);
  return y! - by! - (m! < bm! || (m === bm && d! < bd!) ? 1 : 0);
}

// The day someone reaches an age; Feb 29 birthdays fall on Feb 28 in other years
export function birthdayAt(birthDate: string, age: number): string {
  const [y, m, d] = birthDate.split('-');
  const ty = Number(y) + age;
  const leap = (ty % 4 === 0 && ty % 100 !== 0) || ty % 400 === 0;
  return `${ty}-${m}-${m === '02' && d === '29' && !leap ? '28' : d}`;
}

const endOfMonthOf = (y: number, m: number): string => {
  const d = new Date(Date.UTC(y, m, 0));
  return d.toISOString().slice(0, 10);
};

// Employee limit of a calendar year: base + catch-up by the age reached during that year
export function employeeLimit(year: number, birthDate: string, limits: IrsLimits = DEFAULT_LIMITS): number {
  const n = Math.max(0, year - limits.baseYear);
  const grow = (v: number): number => (n === 0 ? v : Math.floor((v * Math.pow(1 + limits.growth, n)) / limits.step) * limits.step);
  const o = (limits.overrides && limits.overrides[String(year)]) || {};
  const base = o.base !== undefined ? o.base : grow(limits.base);
  const age = year - Number(birthDate.slice(0, 4));
  if (age >= 60 && age <= 63) return base + (o.superCatchUp60to63 !== undefined ? o.superCatchUp60to63 : grow(limits.superCatchUp60to63));
  if (age >= 50) return base + (o.catchUp50 !== undefined ? o.catchUp50 : grow(limits.catchUp50));
  return base;
}

// Employee and employer money of the 12 months up to asOf (asOf - 365 days, exclusive) and their ratio
export function historyRates(contribs: Array<{ date: string; source?: SourceCode; amount: number }>, asOf: string): { eeAnnual: number; erAnnual: number; employerRatio: number } {
  const from = addDays(asOf, -365);
  let ee = 0, er = 0;
  for (const c of contribs) {
    if (c.date <= from || c.date > asOf || !c.source) continue;
    if (EE.indexOf(c.source) >= 0) ee += c.amount;
    else if (ER.indexOf(c.source) >= 0) er += c.amount;
  }
  return { eeAnnual: ee, erAnnual: er, employerRatio: ee > 0 ? er / ee : 0 };
}

export function horizonEnd(s: ForecastScenario): string {
  return s.endDate || birthdayAt(s.birthDate, s.retireAge);
}

// Month steps after the start month up to the month of the horizon end (inclusive)
export function buildSchedule(s: ForecastScenario): MonthStep[] {
  const limits = s.limits || DEFAULT_LIMITS;
  const infl = s.inflation === undefined ? DEFAULT_INFLATION : s.inflation;
  const end = horizonEnd(s);
  let y = Number(s.start.slice(0, 4));
  let m = Number(s.start.slice(5, 7));
  const ey = Number(end.slice(0, 4));
  const em = Number(end.slice(5, 7));
  const startYear = y;
  const out: MonthStep[] = [];
  let used = s.eeYtd || 0;
  let i = 0;
  for (;;) {
    m++;
    if (m > 12) { m = 1; y++; used = 0; }
    if (y > ey || (y === ey && m > em)) break;
    i++;
    const c = s.contributions;
    let annual: number;
    if (c.mode === 'percent') annual = (c.salary * c.pct) / 100 * Math.pow(1 + (c.salaryGrowth || 0), y - startYear);
    else if (c.mode === 'fixed') annual = c.annual;
    else annual = c.eeAnnual;
    const room = Math.max(0, employeeLimit(y, s.birthDate, limits) - used);
    const ee = Math.min(annual / 12, room);
    used += ee;
    out.push({ date: endOfMonthOf(y, m), year: y, ee, er: ee * s.employerRatio, deflator: s.real ? Math.pow(1 + infl, i / 12) : 1 });
  }
  return out;
}

export const monthlyRate = (annual: number): number => Math.pow(1 + annual, 1 / 12) - 1;

// Balance path for given monthly returns (one per step): nominal values at each month end
export function simulatePath(startValue: number, steps: MonthStep[], monthlyReturns: (i: number) => number): number[] {
  const out: number[] = [];
  let v = startValue;
  for (let i = 0; i < steps.length; i++) {
    v = v * (1 + monthlyReturns(i)) + steps[i]!.ee + steps[i]!.er;
    out.push(v);
  }
  return out;
}

export function projectDeterministic(s: ForecastScenario): ForecastResult {
  const steps = buildSchedule(s);
  const r = monthlyRate(s.annualReturn);
  const path = simulatePath(s.startValue, steps, () => r);
  const goals = s.goals || DEFAULT_GOALS;
  const hits: GoalHit[] = goals.map((goal) => ({ goal, date: null, age: null }));
  hits.forEach((h) => { if (s.startValue >= h.goal) { h.date = s.start; h.age = ageOn(s.birthDate, s.start); } });

  const years: ForecastYear[] = [];
  let prev = s.startValue; // displayed (real or nominal) value at the end of the previous step
  let eeTotal = 0, erTotal = 0, growthTotal = 0;
  let row: ForecastYear | null = null;
  const limits = s.limits || DEFAULT_LIMITS;
  for (let i = 0; i < steps.length; i++) {
    const st = steps[i]!;
    const value = path[i]! / st.deflator;
    const ee = st.ee / st.deflator, er = st.er / st.deflator;
    const growth = value - prev - ee - er;
    prev = value;
    if (!row || row.year !== st.year) {
      if (row) years.push(row);
      row = { year: st.year, endDate: st.date, age: 0, limit: employeeLimit(st.year, s.birthDate, limits), ee: 0, er: 0, growth: 0, value: 0, eeTotal: 0, erTotal: 0, growthTotal: 0 };
    }
    eeTotal += ee; erTotal += er; growthTotal += growth;
    row.ee += ee; row.er += er; row.growth += growth;
    row.value = value; row.endDate = st.date;
    row.eeTotal = eeTotal; row.erTotal = erTotal; row.growthTotal = growthTotal;
    for (const h of hits) if (h.date === null && value >= h.goal) { h.date = st.date; h.age = ageOn(s.birthDate, st.date); }
  }
  if (row) years.push(row);
  const rounded = years.map((y) => ({
    year: y.year, endDate: y.endDate, age: ageOn(s.birthDate, y.endDate), limit: y.limit,
    ee: roundCents(y.ee), er: roundCents(y.er), growth: roundCents(y.growth), value: roundCents(y.value),
    eeTotal: roundCents(y.eeTotal), erTotal: roundCents(y.erTotal), growthTotal: roundCents(y.growthTotal),
  }));
  const last = rounded[rounded.length - 1];
  const final = last
    ? { date: last.endDate, age: last.age, value: last.value, eeTotal: last.eeTotal, erTotal: last.erTotal, growthTotal: last.growthTotal }
    : { date: s.start, age: ageOn(s.birthDate, s.start), value: roundCents(s.startValue), eeTotal: 0, erTotal: 0, growthTotal: 0 };
  return { years: rounded, final, goals: hits };
}


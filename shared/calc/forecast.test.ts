/// <reference types="bun" />
/// <reference types="node" />
/// <reference lib="esnext" />
import { describe, expect, test } from 'bun:test';
import { ageOn, birthdayAt, buildSchedule, DEFAULT_LIMITS, employeeLimit, ForecastScenario, historyRates, projectDeterministic } from './forecast';

const base: ForecastScenario = {
  start: '2026-11-21', startValue: 1000000, birthDate: '1990-01-01', retireAge: 67, endDate: '2027-02-15',
  contributions: { mode: 'fixed', annual: 1200000 }, employerRatio: 0.5, annualReturn: 0,
};

describe('ages and IRS limits', () => {
  test('age in completed years; Feb 29 birthdays', () => {
    expect(ageOn('1990-05-10', '2026-05-09')).toBe(35);
    expect(ageOn('1990-05-10', '2026-05-10')).toBe(36);
    expect(birthdayAt('2000-02-29', 67)).toBe('2067-02-28');
    expect(birthdayAt('2000-02-29', 68)).toBe('2068-02-29');
    expect(birthdayAt('1990-01-01', 67)).toBe('2057-01-01');
  });
  test('2026: base 24,500, catch-up 8,000 from 50, 11,250 at 60-63', () => {
    expect(employeeLimit(2026, '1990-05-10')).toBe(2450000);
    expect(employeeLimit(2026, '1976-12-31')).toBe(3250000); // turns 50 in 2026
    expect(employeeLimit(2026, '1965-06-01')).toBe(3575000); // 61
    expect(employeeLimit(2026, '1962-06-01')).toBe(3250000); // 64: back to the regular catch-up
  });
  test('later years grow 2 % a year rounded down to $500; overrides win', () => {
    expect(employeeLimit(2027, '1990-05-10')).toBe(2450000); // 24,990 -> 24,500
    expect(employeeLimit(2028, '1990-05-10')).toBe(2500000); // 25,489.80 -> 25,000
    expect(employeeLimit(2028, '1977-01-01')).toBe(3300000); // + 8,323.20 -> 8,000
    expect(employeeLimit(2027, '1990-05-10', { ...DEFAULT_LIMITS, overrides: { '2027': { base: 2550000 } } })).toBe(2550000);
  });
  test('employer ratio from the last 12 months', () => {
    const h = historyRates([
      { date: '2025-11-21', source: 'EE_ROTH', amount: 999999 }, // exactly 365 days back: outside
      { date: '2026-01-15', source: 'EE_ROTH', amount: 400000 },
      { date: '2026-01-15', source: 'EE_PRETAX', amount: 200000 },
      { date: '2026-01-15', source: 'ER_MATCH', amount: 250000 },
      { date: '2026-11-21', source: 'ER_NEC', amount: 50000 },
      { date: '2026-11-22', source: 'ER_NEC', amount: 77777 }, // after asOf
    ], '2026-11-21');
    expect(h).toEqual({ eeAnnual: 600000, erAnnual: 300000, employerRatio: 0.5 });
  });
});

describe('deterministic forecast', () => {
  test('three months of $1,000 EE + $500 ER at 0 %', () => {
    const f = projectDeterministic({ ...base, goals: [1200000] });
    expect(f.years).toEqual([
      { year: 2026, endDate: '2026-12-31', age: 36, limit: 2450000, ee: 100000, er: 50000, growth: 0, value: 1150000, eeTotal: 100000, erTotal: 50000, growthTotal: 0 },
      { year: 2027, endDate: '2027-02-28', age: 37, limit: 2450000, ee: 200000, er: 100000, growth: 0, value: 1450000, eeTotal: 300000, erTotal: 150000, growthTotal: 0 },
    ]);
    expect(f.final).toEqual({ date: '2027-02-28', age: 37, value: 1450000, eeTotal: 300000, erTotal: 150000, growthTotal: 0 });
    expect(f.goals).toEqual([{ goal: 1200000, date: '2027-01-31', age: 37 }]);
  });
  test('the IRS limit caps employee money in its year, employer money follows it', () => {
    const steps = buildSchedule({ ...base, eeYtd: 2440000 });
    expect(steps.map((s) => [s.date, s.ee, s.er])).toEqual([['2026-12-31', 10000, 5000], ['2027-01-31', 100000, 50000], ['2027-02-28', 100000, 50000]]);
  });
  test('12 % a year compounds monthly to 12 %; real mode with 12 % inflation keeps the value flat', () => {
    const s: ForecastScenario = { ...base, start: '2026-12-15', endDate: '2027-12-31', contributions: { mode: 'fixed', annual: 0 }, annualReturn: 0.12 };
    const f = projectDeterministic(s);
    expect(f.years).toHaveLength(1);
    expect(f.final.value).toBe(1120000);
    expect(f.final.growthTotal).toBe(120000);
    expect(projectDeterministic({ ...s, real: true, inflation: 0.12 }).final.value).toBe(1000000);
  });
  test('percent of salary: 10 % of $100,000 over a year; horizon by retirement age', () => {
    const f = projectDeterministic({ ...base, start: '2026-12-15', endDate: '2027-12-31', contributions: { mode: 'percent', salary: 10000000, pct: 10 }, employerRatio: 0 });
    expect(f.final.eeTotal).toBe(1000000);
    expect(f.final.value).toBe(2000000);
    const r = buildSchedule({ ...base, endDate: undefined, birthDate: '1960-03-10', retireAge: 67 }); // retires 2027-03-10
    expect(r[r.length - 1]!.date).toBe('2027-03-31');
    expect(r).toHaveLength(4);
  });
});

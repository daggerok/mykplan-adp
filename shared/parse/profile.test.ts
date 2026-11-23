/// <reference types="bun" />
/// <reference types="node" />
/// <reference lib="esnext" />
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Window } from 'happy-dom';
import { ageOn, birthWindow, minusYearsMonths, parseProfile } from './profile';

const parse = (src: string) => new (new Window().DOMParser)().parseFromString(src, 'text/html') as unknown as Document;
const html = readFileSync(join(__dirname, '..', '..', 'tests', 'fixtures', 'account-highlights.html'), 'utf8');

describe('parseProfile', () => {
  test('as-of day, hire date, age and the birth month window', () => {
    expect(parseProfile(parse(html))).toEqual({
      asOf: '2026-11-20',
      hireDate: '2023-01-02',
      age: { years: 40, months: 6 },
      birthDate: '1986-05-31',
      birthFrom: '1986-04-21',
      birthTo: '1986-05-20',
      birthMonth: '1986-05',
    });
  });
  test('the person and the plan number are not taken', () => {
    expect(JSON.stringify(parseProfile(parse(html)))).not.toMatch(/JOHN|000000|EXAMPLE/);
  });
  test('age without months, and no as-of line means no profile', () => {
    expect(parseProfile(parse(html.replace('40 years 6 months', '40 years')))!.age).toEqual({ years: 40, months: 0 });
    expect(parseProfile(parse('<html><body>Sign in</body></html>'))).toBeNull();
  });
});

describe('date arithmetic', () => {
  test('minusYearsMonths clamps the day', () => {
    expect(minusYearsMonths('2026-03-31', 0, 1)).toBe('2026-02-28');
    expect(minusYearsMonths('2024-03-31', 0, 1)).toBe('2024-02-29');
    expect(minusYearsMonths('2026-01-15', 1, 2)).toBe('2024-11-15');
  });
  test('every birthday inside the window gives the printed age on the as-of day', () => {
    const w = birthWindow('2026-11-20', 40, 6);
    for (const b of [w.from, w.to]) {
      expect(ageOn('2026-11-20', b)).toBe(40);
    }
    expect(ageOn('2026-11-20', '1986-04-20')).toBe(40); // one day before the window: 40 years 7 months, outside
    expect(ageOn('2026-05-20', '1986-05-20')).toBe(40);
    expect(ageOn('2026-05-19', '1986-05-20')).toBe(39);
  });
});

/// <reference types="bun" />
/// <reference types="node" />
/// <reference lib="esnext" />
import { describe, expect, test } from 'bun:test';
import { ForecastScenario } from './forecast';
import { monteCarlo, mulberry32, normal, presets } from './monteCarlo';

const s: ForecastScenario = {
  start: '2026-12-15', startValue: 1000000, birthDate: '1990-01-01', retireAge: 67, endDate: '2028-12-31',
  contributions: { mode: 'fixed', annual: 0 }, employerRatio: 0, annualReturn: 0, goals: [1100000, 2000000],
};

describe('monte carlo', () => {
  test('mulberry32 is seeded and in [0, 1); normal draws are about N(0, 1)', () => {
    const a = mulberry32(7), b = mulberry32(7);
    const xs = Array.from({ length: 1000 }, () => a());
    expect(xs).toEqual(Array.from({ length: 1000 }, () => b()));
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
    const rng = mulberry32(1);
    const zs = Array.from({ length: 20000 }, () => normal(rng));
    const m = zs.reduce((t, z) => t + z, 0) / zs.length;
    const v = zs.reduce((t, z) => t + (z - m) * (z - m), 0) / zs.length;
    expect(Math.abs(m)).toBeLessThan(0.03);
    expect(Math.abs(v - 1)).toBeLessThan(0.05);
  });
  test('zero volatility equals the deterministic path: 1.12^2', () => {
    const r = monteCarlo(s, { paths: 50, model: { kind: 'normal', mean: 0.12, vol: 0 } });
    expect(r.years.map((y) => [y.year, y.age, y.p10, y.p50, y.p90])).toEqual([[2027, 37, 1120000, 1120000, 1120000], [2028, 38, 1254400, 1254400, 1254400]]);
    expect(r.goals).toEqual([{ goal: 1100000, probability: 1 }, { goal: 2000000, probability: 0 }]);
  });
  test('bootstrap of a constant 1 % month = 1.01^24', () => {
    const r = monteCarlo(s, { paths: 10, model: { kind: 'bootstrap', monthly: [0.01] } });
    expect(r.final.p50).toBe(Math.round(1000000 * Math.pow(1.01, 24)));
  });
  test('5,000 seeded paths: reproducible, ordered percentiles, a probability between 0 and 1', () => {
    const opt = { seed: 3, model: { kind: 'normal' as const, mean: 0.07, vol: 0.15 } };
    const r1 = monteCarlo(s, opt), r2 = monteCarlo(s, opt);
    expect(r1).toEqual(r2);
    const y = r1.years[1]!;
    expect(y.p10).toBeLessThan(y.p50);
    expect(y.p50).toBeLessThan(y.p90);
    expect(y.p50).toBeGreaterThan(1050000);
    expect(y.p50).toBeLessThan(1250000);
    expect(r1.goals[0]!.probability).toBeGreaterThan(0.3);
    expect(r1.goals[0]!.probability).toBeLessThan(1);
  });
  test('bear / base / bull presets', () => {
    const p = presets(0.07, 0.15);
    expect(p.bear.mean).toBeCloseTo(0.04, 12);
    expect(p.bull.mean).toBeCloseTo(0.1, 12);
    expect(p.base).toEqual({ mean: 0.07, vol: 0.15 });
  });
});

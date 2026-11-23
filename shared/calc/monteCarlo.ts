/// <reference lib="esnext" />
// Monte Carlo forecast (the plan section 7, Forecast M11): the same monthly schedule as the deterministic forecast,
// with random monthly returns. Seeded PRNG (mulberry32) so a run is reproducible. Returns either from an annual
// mean and volatility (normal monthly returns: mean (1 + m)^(1/12) - 1, sd vol / sqrt(12)) or bootstrapped from
// historical monthly returns. Output: P10, P50, P90 of the value at the end of each year, and the probability
// that the value at the horizon end reaches each goal
import { ageOn, buildSchedule, DEFAULT_GOALS, ForecastScenario, monthlyRate, simulatePath } from './forecast';
import { percentile, Rng, roundCents } from './stats';

export type ReturnModel = { kind: 'normal'; mean: number; vol: number } | { kind: 'bootstrap'; monthly: number[] };

export interface MonteCarloOptions {
  paths?: number; // default 5,000
  seed?: number; // default 42
  model: ReturnModel;
}

export interface McYear {
  year: number;
  endDate: string;
  age: number;
  p10: number;
  p50: number;
  p90: number;
}

export interface MonteCarloResult {
  years: McYear[];
  goals: Array<{ goal: number; probability: number }>;
  final: { p10: number; p50: number; p90: number };
}

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Standard normal draw (Box-Muller)
export function normal(rng: Rng): number {
  let u = 0;
  while (u === 0) u = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

// Bear / Base / Bull around a base annual mean: -3 and +3 percentage points, the same volatility
export function presets(baseMean = 0.07, vol = 0.15): Record<'bear' | 'base' | 'bull', { mean: number; vol: number }> {
  return { bear: { mean: baseMean - 0.03, vol }, base: { mean: baseMean, vol }, bull: { mean: baseMean + 0.03, vol } };
}

export function monteCarlo(s: ForecastScenario, opt: MonteCarloOptions): MonteCarloResult {
  const steps = buildSchedule(s);
  const n = opt.paths || 5000;
  const rng = mulberry32(opt.seed === undefined ? 42 : opt.seed);
  const model = opt.model;
  const draw: () => number =
    model.kind === 'normal'
      ? (() => { const mu = monthlyRate(model.mean), sd = model.vol / Math.sqrt(12); return () => Math.max(-0.99, mu + sd * normal(rng)); })()
      : () => (model.monthly.length ? model.monthly[Math.floor(rng() * model.monthly.length)]! : 0);

  // index of the last step of every year
  const yearEnds: number[] = [];
  steps.forEach((st, i) => { if (i === steps.length - 1 || steps[i + 1]!.year !== st.year) yearEnds.push(i); });
  const byYear: number[][] = yearEnds.map(() => []);
  const finals: number[] = [];
  for (let p = 0; p < n; p++) {
    const path = simulatePath(s.startValue, steps, () => draw());
    yearEnds.forEach((idx, k) => byYear[k]!.push(path[idx]! / steps[idx]!.deflator));
    finals.push(steps.length ? path[steps.length - 1]! / steps[steps.length - 1]!.deflator : s.startValue);
  }
  const years = yearEnds.map((idx, k) => {
    const v = byYear[k]!;
    return {
      year: steps[idx]!.year, endDate: steps[idx]!.date, age: ageOn(s.birthDate, steps[idx]!.date),
      p10: roundCents(percentile(v, 10)), p50: roundCents(percentile(v, 50)), p90: roundCents(percentile(v, 90)),
    };
  });
  const goals = (s.goals || DEFAULT_GOALS).map((goal) => ({ goal, probability: finals.filter((v) => v >= goal).length / n }));
  return { years, goals, final: { p10: roundCents(percentile(finals, 10)), p50: roundCents(percentile(finals, 50)), p90: roundCents(percentile(finals, 90)) } };
}

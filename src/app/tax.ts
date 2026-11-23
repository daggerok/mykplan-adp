/// <reference lib="esnext" />
// US federal income tax brackets: for each year the taxable income above which a rate starts, single filers and
// married filing jointly. Sources: IRS IR-2025 release for tax year 2026 (Rev. Proc. 2025-32) and IR-2026-133 for
// 2027 (Rev. Proc. 2026-35, 2026-11-05). Add a year when the IRS publishes it (each autumn)
import { t } from './i18n';

export const TAX_RATES = [0.1, 0.12, 0.22, 0.24, 0.32, 0.35, 0.37];

export const BRACKETS: Record<number, { single: number[]; joint: number[] }> = {
  2026: { single: [0, 12400, 50400, 105700, 201775, 256225, 640600], joint: [0, 24800, 100800, 211400, 403550, 512450, 768700] },
  2027: { single: [0, 12800, 52025, 109125, 208325, 264550, 661375], joint: [0, 25600, 104050, 218250, 416650, 529100, 793650] },
};

// New Jersey gross income tax (the owner lives in NJ, 2026-11-22): rates and the income above which each starts.
// Fixed in statute, not indexed (unchanged since 2020). NJ excludes 401(k) deferrals from wages, so pre-tax money is
// taxed by NJ on withdrawal too; qualified Roth withdrawals are not taxed
export const NJ = {
  single: { from: [0, 20000, 35000, 40000, 75000, 500000, 1000000], rates: [0.014, 0.0175, 0.035, 0.05525, 0.0637, 0.0897, 0.1075] },
  joint: { from: [0, 20000, 50000, 70000, 80000, 150000, 500000, 1000000], rates: [0.014, 0.0175, 0.0245, 0.035, 0.05525, 0.0637, 0.0897, 0.1075] },
};

export const njRateAt = (income: number, who: 'single' | 'joint'): number => {
  const b = NJ[who];
  let i = 0;
  while (i + 1 < b.from.length && income > b.from[i + 1]!) i++;
  return b.rates[i]!;
};

// the NJ rate that goes with a federal bracket: NJ's marginal rate at the top of that bracket, the higher of single
// and joint (conservative: 12% -> 5.525%, 22% and 24% -> 6.37% in 2026 and 2027). NJ income is not the federal
// taxable income (no standard deduction), so this is an estimate
export function njRateFor(fedRate: number, year: number): number {
  const i = TAX_RATES.indexOf(fedRate);
  const top = (who: 'single' | 'joint') => BRACKETS[year]?.[who][i + 1] ?? Infinity;
  return Math.max(njRateAt(top('single'), 'single'), njRateAt(top('joint'), 'joint'));
}

// federal + NJ for the latest known year on or before today
export function combinedRate(fedRate: number, today: string): { nj: number; total: number } {
  const year = bracketYears(today)[0]!;
  const nj = njRateFor(fedRate, year);
  return { nj, total: Math.round((fedRate + nj) * 100000) / 100000 };
}

const pctText = (r: number) => `${Math.round(r * 100000) / 1000}%`;

const dollars = (n: number) => `$${n.toLocaleString('en-US')}`;

const over = (n: number) => t('over {sum}', { sum: dollars(n) });

// "$50,401 - $105,700", or "over $640,600" for the top rate
export function bracketRange(year: number, rate: number, who: 'single' | 'joint'): string | null {
  const b = BRACKETS[year]?.[who];
  const i = TAX_RATES.indexOf(rate);
  if (!b || i < 0) return null;
  const from = i === 0 ? 0 : b[i]! + 1;
  return i + 1 < b.length ? `${dollars(from)} - ${dollars(b[i + 1]!)}` : over(b[i]!);
}

// the years to show on a given day: this one (or the latest known before it) and every later year already published
export function bracketYears(today: string): number[] {
  const year = Number(today.slice(0, 4));
  const known = Object.keys(BRACKETS).map(Number).sort((a, b) => a - b);
  const current = known.filter((y) => y <= year).pop();
  return known.filter((y) => y > year || y === current);
}

export function bracketHint(rate: number, today: string): string {
  const c = combinedRate(rate, today);
  const lines = [t('{total} = federal {fed} + NJ {nj}', { total: pctText(c.total), fed: pctText(rate), nj: pctText(c.nj) }), '',
    t('Federal {fed} bracket, taxable income:', { fed: pctText(rate) })];
  bracketYears(today).forEach((y) => lines.push(t('{year}: single {single}, joint {joint}', { year: y, single: bracketRange(y, rate, 'single') ?? '', joint: bracketRange(y, rate, 'joint') ?? '' })));
  const nj = (who: 'single' | 'joint') => {
    const b = NJ[who];
    const i = b.rates.indexOf(c.nj);
    return i + 1 < b.from.length ? `${dollars(b.from[i]! + 1)} - ${dollars(b.from[i + 1]!)}` : over(b.from[i]!);
  };
  lines.push('', t('NJ {nj} (every year): single {single}, joint {joint}', { nj: pctText(c.nj), single: nj('single'), joint: nj('joint') }));
  lines.push(t('NJ at 62+: retirement income is excluded up to $100,000 joint or $75,000 single when total income is under $100,000'));
  return lines.join('\n');
}

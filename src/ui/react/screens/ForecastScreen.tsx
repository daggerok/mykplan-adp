import { useEffect, useMemo, useState } from 'react';
import { projectDeterministic } from '../../../../shared/calc/forecast';
import { monteCarlo, presets } from '../../../../shared/calc/monteCarlo';
import { annualizedVolatility } from '../../../../shared/calc/stats';
import type { Derived } from '../../../app/derive';
import { settings, type Settings } from '../../../app/data';
import { pct, usd } from '../format';
import { Card, Cards, H } from './Cards';
import { t } from '../../../app/i18n';

const input = 'w-28 rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900';

export function ForecastScreen({ d, s, siteBirth }: { d: Derived; s: Settings; siteBirth: string | null }) {
  const histVol = useMemo(() => annualizedVolatility(d.portfolio.map((p) => p.dayReturn)) ?? 0.15, [d.portfolio]);
  const [ret, setRet] = useState(() => Math.round((d.scenario?.annualReturn ?? 0.07) * 1000) / 10);
  const [vol, setVol] = useState(() => Math.round(histVol * 1000) / 10);
  const [preset, setPreset] = useState<'bear' | 'base' | 'bull'>('base');
  // new data brings a new history: the defaults follow it (review 2026-11-22: they stayed at the first data set)
  useEffect(() => { setRet(Math.round((d.scenario?.annualReturn ?? 0.07) * 1000) / 10); }, [d.scenario?.annualReturn]);
  useEffect(() => { setVol(Math.round(histVol * 1000) / 10); }, [histVol]);
  const set = (p: Partial<Settings>) => settings.set({ ...settings.get(), ...p });

  // 5,000 Monte Carlo paths only when an input changes, not on every render (review 2026-11-22)
  const result = useMemo(() => {
    if (!d.scenario) return null;
    const pr = presets(ret / 100, vol / 100)[preset];
    const scenario = { ...d.scenario, annualReturn: pr.mean, inflation: s.inflation, real: s.real, retireAge: s.retireAge };
    return {
      det: projectDeterministic(scenario),
      mc: monteCarlo(scenario, { paths: s.monteCarloPaths, model: { kind: 'normal', mean: pr.mean, vol: pr.vol } }),
    };
  }, [d.scenario, ret, vol, preset, s.inflation, s.real, s.retireAge, s.monteCarloPaths]);
  if (!result) return <p className="text-sm text-slate-500">{t('Needs daily data and a birth date (from AccountHighlights after a sync, or set one below).')}</p>;
  const { det, mc } = result;
  const presetName = { bear: t('bear'), base: t('base'), bull: t('bull') };
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3 text-sm">
        <label className="flex flex-col gap-1">{t('Birth date')}
          <input type="date" className={input} value={s.birthDate ?? ''} placeholder={siteBirth ?? ''} onChange={(e) => set({ birthDate: e.target.value || null })} />
          <span className="text-xs text-slate-500">{s.birthDate ? t('your override') : t('from the site: {date}', { date: siteBirth ?? '—' })}</span>
        </label>
        <label className="flex flex-col gap-1">{t('Retire at')}<input type="number" className={input} value={s.retireAge} onChange={(e) => set({ retireAge: Number(e.target.value) || 67 })} /></label>
        <label className="flex flex-col gap-1">{t('Return, %/yr')}<input type="number" step="0.1" className={input} value={ret} onChange={(e) => setRet(Number(e.target.value))} /></label>
        <label className="flex flex-col gap-1">{t('Volatility, %')}<input type="number" step="0.1" className={input} value={vol} onChange={(e) => setVol(Number(e.target.value))} /></label>
        <label className="flex flex-col gap-1">{t('Inflation, %')}<input type="number" step="0.1" className={input} value={s.inflation * 100} onChange={(e) => set({ inflation: Number(e.target.value) / 100 })} /></label>
        <label className="flex items-center gap-1"><input type="checkbox" checked={s.real} onChange={(e) => set({ real: e.target.checked })} /> {t("real (today's dollars)")}</label>
        {(['bear', 'base', 'bull'] as const).map((k) => <button key={k} type="button" className={`rounded-md px-2 py-1 text-xs ${preset === k ? 'bg-blue-600 text-white' : 'bg-slate-200 dark:bg-slate-700'}`} onClick={() => setPreset(k)}>{presetName[k]}</button>)}
      </div>
      <p className="text-xs text-slate-500">{t('Defaults: return = your TWR per year (or 7%), volatility = your daily history, contributions as in the last 12 months, employer as in the last 12 months, IRS limits with catch-up by age. A short history gives a wide spread. This is a model, not advice.')}</p>
      <Cards>
        <Card label={t('At {age} ({date})', { age: det.final.age, date: det.final.date })} value={usd(det.final.value)} />
        <Card label="Monte Carlo P10 / P50 / P90" value={usd(mc.final.p50)} hint={`${usd(mc.final.p10)} … ${usd(mc.final.p90)}`} />
        <Card label={t('You put in / employer')} value={usd(det.final.eeTotal)} hint={usd(det.final.erTotal)} />
        <Card label={t('Growth')} value={usd(det.final.growthTotal)} />
      </Cards>
      <H>{t('Goals')}</H>
      <div className="flex flex-wrap gap-2 text-sm">
        {det.goals.map((g, i) => <span key={g.goal} className="rounded bg-slate-100 px-2 py-1 dark:bg-slate-700">{usd(g.goal)}: {g.date ? t('{date} (age {age})', { date: g.date, age: g.age ?? '' }) : t('not reached')} · {t('chance {p}', { p: pct(mc.goals[i]?.probability ?? null, 0) })}</span>)}
      </div>
      <H>{t('By year')}</H>
      <div className="max-h-[50vh] overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800"><tr>{[t('Year'), t('Age'), t('Limit'), t('You'), t('Employer'), t('Growth'), t('Value'), 'P10', 'P50', 'P90'].map((h) => <th key={h} className="px-2 py-1 text-right font-medium">{h}</th>)}</tr></thead>
          <tbody>
            {det.years.map((y, i) => (
              <tr key={y.year} className="border-t border-slate-100 text-right tabular-nums dark:border-slate-700/60">
                <td className="px-2">{y.year}</td><td className="px-2">{y.age}</td><td className="px-2">{usd(y.limit)}</td><td className="px-2">{usd(y.ee)}</td><td className="px-2">{usd(y.er)}</td><td className="px-2">{usd(y.growth)}</td><td className="px-2 font-medium">{usd(y.value)}</td>
                <td className="px-2 text-slate-500">{usd(mc.years[i]?.p10)}</td><td className="px-2">{usd(mc.years[i]?.p50)}</td><td className="px-2 text-slate-500">{usd(mc.years[i]?.p90)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

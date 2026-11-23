import { useEffect, useMemo, useRef, useState } from 'react';
import type { Dataset } from '../../../../shared/dataset';
import { benchmarkLine } from '../../../app/benchmarks';
import { buildSeries, loadLayouts, saveLayouts, type Layout } from '../../../app/builder';
import type { Derived } from '../../../app/derive';
import { mountPanes, type PanesHandle } from '../../../charts/panes';
import { t } from '../../../app/i18n';

const btn = (on: boolean) => `rounded-md px-2 py-1 text-xs ${on ? 'bg-blue-600 text-white' : 'bg-slate-200 dark:bg-slate-700'}`;

export function BuilderScreen({ d, ds, benchmarks, dark }: { d: Derived; ds: Dataset; benchmarks: string[]; dark: boolean }) {
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<PanesHandle | null>(null);
  const [layouts, setLayouts] = useState<Layout[]>(loadLayouts);
  const [i, setI] = useState(0);
  const [benchData, setBenchData] = useState<Record<string, Array<{ date: string; value: number }>>>({});
  const layout = layouts[i] ?? layouts[0]!;
  const funds = useMemo(() => Array.from(new Set(ds.dailyFunds.map((r) => r.fund))).sort(), [ds.dailyFunds]);
  const update = (patch: Partial<Layout>) => setLayouts((all) => { const next = all.map((l, k) => (k === i ? { ...l, ...patch } : l)); saveLayouts(next); return next; });
  const toggle = (id: Layout['main'][number]) => update({ main: layout.main.includes(id) ? layout.main.filter((x) => x !== id) : [...layout.main, id] });

  useEffect(() => {
    if (!el.current) return undefined;
    chart.current = mountPanes(el.current);
    return () => { chart.current?.destroy(); chart.current = null; };
  }, []);
  useEffect(() => { chart.current?.applyTheme(); }, [dark]);

  // benchmarks of the layout, rebased to the portfolio NAV at the start
  const wanted = layout.main.filter((x) => x.startsWith('bench:')).map((x) => x.slice(6));
  const start = (layout.from ? d.nav.find((p) => p.date >= layout.from!) : d.nav[0]) ?? null;
  useEffect(() => {
    if (!start) return undefined;
    let live = true;
    void Promise.all(wanted.filter((t) => !benchData[`${t}@${start.date}`]).map((t) => benchmarkLine(t, start.date, start.value).then((r): [string, Array<{ date: string; value: number }>] => [t, r.data]).catch((): [string, Array<{ date: string; value: number }>] => [t, []])))
      .then((list) => { if (live && list.length) setBenchData((b) => { const n = { ...b }; list.forEach(([t, data]) => { n[`${t}@${start.date}`] = data; }); return n; }); });
    return () => { live = false; };
  }, [wanted.join(','), start?.date]);

  useEffect(() => {
    if (!start) return;
    const benches: Record<string, Array<{ date: string; value: number }>> = {};
    wanted.forEach((t) => { benches[t] = benchData[`${t}@${start.date}`] ?? []; });
    chart.current?.set(buildSeries(layout, d, ds, benches));
  }, [layout, d, ds, benchData]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {layouts.map((l, k) => <button key={l.name + k} type="button" className={btn(k === i)} onClick={() => setI(k)}>{l.name}</button>)}
        <button type="button" className={btn(false)} onClick={() => { const name = t('Layout {n}', { n: layouts.length + 1 }); const next = [...layouts, { ...layout, name }]; setLayouts(next); saveLayouts(next); setI(next.length - 1); }}>{t('+ copy')}</button>
        {layouts.length > 1 && <button type="button" className={btn(false)} onClick={() => { const next = layouts.filter((_, k) => k !== i); setLayouts(next); saveLayouts(next); setI(0); }}>{t('delete')}</button>}
        <input className="w-40 rounded border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-600 dark:bg-slate-900" value={layout.name} onChange={(e) => update({ name: e.target.value })} />
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <button type="button" className={btn(layout.main.includes('nav'))} onClick={() => toggle('nav')}>Portfolio</button>
        <button type="button" className={btn(layout.main.includes('value'))} onClick={() => toggle('value')}>{t('Value $')}</button>
        {benchmarks.map((t) => <button key={t} type="button" className={btn(layout.main.includes(`bench:${t}`))} onClick={() => toggle(`bench:${t}`)}>{t}</button>)}
        <span className="mx-1 text-slate-300">|</span>
        <button type="button" className={btn(layout.percentFrom)} onClick={() => update({ percentFrom: !layout.percentFrom })}>{t('0 % from start')}</button>
        <button type="button" className={btn(layout.contributions)} onClick={() => update({ contributions: !layout.contributions })}>{t('Contributions pane')}</button>
        <button type="button" className={btn(layout.drawdown)} onClick={() => update({ drawdown: !layout.drawdown })}>{t('Drawdown pane')}</button>
        <label className="flex items-center gap-1">{t('from')} <input type="date" className="rounded border border-slate-300 bg-white px-1 dark:border-slate-600 dark:bg-slate-900" value={layout.from ?? ''} onChange={(e) => update({ from: e.target.value || undefined })} /></label>
      </div>
      <div className="flex flex-wrap gap-1 text-xs">
        {funds.map((f) => <button key={f} type="button" className={btn(layout.main.includes(`fund:${f}`))} onClick={() => toggle(`fund:${f}`)} title={t('fund price')}>{f.split(' - ')[0]}</button>)}
      </div>
      <div ref={el} className="h-[68vh] min-h-[360px] w-full" data-builder />
    </div>
  );
}

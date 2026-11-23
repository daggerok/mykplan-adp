import { useEffect, useMemo, useRef, useState } from 'react';
import { candles } from '../../../../shared/calc/ohlc';
import { allInBench, fundsVsBench, periodVsBench, type TrPoint } from '../../../../shared/calc/vsBench';
import { periodKey, type Timeframe } from '../../../../shared/dates';
import { BENCH_COLORS, benchmarkLine, benchmarkTr } from '../../../app/benchmarks';
import type { Dataset } from '../../../../shared/dataset';
import type { Derived } from '../../../app/derive';
import { mountChart, type ChartHandle, type Overlay } from '../../../charts/chart';
import { pct, usd } from '../format';
import { Table } from '../Table';
import { useStore } from '../useStore';
import { lang, t } from '../../../app/i18n';

const TFS: Timeframe[] = ['1D', '1W', '1M', '1Q', '1Y'];
const RANGES = ['1M', '3M', '6M', 'YTD', '1Y', '3Y', 'All'] as const;
const unitOf = (tf: Timeframe): string => ({ '1D': t('days'), '1W': t('weeks'), '1M': t('months'), '1Q': t('quarters'), '1Y': t('years') })[tf];
const WHAT_IF_COLOR = '#22d3ee';
type Range = (typeof RANGES)[number];

function rangeStart(last: string, r: Range): string | null {
  if (r === 'All') return null;
  if (r === 'YTD') return `${last.slice(0, 4)}-01-01`;
  const d = new Date(`${last}T00:00:00Z`);
  const months = { '1M': 1, '3M': 3, '6M': 6, '1Y': 12, '3Y': 36 }[r];
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.toISOString().slice(0, 10);
}

// a daily line on candles: the last value of each bucket, placed on the candle's day (one shared time grid)
export function onCandles(data: Array<{ date: string; value: number }>, tf: Timeframe, candleDays: string[]): Array<{ date: string; value: number }> {
  if (tf === '1D') return data;
  const dayOfKey = new Map(candleDays.map((d) => [periodKey(d, tf), d]));
  const last = new Map<string, number>();
  data.forEach((p) => { const k = periodKey(p.date, tf); if (dayOfKey.has(k)) last.set(k, p.value); });
  return Array.from(last.entries()).map(([k, v]) => ({ date: dayOfKey.get(k)!, value: v })).sort((a, b) => (a.date < b.date ? -1 : 1));
}

const btn = (on: boolean) => `rounded-md px-2 py-1 text-xs ${on ? 'bg-blue-600 text-white' : 'bg-slate-200 dark:bg-slate-700'}`;

export function ChartScreen({ d, ds, benchmarks, dark }: { d: Derived; ds: Dataset; benchmarks: string[]; dark: boolean }) {
  const language = useStore(lang);
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<ChartHandle | null>(null);
  const [tf, setTf] = useState<Timeframe>('1W');
  // performance: the account's own return (fund picks, contributions taken out); value: dollars; vs: the
  // performance per candle minus the compared index over the same days
  const [series, setSeries] = useState<'performance' | 'value' | 'vs'>('performance');
  const [cmp, setCmp] = useState(() => (benchmarks.includes('SPY') ? 'SPY' : benchmarks[0] ?? 'SPY'));
  const [tr, setTr] = useState<{ ticker: string; asOf: string | null; points: TrPoint[] } | null>(null);
  const [trNote, setTrNote] = useState('');
  const [range, setRange] = useState<Range>('All');
  const [log, setLog] = useState(false);
  const [bench, setBench] = useState<string[]>([]);
  const [benchNote, setBenchNote] = useState('');

  const base = series === 'value' ? d.value : d.nav;
  const last = base[base.length - 1]?.date ?? '';
  const from = rangeStart(last, range);
  const shown = useMemo(() => (from ? base.filter((p) => p.date >= from) : base), [base, from]);
  const flowsByDay = useMemo(() => {
    const m = new Map<string, number>();
    d.paychecks.forEach((p) => m.set(p.payCheckDate, (m.get(p.payCheckDate) ?? 0) + p.total / 100));
    return m;
  }, [d.paychecks]);

  // the compared index over the whole history (the what-if line starts with the first contribution)
  const firstDay = d.portfolio[0]?.date ?? '';
  useEffect(() => {
    if (!firstDay) return undefined;
    let live = true;
    setTrNote(t('loading {ticker}…', { ticker: cmp }));
    benchmarkTr(cmp, firstDay)
      .then((r) => { if (live) { setTr({ ticker: cmp, ...r }); setTrNote(r.asOf && r.asOf < last ? t('{ticker} as of {day} ⚠ behind', { ticker: cmp, day: r.asOf }) : ''); } })
      .catch((e: unknown) => { if (live) { setTr(null); setTrNote(t('{ticker} failed: {error}', { ticker: cmp, error: e instanceof Error ? e.message : String(e) })); } });
    return () => { live = false; };
  }, [cmp, firstDay, last, language]);
  const ready = tr && tr.ticker === cmp ? tr : null;
  const vsRows = useMemo(() => (ready ? periodVsBench(from ? d.portfolio.filter((p) => p.date >= from) : d.portfolio, ready.points, tf) : []), [ready, d.portfolio, from, tf]);
  const whatIf = useMemo(() => (ready ? allInBench(d.portfolio, ready.points) : []), [ready, d.portfolio]);
  const funds = useMemo(() => (ready ? fundsVsBench(ds.dailyFunds, ready.points) : []), [ready, ds.dailyFunds]);

  useEffect(() => {
    if (!el.current) return undefined;
    chart.current = mountChart(el.current);
    return () => { chart.current?.destroy(); chart.current = null; };
  }, []);

  useEffect(() => { chart.current?.applyTheme(); }, [dark]);

  useEffect(() => {
    const c = chart.current;
    if (!c) return;
    const points = shown.map((p) => ({ date: p.date, value: p.value, volume: flowsByDay.get(p.date) ?? 0 }));
    if (series === 'vs') {
      c.setBars(vsRows.filter((r) => r.diff !== null).map((r) => ({ date: r.from, value: r.diff! * 100, up: r.diff! >= 0 })));
      c.setVolume([]);
    } else if (tf === '1D') {
      c.setLine(points);
      c.setVolume(points.map((p) => ({ date: p.date, value: p.volume })));
    } else {
      const cs = candles(points, tf);
      c.setCandles(cs);
      c.setVolume(cs.map((x) => ({ date: x.date, value: x.volume })));
    }
    const firstDay = shown[0]?.date ?? '';
    // only markers inside the shown days: a later one would be pinned to the last candle (they stacked there)
    const lastDay = shown[shown.length - 1]?.date ?? '';
    const inRange = d.markers.filter((m) => m.date >= firstDay && m.date <= lastDay);
    // on candles a marker sits on its candle's first day
    const keyed = tf === '1D' ? inRange : inRange.map((m) => {
      const k = periodKey(m.date, tf);
      const candleDay = points.find((p) => periodKey(p.date, tf) === k)?.date ?? m.date;
      return { ...m, date: candleDay };
    });
    c.setMarkers(keyed.filter((m) => m.kind !== 'contribution' || tf === '1D'));
    // the scale says what its numbers are, the legend names the main line
    if (series === 'value') c.setUnit('$', t('Account value, $'));
    else if (series === 'vs') c.setUnit('%', t('Your return minus {cmp}, percentage points', { cmp }));
    else c.setUnit('index', t('Your return, 100 = first day'));
    c.setLog(series !== 'vs' && log);
    c.fit();
  }, [shown, tf, log, d.markers, flowsByDay, series, vsRows, cmp, language]);

  useEffect(() => {
    const c = chart.current;
    const start = shown[0];
    if (!c || !start) return;
    const candleDays = tf === '1D' ? [] : candles(shown.map((p) => ({ date: p.date, value: p.value })), tf).map((x) => x.date);
    // value: the same contributions all in the compared index, in dollars like the value line
    const extra: Overlay[] = series === 'value' && whatIf.length
      ? [{ name: t('All in {ticker}', { ticker: cmp }), color: WHAT_IF_COLOR, data: onCandles(whatIf.filter((p) => p.date >= start.date).map((p) => ({ date: p.date, value: p.value / 100 })), tf, candleDays) }]
      : [];
    if (!bench.length || series === 'vs') { c.setOverlays(extra); setBenchNote(''); return; }
    let live = true;
    setBenchNote(t('loading…'));
    void Promise.all(bench.map((ticker) => benchmarkLine(ticker, start.date, start.value).then((r) => ({ ticker, ...r })).catch((e: unknown) => ({ ticker, asOf: null, data: [], error: String(e) }))))
      .then((list) => {
        if (!live) return;
        c.setOverlays(list.map((x) => ({ name: x.ticker, color: BENCH_COLORS[x.ticker] ?? '#94a3b8', data: onCandles(x.data, tf, candleDays) })).concat(extra));
        c.fit();
        setBenchNote(list.map((x) => {
          if ('error' in x) return t('{ticker} failed: {error}', { ticker: x.ticker, error: x.error });
          const p = { ticker: x.ticker, day: x.asOf ?? '?' };
          return x.asOf && x.asOf < last ? t('{ticker} as of {day} ⚠ behind', p) : t('{ticker} as of {day}', p);
        }).join(' · '));
      });
    return () => { live = false; };
  }, [bench, shown, last, tf, series, whatIf, cmp, language]);

  // one-line results of the comparison for the shown range
  const compared = vsRows.filter((r) => r.diff !== null);
  const beat = compared.filter((r) => r.diff! > 0).length;
  const chained = (k: 'mine' | 'bench') => compared.reduce((g, r) => g * (1 + (r[k] ?? 0)), 1) - 1;
  const lastValue = d.portfolio[d.portfolio.length - 1];
  const lastWhatIf = whatIf[whatIf.length - 1];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {TFS.map((t) => <button key={t} type="button" className={btn(tf === t)} onClick={() => setTf(t)}>{t}</button>)}
        <span className="mx-1 text-slate-300">|</span>
        <button type="button" className={btn(series === 'performance')} onClick={() => setSeries('performance')}>{t('Performance')}</button>
        <button type="button" className={btn(series === 'value')} onClick={() => setSeries('value')}>{t('Value $')}</button>
        <button type="button" className={btn(series === 'vs')} onClick={() => setSeries('vs')} title={t('Your return minus {cmp} per candle, over the same days', { cmp })}>vs {cmp} %</button>
        <select value={cmp} onChange={(e) => setCmp(e.target.value)} className="rounded-md bg-slate-200 px-1 py-1 text-xs dark:bg-slate-700" title={t('The index your fund picks are compared with')}>
          {benchmarks.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <span className="mx-1 text-slate-300">|</span>
        {RANGES.map((r) => <button key={r} type="button" className={btn(range === r)} onClick={() => setRange(r)}>{r}</button>)}
        {series !== 'vs' && <button type="button" className={btn(log)} onClick={() => setLog((v) => !v)}>log</button>}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-slate-500">{t('Benchmarks (total return from the first shown day):')}</span>
        {benchmarks.map((t) => (
          <button key={t} type="button" className={btn(bench.includes(t))} style={bench.includes(t) ? { background: BENCH_COLORS[t] } : undefined} onClick={() => setBench((b) => (b.includes(t) ? b.filter((x) => x !== t) : [...b, t]))}>{t}</button>
        ))}
        <span className="text-slate-500">{benchNote}</span>
      </div>
      {trNote && <div className="text-xs text-amber-600">{trNote}</div>}
      {series === 'vs' && compared.length > 0 && (
        <div className="text-sm">
          {t('Beat {cmp} in', { cmp })} <b>{t('{n} of {m}', { n: beat, m: compared.length })}</b> {unitOf(tf)} · {t('your picks')} <b>{pct(chained('mine'))}</b> {t('vs {cmp}', { cmp })} <b>{pct(chained('bench'))}</b> {t('over the shown range')}
          <span className="text-slate-500"> {t('(bars: your return minus {cmp}, percentage points)', { cmp })}</span>
        </div>
      )}
      {series === 'value' && lastValue && lastWhatIf && (
        <div className="text-sm">
          {t('Today: your picks')} <b>{usd(lastValue.end)}</b> · {t('all in {cmp}', { cmp })} <b>{usd(lastWhatIf.value)}</b> · {t('difference')}{' '}
          <b className={lastValue.end >= lastWhatIf.value ? 'text-green-600' : 'text-red-600'}>{lastValue.end >= lastWhatIf.value ? '+' : ''}{usd(lastValue.end - lastWhatIf.value)}</b>
          <span className="text-slate-500"> {t('(the same contributions on the same days, all bought into {cmp})', { cmp })}</span>
        </div>
      )}
      <div ref={el} className="h-[60vh] min-h-[320px] w-full" data-chart />
      {series === 'vs' && (
        <Table name={`periods-vs-${cmp}`} rows={vsRows} columns={[
          { key: 'k', label: t('Period'), text: (r) => r.key },
          { key: 'm', label: t('Yours'), text: (r) => pct(r.mine), sort: (r) => r.mine, align: 'right' },
          { key: 'b', label: cmp, text: (r) => pct(r.bench), sort: (r) => r.bench ?? 0, align: 'right' },
          { key: 'd', label: t('Difference'), text: (r) => pct(r.diff), sort: (r) => r.diff ?? 0, align: 'right' },
        ]} />
      )}
      <div className="text-sm font-medium">{t('Funds held, each against {cmp} over the same days', { cmp })}</div>
      <Table name={`funds-vs-${cmp}`} rows={funds} initialSort={{ key: 'd', desc: false }} columns={[
        { key: 'f', label: t('Fund'), text: (r) => r.fund },
        { key: 'a', label: t('From'), text: (r) => r.from },
        { key: 'z', label: t('To'), text: (r) => r.to },
        { key: 'n', label: t('Days'), text: (r) => String(r.days), sort: (r) => r.days, align: 'right' },
        { key: 'r', label: t('Return'), text: (r) => pct(r.ret), sort: (r) => r.ret, align: 'right', hint: t('The fund\'s own return while you held it: contributions and transfers are not return') },
        { key: 'b', label: cmp, text: (r) => pct(r.bench), sort: (r) => r.bench ?? 0, align: 'right' },
        { key: 'd', label: t('Difference'), text: (r) => pct(r.diff), sort: (r) => r.diff ?? 0, align: 'right', hint: t('Below 0: {cmp} would have done better on those days', { cmp }) },
      ]} />
    </div>
  );
}

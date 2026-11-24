import { useEffect, useMemo, useRef, useState } from 'react';
import { candles } from '../../../../shared/calc/ohlc';
import { allInBench, fundsVsBench, periodVsBench, type TrPoint } from '../../../../shared/calc/vsBench';
import { periodKey, type Timeframe } from '../../../../shared/dates';
import { BENCH_COLORS, benchmarkLine, benchmarkTr } from '../../../app/benchmarks';
import type { Dataset } from '../../../../shared/dataset';
import type { Derived } from '../../../app/derive';
import { mountChart, type ChartHandle, type ChartMarker, type Overlay } from '../../../charts/chart';
import { settings } from '../../../app/data';
import { ChartFrame } from '../ChartFrame';
import { pct, usd } from '../format';
import { Table } from '../Table';
import { useStore } from '../useStore';
import { lang, t } from '../../../app/i18n';

const TFS: Timeframe[] = ['1D', '1W', '1M', '1Q', '1Y'];
const RANGES = ['1M', '3M', '6M', 'YTD', '1Y', '3Y', 'All'] as const;
const unitOf = (tf: Timeframe): string => ({ '1D': t('days'), '1W': t('weeks'), '1M': t('months'), '1Q': t('quarters'), '1Y': t('years') })[tf];
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
const sep = <span className="mx-1 text-slate-300">|</span>;

// what the chart shows besides the main line (owner 2026-11-23: buys and rebalances off by default), remembered per browser
interface Show { buys: boolean; rebalances: boolean; rates: boolean; bars: boolean }
const SHOW_KEY = 'mykplan-adp-chart-show';
const DEFAULT_SHOW: Show = { buys: false, rebalances: false, rates: true, bars: true };
const loadShow = (): Show => { try { return { ...DEFAULT_SHOW, ...(JSON.parse(localStorage.getItem(SHOW_KEY) ?? '{}') as Partial<Show>) }; } catch { return DEFAULT_SHOW; } };
const saveShow = (v: Show) => { try { localStorage.setItem(SHOW_KEY, JSON.stringify(v)); } catch { /* private window */ } };
const KIND_SHOWN: Record<ChartMarker['kind'], keyof Show> = { contribution: 'buys', rebalance: 'rebalances', rate: 'rates' };

type Tr = { asOf: string | null; points: TrPoint[] } | { error: string };

export function ChartScreen({ d, ds, benchmarks, dark }: { d: Derived; ds: Dataset; benchmarks: string[]; dark: boolean }) {
  const language = useStore(lang);
  const colors = JSON.stringify(useStore(settings).chartColors ?? {});
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<ChartHandle | null>(null);
  const [tf, setTf] = useState<Timeframe>('1W');
  // performance: the account's own return (fund picks, contributions taken out); value: dollars; vs: the
  // performance per candle minus the compared index over the same days
  const [series, setSeries] = useState<'performance' | 'value' | 'vs'>('performance');
  const [cmp, setCmp] = useState(() => (benchmarks.includes('SPY') ? 'SPY' : benchmarks[0] ?? 'SPY'));
  const [trs, setTrs] = useState<Record<string, Tr>>({});
  const [range, setRange] = useState<Range>('All');
  const [log, setLog] = useState(false);
  // "Compare with": index lines on Performance, "all in" lines on Value $ (each only while its button is on)
  const [bench, setBench] = useState<string[]>([]);
  const [benchNote, setBenchNote] = useState('');
  const [show, setShowState] = useState<Show>(loadShow);
  const toggleShow = (k: keyof Show) => setShowState((v) => { const next = { ...v, [k]: !v[k] }; saveShow(next); return next; });

  const base = series === 'value' ? d.value : d.nav;
  const last = base[base.length - 1]?.date ?? '';
  const from = rangeStart(last, range);
  const shown = useMemo(() => (from ? base.filter((p) => p.date >= from) : base), [base, from]);
  const flowsByDay = useMemo(() => {
    const m = new Map<string, number>();
    d.paychecks.forEach((p) => m.set(p.payCheckDate, (m.get(p.payCheckDate) ?? 0) + p.total / 100));
    return m;
  }, [d.paychecks]);

  // the indexes over the whole history: the compared one (vs and the funds table) and, on Value $, every "Compare with"
  const firstDay = d.portfolio[0]?.date ?? '';
  const needed = Array.from(new Set([cmp, ...(series === 'value' ? bench : [])])).sort().join(',');
  useEffect(() => {
    if (!firstDay) return undefined;
    let live = true;
    needed.split(',').filter((x) => x && !(x in trs)).forEach((ticker) => {
      benchmarkTr(ticker, firstDay)
        .then((r) => { if (live) setTrs((m) => ({ ...m, [ticker]: r })); })
        .catch((e: unknown) => { if (live) setTrs((m) => ({ ...m, [ticker]: { error: e instanceof Error ? e.message : String(e) } })); });
    });
    return () => { live = false; };
  }, [needed, firstDay]); // trs is read only to skip the tickers already loaded
  const points = (ticker: string): TrPoint[] | null => { const r = trs[ticker]; return r && 'points' in r ? r.points : null; };
  const cmpPoints = points(cmp);
  const vsRows = useMemo(() => (cmpPoints ? periodVsBench(from ? d.portfolio.filter((p) => p.date >= from) : d.portfolio, cmpPoints, tf) : []), [cmpPoints, d.portfolio, from, tf]);
  const funds = useMemo(() => (cmpPoints ? fundsVsBench(ds.dailyFunds, cmpPoints) : []), [cmpPoints, ds.dailyFunds]);
  const whatIfs = useMemo(() => (series !== 'value' ? [] : bench.flatMap((ticker) => {
    const p = points(ticker);
    return p ? [{ ticker, rows: allInBench(d.portfolio, p) }] : [];
  })), [series, bench, trs, d.portfolio]);

  useEffect(() => {
    if (!el.current) return undefined;
    chart.current = mountChart(el.current);
    return () => { chart.current?.destroy(); chart.current = null; };
  }, []);

  useEffect(() => { chart.current?.applyTheme(); }, [dark, colors]);

  useEffect(() => {
    const c = chart.current;
    if (!c) return;
    const pts = shown.map((p) => ({ date: p.date, value: p.value, volume: flowsByDay.get(p.date) ?? 0 }));
    const barsName = t('Contributions per candle, $');
    if (series === 'vs') {
      c.setBars(vsRows.filter((r) => r.diff !== null).map((r) => ({ date: r.from, value: r.diff! * 100, up: r.diff! >= 0 })));
      c.setVolume([]);
    } else if (tf === '1D') {
      c.setLine(pts);
      c.setVolume(show.bars ? pts.map((p) => ({ date: p.date, value: p.volume })) : [], barsName);
    } else {
      const cs = candles(pts, tf);
      c.setCandles(cs);
      c.setVolume(show.bars ? cs.map((x) => ({ date: x.date, value: x.volume })) : [], barsName);
    }
    const firstShown = shown[0]?.date ?? '';
    // only markers inside the shown days: a later one would be pinned to the last candle (they stacked there)
    const lastShown = shown[shown.length - 1]?.date ?? '';
    const inRange = d.markers.filter((m) => m.date >= firstShown && m.date <= lastShown && show[KIND_SHOWN[m.kind]]);
    // on candles a marker sits on its candle's first day
    const keyed = tf === '1D' ? inRange : inRange.map((m) => {
      const k = periodKey(m.date, tf);
      const candleDay = pts.find((p) => periodKey(p.date, tf) === k)?.date ?? m.date;
      return { ...m, date: candleDay };
    });
    c.setMarkers(keyed);
    // the scale says what its numbers are, the legend names the main line
    if (series === 'value') c.setUnit('$', t('Account value, $'));
    else if (series === 'vs') c.setUnit('%', t('Your return minus {cmp}, percentage points', { cmp }));
    else c.setUnit('index', t('Your return, 100 = first day'));
    c.setLog(series !== 'vs' && log);
    c.fit();
  }, [shown, tf, log, d.markers, flowsByDay, series, vsRows, cmp, language, show, colors]);

  useEffect(() => {
    const c = chart.current;
    const start = shown[0];
    if (!c || !start) return;
    const candleDays = tf === '1D' ? [] : candles(shown.map((p) => ({ date: p.date, value: p.value })), tf).map((x) => x.date);
    if (series === 'vs') { c.setOverlays([]); setBenchNote(''); return; }
    if (series === 'value') {
      // the same contributions on the same days, all bought into each compared index, in dollars like the value line
      c.setOverlays(whatIfs.map((w) => ({ name: t('All in {ticker}', { ticker: w.ticker }), color: BENCH_COLORS[w.ticker] ?? '#94a3b8', data: onCandles(w.rows.filter((p) => p.date >= start.date).map((p) => ({ date: p.date, value: p.value / 100 })), tf, candleDays) })));
      setBenchNote('');
      return;
    }
    if (!bench.length) { c.setOverlays([]); setBenchNote(''); return; }
    let live = true;
    setBenchNote(t('loading…'));
    void Promise.all(bench.map((ticker) => benchmarkLine(ticker, start.date, start.value).then((r) => ({ ticker, ...r })).catch((e: unknown) => ({ ticker, asOf: null, data: [], error: String(e) }))))
      .then((list) => {
        if (!live) return;
        c.setOverlays(list.map((x) => ({ name: x.ticker, color: BENCH_COLORS[x.ticker] ?? '#94a3b8', data: onCandles(x.data, tf, candleDays) })) as Overlay[]);
        c.fit();
        setBenchNote(list.filter((x) => 'error' in x || (x.asOf && x.asOf < last)).map((x) => ('error' in x ? t('{ticker} failed: {error}', { ticker: x.ticker, error: x.error }) : t('{ticker} as of {day} ⚠ behind', { ticker: x.ticker, day: x.asOf ?? '?' }))).join(' · '));
      });
    return () => { live = false; };
  }, [bench, shown, last, tf, series, whatIfs, language]);

  // one-line results under the chart, for the shown range
  const compared = vsRows.filter((r) => r.diff !== null);
  const beat = compared.filter((r) => r.diff! > 0).length;
  const chained = (k: 'mine' | 'bench') => compared.reduce((g, r) => g * (1 + (r[k] ?? 0)), 1) - 1;
  const lastValue = d.portfolio[d.portfolio.length - 1];
  const notes = [benchNote, ...Array.from(new Set([cmp, ...(series === 'value' ? bench : [])])).map((ticker) => {
    const r = trs[ticker];
    if (!r) return '';
    if ('error' in r) return t('{ticker} failed: {error}', { ticker, error: r.error });
    return r.asOf && r.asOf < last ? t('{ticker} as of {day} ⚠ behind', { ticker, day: r.asOf }) : '';
  })].filter(Boolean);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {TFS.map((x) => <button key={x} type="button" className={btn(tf === x)} onClick={() => setTf(x)}>{x}</button>)}
        {sep}
        <button type="button" className={btn(series === 'performance')} onClick={() => setSeries('performance')}>{t('Performance')}</button>
        <button type="button" className={btn(series === 'value')} onClick={() => setSeries('value')}>{t('Value $')}</button>
        <button type="button" className={btn(series === 'vs')} onClick={() => setSeries('vs')} title={t('Your return minus {cmp} per candle, over the same days', { cmp })}>vs {cmp} %</button>
        <select value={cmp} onChange={(e) => setCmp(e.target.value)} className="rounded-md bg-slate-200 px-1 py-1 text-xs dark:bg-slate-700" title={t('The index your fund picks are compared with')}>
          {benchmarks.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
        {sep}
        {RANGES.map((r) => <button key={r} type="button" className={btn(range === r)} onClick={() => setRange(r)}>{r}</button>)}
        {series !== 'vs' && <button type="button" className={btn(log)} onClick={() => setLog((v) => !v)} title={t('Logarithmic scale: the same percent move looks the same size at any level')}>log</button>}
        {series !== 'vs' && (
          <>
            {sep}
            <span className="text-xs text-slate-500" title={series === 'value' ? t('Each one adds a line: the same contributions on the same days, all bought into that index') : t('Each one adds its total return line, started at your line on the first shown day')}>{t('Compare with')}:</span>
            {benchmarks.map((x) => (
              <button key={x} type="button" className={btn(bench.includes(x))} style={bench.includes(x) ? { background: BENCH_COLORS[x] } : undefined} onClick={() => setBench((b) => (b.includes(x) ? b.filter((y) => y !== x) : [...b, x]))}>{x}</button>
            ))}
          </>
        )}
        {sep}
        <span className="text-xs text-slate-500">{t('Show')}:</span>
        <button type="button" className={btn(show.buys)} onClick={() => toggleShow('buys')} title={t('Green arrows: the days your paychecks bought the funds')}>{t('Buys')}</button>
        <button type="button" className={btn(show.rebalances)} onClick={() => toggleShow('rebalances')} title={t('Amber squares "⇄ N funds": money moved between funds, N funds took part')}>{t('Rebalances')}</button>
        <button type="button" className={btn(show.rates)} onClick={() => toggleShow('rates')} title={t('Blue dots "Roth N%": your requests to change the contribution percent')}>{t('Rate changes')}</button>
        {series !== 'vs' && <button type="button" className={btn(show.bars)} onClick={() => toggleShow('bars')} title={t('Bars along the bottom: the money your paychecks put in during each candle')}>{t('Contributions')}</button>}
      </div>
      <ChartFrame elRef={el} view={() => chart.current} className="h-[62vh] min-h-[340px]" data="chart" />
      {series === 'vs' && compared.length > 0 && (
        <div className="text-sm">
          {t('Beat {cmp} in', { cmp })} <b>{t('{n} of {m}', { n: beat, m: compared.length })}</b> {unitOf(tf)} · {t('your picks')} <b>{pct(chained('mine'))}</b> {t('vs {cmp}', { cmp })} <b>{pct(chained('bench'))}</b> {t('over the shown range')}
          <span className="text-slate-500"> {t('(bars: your return minus {cmp}, percentage points)', { cmp })}</span>
        </div>
      )}
      {series === 'value' && lastValue && (
        <div className="text-sm">
          {t('Today: your picks')} <b>{usd(lastValue.end)}</b>
          {whatIfs.map((w) => {
            const v = w.rows[w.rows.length - 1]?.value;
            if (v === undefined) return null;
            return (
              <span key={w.ticker}> · {t('all in {cmp}', { cmp: w.ticker })} <b>{usd(v)}</b> (<b className={lastValue.end >= v ? 'text-green-600' : 'text-red-600'}>{lastValue.end >= v ? '+' : ''}{usd(lastValue.end - v)}</b>)</span>
            );
          })}
          <span className="text-slate-500"> {whatIfs.length ? t('(each "all in": the same contributions on the same days, all bought into that index)') : t('(press an index in "Compare with" to see the same money all in it)')}</span>
        </div>
      )}
      {notes.length > 0 && <div className="text-xs text-amber-600">{notes.join(' · ')}</div>}
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

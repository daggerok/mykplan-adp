import type { Derived } from '../../../app/derive';
import { pct, pts } from '../format';
import { Card, Cards, H } from './Cards';
import { Table } from '../Table';
import { t } from '../../../app/i18n';

const heat = (r: number) => {
  const a = Math.min(Math.abs(r) / 0.06, 1);
  return r >= 0 ? `rgba(22,163,74,${0.12 + a * 0.6})` : `rgba(220,38,38,${0.12 + a * 0.6})`;
};

export function ReturnsScreen({ d }: { d: Derived }) {
  const years = Array.from(new Set(d.monthly.map((m) => m.key.slice(0, 4)))).sort();
  const byKey = new Map(d.monthly.map((m) => [m.key, m]));
  const flagged = d.monthly.filter((m) => m.flag).length;
  return (
    <div className="flex flex-col gap-3">
      <Cards>
        <Card label={t('TWR, all time')} value={pct(d.twrTotal)} hint={t('time-weighted: contributions do not count as return')} />
        <Card label={t('TWR, per year')} value={pct(d.twrAnnual)} hint={t('shown from one year of history')} />
        <Card label={t('XIRR (money-weighted)')} value={pct(d.xirr)} />
        <Card label={t('Max drawdown')} value={d.maxDrawdown ? pct(-Math.abs(d.maxDrawdown.depth)) : '—'} hint={d.maxDrawdown ? `${d.maxDrawdown.peakDate} → ${d.maxDrawdown.troughDate}` : ''} />
      </Cards>
      <H>{t("Months: our TWR against the site's Personal RoR")} {flagged ? t('(⚠ {n} differ by more than 0.05 pp)', { n: flagged }) : ''}</H>
      <div className="overflow-x-auto">
        <table className="text-xs">
          <thead><tr><th className="px-1" />{[t('Jan'), t('Feb'), t('Mar'), t('Apr'), t('May'), t('Jun'), t('Jul'), t('Aug'), t('Sep'), t('Oct'), t('Nov'), t('Dec')].map((m) => <th key={m} className="px-1 font-normal text-slate-500">{m}</th>)}</tr></thead>
          <tbody>
            {years.map((y) => (
              <tr key={y}>
                <td className="pr-2 font-medium">{y}</td>
                {Array.from({ length: 12 }, (_, i) => byKey.get(`${y}-${String(i + 1).padStart(2, '0')}`)).map((m, i) => (
                  <td key={i} className="px-0.5 py-0.5">
                    {m ? <div className="min-w-14 rounded px-1 py-1 text-center tabular-nums" style={{ background: heat(m.oursPct / 100) }} title={t('site {site} · diff {diff}', { site: pts(m.sitePct), diff: pts(m.diffPct) })}>{pts(m.oursPct, 1)}{m.flag ? ' ⚠' : ''}</div> : null}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Table name="returns-monthly" rows={d.monthly} initialSort={{ key: 'm', desc: true }} columns={[
        { key: 'm', label: t('Month'), text: (r) => r.key },
        { key: 'o', label: t('Our TWR'), text: (r) => pts(r.oursPct, 3), sort: (r) => r.oursPct, align: 'right' },
        { key: 's', label: t('Site RoR'), text: (r) => pts(r.sitePct, 2), sort: (r) => r.sitePct ?? -1e9, align: 'right' },
        { key: 'd', label: t('Diff, pp'), text: (r) => (r.diffPct === null ? '—' : r.diffPct.toFixed(3)), sort: (r) => Math.abs(r.diffPct ?? 0), align: 'right' },
        { key: 'f', label: '', text: (r) => (r.flag ? '⚠' : '') },
      ]} />
      <H>{t('Years (TWR)')}</H>
      <div className="flex flex-wrap gap-2">{d.yearly.map((y) => <Card key={y.key} label={`${y.key} (${y.from} → ${y.to})`} value={pct(y.ret)} />)}</div>
    </div>
  );
}

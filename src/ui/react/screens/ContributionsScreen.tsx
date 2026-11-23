import type { Dataset } from '../../../../shared/dataset';
import type { Derived } from '../../../app/derive';
import { usd } from '../format';
import { Table } from '../Table';
import { Card, H } from './Cards';
import { afterTax, nonRoth, pnl, pnlPct, TAX_BRACKETS, type Paycheck } from '../../../app/derive';
import { daysBetween, fromUtc } from '../../../../shared/dates';
import { bracketHint, combinedRate } from '../../../app/tax';
import { t } from '../../../app/i18n';

export function ContributionsScreen({ d, ds }: { d: Derived; ds: Dataset }) {
  const sources = ds.periods.filter((p) => p.scope === 'source' && p.from.slice(0, 7) === p.to.slice(0, 7));
  const lastMonth = sources.reduce((m, p) => (p.to > m ? p.to : m), '');
  const today = fromUtc(new Date());
  return (
    <div className="flex flex-col gap-3">
      {/* Roth is taxed now, everything else (before-tax and the employer's money) is taxed when withdrawn */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <Card label={t('Employee Roth')} value={usd(d.totals.EE_ROTH)} />
        <Card label="Non-Roth" value={usd(nonRoth(d.totals))} hint={t('Employee Before-Tax + Employer Match + Employer NEC: taxed when withdrawn')} />
        <Card label={t('Employee Before-Tax')} value={usd(d.totals.EE_PRETAX)} />
        <Card label={t('Employer Match')} value={usd(d.totals.ER_MATCH)} />
        <Card label={t('Employer NEC')} value={usd(d.totals.ER_NEC)} />
      </div>
      <H>{t('Contribution percent (from the change journal; the date is the request day)')}</H>
      <div className="flex flex-wrap gap-2 text-sm">{ds.rates.map((r) => <span key={r.date} className="rounded bg-slate-100 px-2 py-1 dark:bg-slate-700">{r.date}: Roth {r.rothPct}% · Pre-Tax {r.preTaxPct}%</span>)}</div>
      <H>{t('Paychecks')}</H>
      <Table name="paychecks" rows={d.paychecks} columns={[
        { key: 'd', label: t('Pay check'), text: (p) => p.payCheckDate },
        { key: 'a', label: t('Activity date'), text: (p) => p.activityDate },
        { key: 'g', label: t('Delay, days'), text: (p) => String(daysBetween(p.payCheckDate, p.activityDate)), sort: (p) => daysBetween(p.payCheckDate, p.activityDate), align: 'right' },
        { key: 'r', label: 'EE Roth', text: (p) => usd(p.EE_ROTH), sort: (p) => p.EE_ROTH, align: 'right' },
        { key: 'b', label: 'EE Before-Tax', text: (p) => usd(p.EE_PRETAX), sort: (p) => p.EE_PRETAX, align: 'right' },
        { key: 'm', label: 'ER Match', text: (p) => usd(p.ER_MATCH), sort: (p) => p.ER_MATCH, align: 'right' },
        { key: 'n', label: 'ER NEC', text: (p) => usd(p.ER_NEC), sort: (p) => p.ER_NEC, align: 'right' },
        { key: 't', label: t('Total'), text: (p) => usd(p.total), sort: (p) => p.total, align: 'right' },
        { key: 'i', label: t('Total invested'), text: (p) => usd(p.invested), sort: (p) => p.invested, align: 'right' },
        // profit or loss on that day: the value minus everything put in so far
        { key: 'pl', label: t('P&L $ at'), text: (p) => { const v = pnl(p); return v === null ? '-' : usd(v); }, sort: (p) => pnl(p) ?? 0, align: 'right' },
        { key: 'plp', label: t('P&L % at'), text: (p) => { const v = pnlPct(p); return v === null ? '-' : `${v.toFixed(2)}%`; }, sort: (p) => pnlPct(p) ?? 0, align: 'right' },
        { key: 'v', label: t('Value at'), text: (p) => (p.valueAt === null ? '-' : usd(p.valueAt)), sort: (p) => p.valueAt ?? 0, align: 'right' },
        // federal bracket + New Jersey on the value: the Roth part in full, the rest (contributions and growth) minus both
        ...TAX_BRACKETS.map((fed) => {
          const rate = combinedRate(fed, today).total;
          const pct = `${Math.round(rate * 100000) / 1000}%`;
          const now = d.current ? afterTax(d.current, rate) : null;
          return {
            key: `tax${fed}`, label: t('After {fed}% + NJ', { fed: Math.round(fed * 100) }), align: 'right' as const,
            text: (p: Paycheck) => { const v = afterTax(p, rate); return v === null ? '-' : usd(v); }, sort: (p: Paycheck) => afterTax(p, rate) ?? 0,
            hint: t('Value at, after tax when withdrawn: the Roth part (contributions and growth) in full, the rest (before-tax, match, NEC and all their growth) minus {pct}', { pct })
              + (d.current && now !== null ? `\n${t('Now ({date}): {now} of {value}, Roth {share}%', { date: d.current.date, now: usd(now), value: usd(d.current.valueAt), share: Math.round((d.current.rothShare ?? 0) * 100) })}` : '')
              + `\n\n${bracketHint(fed, today)}`,
          };
        }),
      ]} />
      <H>{lastMonth ? t('Balances by source, month ending {month}', { month: lastMonth }) : t('Balances by source')}</H>
      <div className="flex flex-wrap gap-2">{sources.filter((p) => p.to === lastMonth).map((p) => <Card key={p.key} label={p.key ?? ''} value={usd(p.end)} />)}</div>
    </div>
  );
}

import type { Dataset } from '../../../../shared/dataset';
import type { Derived } from '../../../app/derive';
import { pct, usd } from '../format';
import { Card, Cards, H } from './Cards';
import { t } from '../../../app/i18n';

export function InsightsScreen({ d, ds }: { d: Derived; ds: Dataset }) {
  return (
    <div className="flex flex-col gap-3">
      <H>{t('Buy the dip: contributions made while the account was in a drawdown')}</H>
      <Cards>{d.dips.map((b) => <Card key={b.threshold} label={t('deeper than {p}', { p: pct(b.threshold, 0) })} value={`${pct(b.share, 1)} · ${b.count}`} hint={usd(b.amount)} />)}</Cards>
      <H>{t('Rebalances ({n})', { n: ds.rebalances.length })}</H>
      <div className="flex flex-col gap-1 text-sm">
        {ds.rebalances.map((r) => (
          <div key={r.date} className="rounded bg-slate-100 px-2 py-1 dark:bg-slate-700">
            <b>{r.date}</b> · {t('out:')} {r.out.map((o) => `${o.fund.split(' - ')[0]} ${usd(o.amount)}`).join(', ') || '—'} · {t('in:')} {r.in.map((i) => `${i.fund.split(' - ')[0]} ${usd(i.amount)}`).join(', ') || '—'}
          </div>
        ))}
      </div>
    </div>
  );
}

import type { Dataset } from '../../../../shared/dataset';
import { pts, usd } from '../format';
import { Table } from '../Table';
import { t } from '../../../app/i18n';
import { H } from './Cards';

export function StatementsScreen({ ds }: { ds: Dataset }) {
  const quarters = ds.periods.filter((p) => p.scope === 'account' && p.from.slice(0, 7) !== p.to.slice(0, 7));
  const docs = ds.documents;
  return (
    <div className="flex flex-col gap-3">
      <H>{t('Saved documents ({n}): statement PDFs and Quicken files in the userscript raw store and the 📦 Raw zip', { n: docs.length })}</H>
      <div className="flex flex-wrap gap-2 text-xs">{docs.map((x) => <span key={x.key} className="rounded bg-slate-100 px-2 py-1 dark:bg-slate-700">{x.key}</span>)}</div>
      <H>{t('12-month windows (site Personal RoR)')}</H>
      <Table name="windows" rows={quarters} columns={[
        { key: 'f', label: t('From'), text: (p) => p.from },
        { key: 't', label: t('To'), text: (p) => p.to },
        { key: 'b', label: t('Begin'), text: (p) => usd(p.begin), sort: (p) => p.begin, align: 'right' },
        { key: 'c', label: t('Contributions'), text: (p) => usd(p.contributions), sort: (p) => p.contributions, align: 'right' },
        { key: 'd', label: t('Dividends'), text: (p) => usd(p.dividends), sort: (p) => p.dividends, align: 'right' },
        { key: 'm', label: t('Market value change'), text: (p) => usd(p.mvc), sort: (p) => p.mvc, align: 'right' },
        { key: 'e', label: t('End'), text: (p) => usd(p.end), sort: (p) => p.end, align: 'right' },
        { key: 'r', label: 'RoR', text: (p) => pts(p.personalRoR ?? null), sort: (p) => p.personalRoR ?? 0, align: 'right' },
      ]} />
    </div>
  );
}

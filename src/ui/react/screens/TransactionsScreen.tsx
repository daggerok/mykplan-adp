import type { Transaction } from '../../../../shared/model';
import { usd } from '../format';
import { Table } from '../Table';
import { t } from '../../../app/i18n';

export function TransactionsScreen({ tx }: { tx: Transaction[] }) {
  return (
    <Table name="transactions" rows={tx} initialSort={{ key: 'date', desc: true }} columns={[
      { key: 'date', label: t('Activity date'), text: (x) => x.activityDate },
      { key: 'pay', label: t('Pay check'), text: (x) => x.payCheckDate ?? '' },
      { key: 'type', label: t('Type'), text: (x) => x.rawType },
      { key: 'src', label: t('Source'), text: (x) => x.source ?? '' },
      { key: 'fund', label: t('Fund'), text: (x) => x.fund },
      { key: 'units', label: t('Units'), text: (x) => (x.units === undefined ? '' : x.units.toFixed(4)), sort: (x) => x.units ?? 0, align: 'right' },
      { key: 'price', label: t('Price'), text: (x) => (x.price === undefined ? '' : x.price.toFixed(4)), sort: (x) => x.price ?? 0, align: 'right' },
      { key: 'amount', label: t('Amount'), text: (x) => usd(x.amount), sort: (x) => x.amount, align: 'right' },
    ]} />
  );
}

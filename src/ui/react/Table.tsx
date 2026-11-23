import { useMemo, useState } from 'react';
import { rowMatches, toCsv } from './filter';
import { t } from '../../app/i18n';

// hint: the header's tooltip
export interface Column<T> { key: string; label: string; text: (r: T) => string; sort?: (r: T) => number | string; align?: 'right'; hint?: string }

function save(name: string, data: string, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function Table<T>({ rows, columns, name, initialSort }: { rows: T[]; columns: Array<Column<T>>; name: string; initialSort?: { key: string; desc: boolean } }) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState(initialSort ?? { key: columns[0]!.key, desc: true });
  const view = useMemo(() => {
    const col = columns.find((c) => c.key === sort.key) ?? columns[0]!;
    const by = col.sort ?? col.text;
    const filtered = rows.filter((r) => rowMatches(columns.map((c) => c.text(r)), query));
    return filtered.sort((a, b) => { const x = by(a); const y = by(b); return (x < y ? -1 : x > y ? 1 : 0) * (sort.desc ? -1 : 1); });
  }, [rows, columns, query, sort]);
  const head = columns.map((c) => c.label);
  const cells = () => view.map((r) => columns.map((c) => c.text(r)));
  return (
    <div className="flex min-h-0 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('Filter: words AND, a,b OR, !x NOT, =exact, ^starts')} className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900" />
        <span className="text-xs text-slate-500">{t('{n} of {m}', { n: view.length, m: rows.length })}</span>
        <button type="button" className="rounded-lg bg-slate-200 px-3 py-1.5 text-xs dark:bg-slate-700" onClick={() => save(`${name}.csv`, toCsv(head, cells()), 'text/csv')}>CSV</button>
        <button type="button" className="rounded-lg bg-slate-200 px-3 py-1.5 text-xs dark:bg-slate-700" onClick={() => save(`${name}.json`, JSON.stringify(view, null, 1), 'application/json')}>JSON</button>
      </div>
      <div className="max-h-[65vh] overflow-auto rounded-lg border border-slate-200 dark:border-slate-700">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800">
            <tr>
              <th className="px-2 py-1.5 text-right text-xs font-normal text-slate-400">#</th>
              {columns.map((c) => (
                <th key={c.key} title={c.hint} className={`cursor-pointer select-none whitespace-nowrap px-2 py-1.5 font-medium ${c.align === 'right' ? 'text-right' : 'text-left'}`} onClick={() => setSort((s) => ({ key: c.key, desc: s.key === c.key ? !s.desc : true }))}>
                  {c.label}{sort.key === c.key ? (sort.desc ? ' ▾' : ' ▴') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {view.map((r, i) => (
              <tr key={i} className="border-t border-slate-100 dark:border-slate-700/60">
                <td className="px-2 py-1 text-right text-xs text-slate-400">{i + 1}</td>
                {columns.map((c) => <td key={c.key} className={`whitespace-nowrap px-2 py-1 ${c.align === 'right' ? 'text-right tabular-nums' : ''}`}>{c.text(r)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

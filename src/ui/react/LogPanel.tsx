import type { Dataset } from '../../../shared/dataset';
import { sheets } from '../../app/google';
import { H } from './screens/Cards';
import { useStore } from './useStore';
import { t } from '../../app/i18n';
import { withParts } from './GetStarted';

// What the data holds and whether anything looked wrong while reading the mykplan pages, in plain words
const box = 'max-h-[30vh] overflow-auto whitespace-pre-wrap rounded bg-slate-100 p-2 text-xs dark:bg-slate-900';
const hint = 'text-xs text-slate-500 dark:text-slate-400';

export function LogPanel({ ds, error }: { ds: Dataset | null; error: string | null }) {
  const g = useStore(sheets);
  return (
    <div className="flex flex-col gap-2 text-sm">
      {error && <p className="text-red-600">{t('Could not load the data: {error}', { error })}</p>}
      {!ds && !error && <p className="text-slate-500">{t('Nothing collected yet. The log fills after the first 🔄 Full on mykplan.')}</p>}
      <H>Google Sheets</H>
      <p className={hint}>{g.connected ? t('Connected: each new data set is written to the mykplan_* tabs by itself.') : t('Not connected: ☁️ at the top right, once per browser session.')}{g.error ? ` ${t('Last error: {error}', { error: g.error })}` : ''}</p>
      {g.log.length > 0 && <pre className={box}>{g.log.join('\n')}</pre>}
      {ds && (
        <>
          <H>{t('What is collected')}</H>
          <p>
            {withParts(t('Prices up to {day}, last update {built} (UTC).'), { day: <b>{ds.asOf ?? '—'}</b>, built: ds.builtAt.slice(0, 16).replace('T', ' ') })}{' '}
            {t('{tx} transactions, {periods} monthly and yearly summaries, {days} fund-days for the charts, {changes} account changes ({details} with details), {docs} statements and Quicken files.', {
              tx: ds.transactions.length, periods: ds.periods.length, days: ds.dailyFunds.length,
              changes: ds.journal.length, details: ds.journalDetails.length, docs: ds.documents.length,
            })}
          </p>
          {!ds.dailyFunds.length && <p className={hint}>{t('Zeros here mean the run on mykplan is not finished yet: the data is rebuilt every 50 steps and at the end.')}</p>}

          <H>{t('Quicken against the site: {n} days differ', { n: ds.qfxDiffs?.length ?? 0 })}</H>
          <p className={hint}>{t('Both come from mykplan. A day listed here has a different sum of contributions and dividends in the Quicken file than on the Transaction History page. The page is what the charts use.')}</p>
          <pre className={box}>{(ds.qfxDiffs ?? []).map((x) => t('{date} {fund}: Quicken {qfx}, site {site}', { date: x.date, fund: x.fund, qfx: (x.qfx / 100).toFixed(2), site: (x.site / 100).toFixed(2) })).join('\n') || t('none')}</pre>

          <H>{t('Your funds and their tickers: {n}', { n: ds.securities?.length ?? 0 })}</H>
          <p className={hint}>{t('From the Quicken files. A fund without a ticker shows its CUSIP.')}</p>
          <p className="text-xs">{(ds.securities ?? []).map((x) => `${x.name} (${x.ticker ?? x.cusip})`).join(' · ') || t('none yet')}</p>

          <H>{t('Lines the script could not read: {n}', { n: ds.warnings.length })}</H>
          <p className={hint}>{t('Usually none. If mykplan changes its pages, they show up here: then press 📦 Raw on mykplan and tell Claude.')}</p>
          <pre className={box}>{ds.warnings.join('\n') || t('none')}</pre>
        </>
      )}
    </div>
  );
}

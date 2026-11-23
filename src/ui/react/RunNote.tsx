import { useEffect, useState } from 'react';
import type { Dataset } from '../../../shared/dataset';
import { runIsLive, type RunState } from '../../app/data';
import { lang, t } from '../../app/i18n';
import { withParts } from './GetStarted';

// What the main area says while there are no charts yet, from the run state the userscript publishes:
// a live run with its counter, or where the last run stopped and what to press, or nothing has run yet
const MYKPLAN = 'https://mykplan.adp.com/ParticipantSecure_Net/AccountHighlights.aspx';
const link = 'font-medium text-blue-600 underline underline-offset-2 dark:text-blue-400';
// dates in the language of the page, not of the browser (an English system showed English months in Russian text)
const when = (ms: number) => new Date(ms).toLocaleString(lang.get() === 'ru' ? 'ru-RU' : 'en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

export function RunNote({ run, ds, onOpenSettings, settingsOpen }: { run: RunState | null; ds: Dataset | null; onOpenSettings: () => void; settingsOpen: boolean }) {
  // re-render every 20 s so a run that stopped updating turns from "going" into "stopped"
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 20000); return () => clearInterval(t); }, []);

  const box = (title: string, children: React.ReactNode) => (
    <div className="mx-auto flex max-w-2xl flex-col gap-2 py-10 text-sm" data-run-note>
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </div>
  );
  const continueHint = <p className="text-slate-600 dark:text-slate-300">{withParts(t('{open}, log in and press {full}: it continues where it stopped, nothing is downloaded twice.'), {
    open: <a className={link} href={MYKPLAN} target="_blank" rel="noreferrer">{t('Open mykplan')}</a>,
    full: <b>🔄 Full</b>,
  })}</p>;

  if (runIsLive(run)) {
    const r = run!;
    const pct = r.total ? Math.round((r.done / r.total) * 100) : 0;
    return box(t('Collecting data: {done} of {total}', { done: r.done, total: r.total }), <>
      <div className="h-2 w-full overflow-hidden rounded bg-slate-200 dark:bg-slate-700"><div className="h-full bg-blue-600" style={{ width: `${pct}%` }} /></div>
      <p className="text-slate-600 dark:text-slate-300">{t('{mode} is running on mykplan', { mode: r.mode === 'full' ? '🔄 Full' : '⬇ Sync' })}{r.current ? `: ${r.current}` : ''}. {t('Keep that tab open. Charts appear at the end (the daily prices come last); this page updates by itself.')}</p>
    </>);
  }
  if (run && run.status !== 'done') {
    const why = run.status === 'paused' ? t('the mykplan session ended') : run.status === 'stopped' ? t('it was stopped') : run.status === 'failed' ? t('an error: {message}', { message: run.message ?? t('unknown') }) : t('the mykplan tab was closed or reloaded');
    return box(t('Not finished yet'), <>
      <p className="text-slate-600 dark:text-slate-300">{withParts(t('The last {mode} stopped at {progress} on {when}: {why}.'), {
        mode: run.mode === 'full' ? '🔄 Full' : '⬇ Sync',
        progress: <b>{t('{done} of {total}', { done: run.done, total: run.total })}</b>,
        when: when(run.at),
        why,
      })}</p>
      {continueHint}
    </>);
  }
  if (run && run.status === 'done') {
    return box(t('The run finished, but no daily prices came'), <>
      <p className="text-slate-600 dark:text-slate-300">{t('Finished on {when}', { when: when(run.at) })}{run.message ? ` (${run.message})` : ''}. {t('Open 🐞 Log at the top right for what failed, then press 🔄 Full on mykplan again: only the missing parts are asked.')}</p>
    </>);
  }
  if (ds) {
    return box(t('Only part of the data is here'), <>
      <p className="text-slate-600 dark:text-slate-300">{t('Collected on {when}: {tx} transactions, {changes} account changes. The charts need the rest.', { when: when(Date.parse(ds.builtAt)), tx: ds.transactions.length, changes: ds.journal.length })}</p>
      {continueHint}
    </>);
  }
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-sm text-slate-500" data-empty-note>
      <p>{withParts(t('No data yet: {start}, demo data and Import JSON are in ⚙️ Settings.'), { start: <b>{t('Get started')}</b> })}</p>
      {!settingsOpen && <button type="button" className="rounded-lg bg-blue-600 px-3 py-1.5 text-white hover:bg-blue-500" onClick={onOpenSettings}>{t('Open settings')}</button>}
    </div>
  );
}

import { useRef, useState } from 'react';
import { loadConfig, mask, maskSpreadsheetUrl, parseSpreadsheetId, saveConfig, spreadsheetUrl } from '../../../shared/sheets/gis';
import { MaskedField, RevealCopy } from './MaskedField';
import { DEFAULT_BENCHMARKS } from '../../../shared/benchmarks/config';
import type { Dataset } from '../../../shared/dataset';
import { importFile, runState, settings, showDemo, type Settings, type Source } from '../../app/data';
import { useStore } from './useStore';
import type { Derived } from '../../app/derive';
import { connectGoogle, disconnectGoogle, handOff, sheets, writeNow } from '../../app/google';
import { GetStarted, KeepUpdated, withParts } from './GetStarted';
import { t } from '../../app/i18n';
import { H } from './screens/Cards';
import { APP_VERSION, isOlder } from '../../app/version';

const field = 'min-w-0 flex-1 rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900';
const button = 'rounded-lg bg-slate-200 px-3 py-1.5 text-sm dark:bg-slate-700';
const primary = 'rounded-lg bg-blue-600 px-3 py-1.5 text-sm text-white disabled:opacity-50';

export function SettingsPanel({ ds, d, source, userscript, s }: { ds: Dataset | null; d: Derived | null; source: Source | null; userscript: string | null; s: Settings }) {
  const file = useRef<HTMLInputElement>(null);
  const [cfg, setCfg] = useState(loadConfig);
  const [showUrl, setShowUrl] = useState(false);
  // saved on every change, like twitter: a pasted link is stored as its id, the field keeps what was typed
  const change = (p: Partial<typeof cfg>) => {
    const next = { ...cfg, ...p };
    setCfg(next);
    saveConfig(next);
    handOff();
  };
  const sheetId = parseSpreadsheetId(cfg.spreadsheetId);
  const sheetUrl = sheetId ? spreadsheetUrl(sheetId) : '';
  const run = useStore(runState);
  // every step is done once real data with the daily series is in
  const stepsDone = !!ds && source !== 'demo' && ds.dailyFunds.length > 0;
  const set = (p: Partial<Settings>) => settings.set({ ...settings.get(), ...p });

  const g = useStore(sheets);
  const sourceName: Record<Source, string> = { userscript: t('userscript'), import: t('import'), cache: t('cache'), demo: t('demo') };

  return (
    <div className="grid gap-6 xl:grid-cols-2">
    <div className="flex min-w-0 flex-col gap-3 text-sm">
      <H>{t('Data')}</H>
      <p>{withParts(t('Source: {source}'), { source: <b>{source ? sourceName[source] : t('none yet')}</b> })}{ds ? ` · ${t('as of {day}', { day: ds.asOf ?? '—' })} · ${t('built {at}', { at: ds.builtAt.slice(0, 16).replace('T', ' ') })}` : ''}</p>
      <div className="flex flex-wrap items-center gap-2">
        <span>{t('Userscript')}: {userscript ? <b>{t('{version} installed', { version: userscript })}</b> : t('not seen on this page')}</span>
        {/* always here: the steps column hides its Install button once everything is done */}
        <a className={`${button} ${isOlder(userscript, APP_VERSION) || !userscript ? 'bg-blue-600 text-white dark:bg-blue-600' : ''}`} href="./mykplan-adp-sync.user.js" data-install-script>
          {!userscript ? t('Install script') : isOlder(userscript, APP_VERSION) ? t('Update to {version}', { version: APP_VERSION }) : t('Reinstall script')}
        </a>
        {isOlder(userscript, APP_VERSION) && <span className="text-xs text-slate-500">{t('Tampermonkey shows Install: press it, then reload this page and the mykplan tab')}</span>}
      </div>
      <div className="flex gap-2">
        <button type="button" className={button} onClick={() => file.current?.click()}>{t('Import JSON')}</button>
        <button type="button" className={button} onClick={() => void showDemo()} disabled={!!ds && source !== 'demo' && ds.dailyFunds.length > 0}>{t('Show demo data')}</button>
        <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void importFile(f); }} />
      </div>

      <H>{t('Forecast defaults')}</H>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">{t('Birth date (empty = from the site: {date})', { date: ds?.profile?.birthDate ?? '—' })}
          <input type="date" className={field} value={s.birthDate ?? ''} onChange={(e) => set({ birthDate: e.target.value || null })} />
        </label>
        <label className="flex flex-col gap-1">{t('Retire at')}
          <input type="number" className={field} value={s.retireAge} onChange={(e) => set({ retireAge: Number(e.target.value) || 67 })} />
        </label>
        <label className="flex flex-col gap-1">{t('Inflation, %')}
          <input type="number" step="0.1" className={field} value={s.inflation * 100} onChange={(e) => set({ inflation: Number(e.target.value) / 100 })} />
        </label>
        <label className="flex items-center gap-1"><input type="checkbox" checked={s.real} onChange={(e) => set({ real: e.target.checked })} /> {t("real (today's dollars)")}</label>
      </div>

      <H>{t('Benchmarks shown on the chart')}</H>
      <div className="flex flex-wrap gap-2">
        {DEFAULT_BENCHMARKS.map((b) => (
          <label key={b} className="flex items-center gap-1"><input type="checkbox" checked={s.benchmarks.includes(b)} onChange={(e) => set({ benchmarks: e.target.checked ? [...s.benchmarks, b] : s.benchmarks.filter((x) => x !== b) })} />{b}</label>
        ))}
      </div>

      <H>{t('Google Sheets (the same OAuth client and spreadsheet as youtube and twitter, tabs mykplan_*)')}</H>
      {/* like twitter: the connection with the spreadsheet link on top, the two values below; every change is saved at once */}
      <div className={`rounded-xl border p-3 ${g.connected ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900/20' : 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/40'}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="font-medium">{g.connected ? t('Connected to Google Sheets') : t('Not connected to Google Sheets')}</div>
            {sheetUrl && (
              <div className="mt-1 flex items-center gap-2">
                <a className="break-all text-xs text-emerald-700 underline dark:text-emerald-400" href={sheetUrl} target="_blank" rel="noreferrer">{showUrl ? sheetUrl : maskSpreadsheetUrl(sheetUrl)}</a>
                <RevealCopy label={t('spreadsheet link')} value={sheetUrl} shown={showUrl} onToggle={() => setShowUrl((v) => !v)} />
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {g.connected
              ? <button type="button" className={button} disabled={g.busy} onClick={disconnectGoogle}>{t('Disconnect')}</button>
              : <button type="button" className={primary} disabled={g.busy || !cfg.clientId} onClick={() => void connectGoogle()}>{t('Connect Google')}</button>}
            <button type="button" className={button} disabled={!ds || !g.connected || g.busy} onClick={() => ds && void writeNow(ds)}>{t('Write all tabs now')}</button>
          </div>
        </div>
      </div>
      <MaskedField label="Google OAuth Client ID" value={cfg.clientId} mask={mask} placeholder="1234567890-abc.apps.googleusercontent.com"
        onChange={(v) => change({ clientId: v.trim() })} hint={t('Public, no secret. Stored in this browser only.')} />
      <MaskedField label={t('Spreadsheet ID or full URL')} value={cfg.spreadsheetId} mask={(v) => (v.includes('/d/') ? maskSpreadsheetUrl(v) : mask(v))}
        placeholder="https://docs.google.com/spreadsheets/d/1abc…/edit" onChange={(v) => change({ spreadsheetId: v.trim() })} hint={t('The same spreadsheet as youtube and twitter can hold the mykplan_* tabs.')} />
      <p className="text-xs text-slate-500">{g.connected ? t('Connected: the mykplan_* tabs fill by themselves (the mykplan tab writes during runs, this page writes what it receives).') : t('Not connected: the page connects by itself when it opens or on the first click (decline in Google to skip); ☁️ connects by hand. Then the mykplan_* tabs fill by themselves, also during runs.')}{g.error ? ` ${t('Last error: {error}', { error: g.error })}` : ''}</p>
      {g.oldTabs.length > 0 && <p className="text-xs text-amber-600 dark:text-amber-400">{t('Old tabs in the spreadsheet, safe to delete by hand (their data is in the mykplan_* tabs now): {tabs}', { tabs: g.oldTabs.join(', ') })}</p>}
      <pre className="whitespace-pre-wrap text-xs text-slate-500">{g.log.slice(-8).join('\n')}</pre>
    </div>
    {/* the first steps (or how to keep the data fresh) live here only: right of the settings on wide screens (from 1280 px), under them on narrow ones */}
    {/* narrow screens: steps not done yet go first, done ones (keep up to date) go under the settings */}
    <aside className={`min-w-0 border-slate-200 xl:order-none xl:border-l xl:border-t-0 xl:pl-6 xl:pt-0 dark:border-slate-700 ${stepsDone ? 'border-t pt-6' : 'order-first border-b pb-6 xl:pb-0 xl:border-b-0'}`} data-steps-done={stepsDone ? 'yes' : 'no'}>
      {stepsDone && ds ? <KeepUpdated asOf={ds.asOf} userscript={userscript} /> : <GetStarted compact userscript={userscript} hasData={!!ds && source !== 'demo' && ds.dailyFunds.length > 0} runStarted={!!run} />}
    </aside>
    </div>
  );
}

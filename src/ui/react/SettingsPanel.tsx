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

const field = 'inp';
const button = 'btn sm';
const primary = 'btn sm primary';
const TAMPERMONKEY_URL = 'https://www.tampermonkey.net/';
const CODE_ORIGIN = <code className="bg-emerald-100 px-1 dark:bg-emerald-800">{typeof location === 'undefined' ? '' : location.origin}</code>;
const CODE_LOCAL = <code className="bg-emerald-100 px-1 dark:bg-emerald-800">http://localhost:1234</code>;

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
        <a className={isOlder(userscript, APP_VERSION) || !userscript ? primary : button} href="./mykplan-adp-sync.user.js" data-install-script>
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

      <H>{t('Chart colors')}</H>
      {/* each color overrides the theme's in both light and dark; the bars are drawn half see-through */}
      <div className="flex flex-wrap items-center gap-3" data-chart-colors>
        {([['up', t('Rising candles'), '#16a34a'], ['down', t('Falling candles'), '#dc2626'], ['line', t('Your line'), '#2563eb'], ['bars', t('Contribution bars'), '#10b981']] as const).map(([k, label, fallback]) => (
          <label key={k} className="flex items-center gap-1.5">
            <input type="color" className="h-7 w-9 cursor-pointer rounded border border-slate-300 bg-transparent p-0.5 dark:border-slate-600" value={s.chartColors?.[k] ?? fallback}
              onChange={(e) => set({ chartColors: { ...(s.chartColors ?? {}), [k]: e.target.value } })} />
            {label}
          </label>
        ))}
        <button type="button" className={button} disabled={!Object.keys(s.chartColors ?? {}).length} onClick={() => set({ chartColors: {} })}>{t('Theme colors')}</button>
      </div>

      <H>{t('Benchmarks shown on the chart')}</H>
      <div className="flex flex-wrap gap-2">
        {DEFAULT_BENCHMARKS.map((b) => (
          <label key={b} className="flex items-center gap-1"><input type="checkbox" checked={s.benchmarks.includes(b)} onChange={(e) => set({ benchmarks: e.target.checked ? [...s.benchmarks, b] : s.benchmarks.filter((x) => x !== b) })} />{b}</label>
        ))}
      </div>

      <H>{t('Google Sheets (the same OAuth client and spreadsheet as youtube and twitter, tabs mykplan_*)')}</H>
      {/* the same setup block as twitter (src/main.tsx Settings) and youtube: what this is, the steps once, then the connection */}
      <div className="space-y-1 text-xs text-slate-500 dark:text-slate-400">
        <div>{withParts(t('{what} mykplan shows your 401k only in your own logged-in browser. {tm} is a Chrome extension that runs small programs ({userscripts}, one .user.js file each) on the sites you allow it. Our file mykplan-adp-sync.user.js reads your mykplan pages (read only); the same file, running on this page, hands the data to this viewer and writes it to your Google Sheet. Tampermonkey must therefore be allowed on mykplan.adp.com, online.adp.com and {host}.'), {
          what: <strong className="text-slate-700 dark:text-slate-200">{t('What this is:')}</strong>, tm: <b>Tampermonkey</b>, userscripts: <b>userscripts</b>, host: <b>{location.hostname}</b>,
        })}</div>
        <div>{withParts(t('{title} this browser and your Google Sheet. Connect Google on another computer and ↻ loads the same data from the sheet.'), { title: <strong className="text-emerald-600 dark:text-emerald-400">{t('Auto-load + cross-device:')}</strong> })}</div>
        <div>{withParts(t('{title} the data goes into the mykplan_* tabs of one spreadsheet; the YT-… tabs of youtube and the X-… tabs of twitter can live in the same file.'), { title: <strong className="text-blue-500">{t('Tabs:')}</strong> })}</div>
      </div>
      <details className="setup rounded-xl border border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900/20" data-setup>
        <summary className="px-4 py-3 text-sm font-semibold text-emerald-900 dark:text-emerald-200"><span className="chev">▸</span> {t('Google Sheets and Tampermonkey setup (once)')}</summary>
        <ol className="mb-4 ml-8 mr-4 list-decimal space-y-1 text-xs text-emerald-900 dark:text-emerald-200">
          <li>{withParts(t('Go to {console}, enable the {api}, OAuth consent screen (External, your email under Test users), create an OAuth 2.0 Client ID of type Web application with the authorized JavaScript origins {origin} and {local}. No secret is used'), {
            console: <a className="underline text-emerald-600 dark:text-emerald-400" href="https://console.cloud.google.com/" target="_blank" rel="noreferrer">console.cloud.google.com</a>,
            api: <b>Google Sheets API</b>,
            origin: CODE_ORIGIN,
            local: CODE_LOCAL,
          })}</li>
          <li>{withParts(t('Paste the Client ID below, press {connect}, then paste the url of your spreadsheet (the one youtube and twitter use is fine)'), { connect: <b>{t('Connect Google')}</b> })}</li>
          <li>{withParts(t('Install {tm}; in Chrome 138+ open its extension details, turn on {allow} and give it site access to {mykplan}, {adp} and {host}'), {
            tm: <a className="underline" href={TAMPERMONKEY_URL} target="_blank" rel="noreferrer">Tampermonkey</a>,
            allow: <b>Allow User Scripts</b>, mykplan: <b>mykplan.adp.com</b>, adp: <b>online.adp.com</b>, host: <b>{location.hostname}</b>,
          })}</li>
          <li>{withParts(t('Open {script}: Tampermonkey shows its install page, press Install. Reload this page: the first dot in the toolbar turns green'), {
            script: <a className="font-medium underline" href="./mykplan-adp-sync.user.js">mykplan-adp-sync.user.js</a>,
          })}</li>
          <li>{t('Press ⬇ in the toolbar: mykplan opens (log in there first), the corner panel collects; come back here and the data is in the viewer and in the mykplan_* tabs')}</li>
        </ol>
        <div className="px-4 pb-3 text-xs text-amber-700 dark:text-amber-300">{t('Security: only the public Client ID and the spreadsheet id are stored in this browser, the Google token lives in memory. Your 401k data goes from your browser to your Google Sheet and nowhere else.')}</div>
      </details>
      {/* like twitter: the connection with the spreadsheet link on top, the two values below; every change is saved at once */}
      <div className={`rounded-xl border p-3 ${g.connected ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900/20' : 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/40'}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="font-medium">{g.connected ? t('Connected to Google Sheets') : t('Not connected to Google Sheets')}</div>
            {sheetUrl && (
              <div className="mt-1 flex items-center gap-2">
                <a className="masked break-all text-xs underline" href={sheetUrl} target="_blank" rel="noreferrer">{showUrl ? sheetUrl : maskSpreadsheetUrl(sheetUrl)}</a>
                <RevealCopy label={t('spreadsheet link')} value={sheetUrl} shown={showUrl} onToggle={() => setShowUrl((v) => !v)} />
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {g.connected
              ? <button type="button" className="btn sm danger" disabled={g.busy} onClick={disconnectGoogle}>{t('Disconnect')}</button>
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

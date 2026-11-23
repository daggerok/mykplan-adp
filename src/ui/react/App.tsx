/// <reference lib="esnext" />
import { useEffect, useMemo, useState } from 'react';
import { themeIcon, themeTitle } from '../../../shared/theme';
import { askRun, askStop, clearDemo, dataset, runIsLive, runState, settings } from '../../app/data';
import { derive } from '../../app/derive';
import { connectGoogle, disconnectGoogle, loadFromSheets, sheets } from '../../app/google';
import { toCsv } from './filter';
import { loadConfig } from '../../../shared/sheets/gis';
import { USERSCRIPT_MARK, userscriptVersion, type Status } from '../../app/status';
import { LogPanel } from './LogPanel';
import { RunNote } from './RunNote';
import { APP_VERSION, isOlder } from '../../app/version';
import { SettingsPanel } from './SettingsPanel';
import { SlidePanel } from './SlidePanel';
import { BuilderScreen } from './screens/BuilderScreen';
import { ChartScreen } from './screens/ChartScreen';
import { ContributionsScreen } from './screens/ContributionsScreen';
import { ForecastScreen } from './screens/ForecastScreen';
import { InsightsScreen } from './screens/InsightsScreen';
import { ReturnsScreen } from './screens/ReturnsScreen';
import { StatementsScreen } from './screens/StatementsScreen';
import { TransactionsScreen } from './screens/TransactionsScreen';
import { useStore } from './useStore';
import { help } from './help';
import { LANG_FLAGS, lang, setLang, t } from '../../app/i18n';
import { useTheme } from './useTheme';

export const SCREENS = ['Chart', 'Builder', 'Returns', 'Transactions', 'Statements', 'Contributions', 'Insights', 'Forecast'] as const;
export type Screen = (typeof SCREENS)[number];

// the open screen lives in the address (#Contributions): a reload or a bookmark opens it again
export const screenOfHash = (hash: string): Screen => {
  const name = decodeURIComponent(hash.replace(/^#/, ''));
  return (SCREENS as readonly string[]).indexOf(name) >= 0 ? (name as Screen) : 'Chart';
};

// tab names and their tooltips; the address keeps the English name (#Contributions)
const screenName = (s: Screen): string => ({
  Chart: t('Chart'), Builder: t('Builder'), Returns: t('Returns'), Transactions: t('Transactions'),
  Statements: t('Statements'), Contributions: t('Contributions'), Insights: t('Insights'), Forecast: t('Forecast'),
})[s];
const screenTitle = (s: Screen): string => ({
  Chart: t('Your return, value in dollars, your fund picks against an index'),
  Builder: t('Several series and panes on one time axis, saved layouts'),
  Returns: t('TWR against the site Personal RoR, XIRR, drawdown'),
  Transactions: t('Every transaction with filters and export'),
  Statements: t('Quarterly statements and 12-month summaries'),
  Contributions: t('Paychecks by source, P&L, value before and after tax'),
  Insights: t('Buy the dip and rebalances'),
  Forecast: t('Retirement projection, Monte Carlo, goals'),
})[s];

const Dot = ({ status, label }: { status: Status; label: string }) => (
  <span className={`size-2 rounded-full ${status === 'ok' ? 'bg-green-500' : status === 'pending' ? 'bg-amber-400' : 'bg-slate-400 dark:bg-slate-600'}`} data-status={status} title={label} />
);

// open or closed panels are remembered per browser (twitter: `${PREFIX}-panel-setup`)
const PANEL_KEY = (name: string) => `mykplan-adp-panel-${name}`;
function panelState(name: string): boolean | null {
  try { const v = localStorage.getItem(PANEL_KEY(name)); return v === null ? null : v === 'open'; } catch { return null; }
}
function savePanel(name: string, open: boolean): void {
  try { localStorage.setItem(PANEL_KEY(name), open ? 'open' : 'closed'); } catch { /* private window */ }
}

function save(name: string, data: string, type: string): void {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function App() {
  const theme = useTheme();
  const language = useStore(lang);
  useEffect(() => { document.documentElement.lang = language; }, [language]);
  const [screen, setScreenState] = useState<Screen>(() => screenOfHash(location.hash));
  const setScreen = (next: Screen) => {
    setScreenState(next);
    history.replaceState(null, '', `${location.pathname}${location.search}#${next}`);
  };
  useEffect(() => {
    const onHash = () => setScreenState(screenOfHash(location.hash));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  // settings open by themselves until there is data (twitter opens them until a client id is set)
  const [showSettings, setShowSettings] = useState(() => panelState('setup') ?? !dataset.get().ds);
  const [showLog, setShowLog] = useState(() => panelState('log') ?? false);
  const toggleSettings = () => setShowSettings((v) => { savePanel('setup', !v); return !v; });
  const toggleLog = () => setShowLog((v) => { savePanel('log', !v); return !v; });
  const [showHelp, setShowHelp] = useState(() => panelState('help') ?? false);
  const toggleHelp = () => setShowHelp((v) => { savePanel('help', !v); return !v; });
  const [userscript, setUserscript] = useState<string | null>(() => userscriptVersion(document.documentElement));

  // the userscript may mark the page after React has mounted
  useEffect(() => {
    const root = document.documentElement;
    const obs = new MutationObserver(() => setUserscript(userscriptVersion(root)));
    obs.observe(root, { attributes: true, attributeFilter: [`data-${USERSCRIPT_MARK.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`] });
    return () => obs.disconnect();
  }, []);

  const { ds, source, error } = useStore(dataset);
  const s = useStore(settings);
  const run = useStore(runState);
  // re-render every 20 s: a run whose tab was closed stops counting as live, and ⏹ turns back into ⬇ 🔄 (review 2026-11-22)
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 20000); return () => clearInterval(t); }, []);
  const g = useStore(sheets);
  const d = useMemo(() => (ds && ds.dailyFunds.length ? derive(ds, { birthDate: s.birthDate, retireAge: s.retireAge }) : null), [ds, s.birthDate, s.retireAge]);
  const icon = themeIcon(theme.mode, theme.systemDark);
  // no charts yet: the main area tells the truth about the run (going, stopped where, or nothing yet)
  const body = !d ? (
    <RunNote run={run} ds={ds && source !== 'demo' ? ds : null} onOpenSettings={toggleSettings} settingsOpen={showSettings} />
  ) : screen === 'Chart' ? <ChartScreen d={d!} ds={ds!} benchmarks={s.benchmarks} dark={theme.dark} />
    : screen === 'Builder' ? <BuilderScreen d={d!} ds={ds!} benchmarks={s.benchmarks} dark={theme.dark} />
    : screen === 'Returns' ? <ReturnsScreen d={d!} />
    : screen === 'Transactions' ? <TransactionsScreen tx={ds!.transactions} />
    : screen === 'Statements' ? <StatementsScreen ds={ds!} />
    : screen === 'Contributions' ? <ContributionsScreen d={d!} ds={ds!} />
    : screen === 'Insights' ? <InsightsScreen d={d!} ds={ds!} />
    : <ForecastScreen d={d!} s={s} siteBirth={ds!.profile?.birthDate ?? null} />;
  const year = new Date().getFullYear();

  return (
    <div className="flex h-dvh flex-col font-sans">
      <div className="flex min-h-0 flex-1 flex-col gap-4 px-4 pt-4 lg:gap-6 lg:px-6 lg:pt-6">
      <div className="flex shrink-0 flex-col">
      <header className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 dark:border-slate-700 dark:bg-slate-800">
        <h1 className="text-base font-semibold">mykplan-adp</h1>
        {/* the screens appear only when there is something to show on them (data with the daily prices) */}
        {/* below 1280 px the tabs take their own row under the buttons, so none is cut off */}
        {d ? <nav className="order-last flex basis-full gap-1 overflow-x-auto [scrollbar-width:none] xl:order-none xl:basis-auto xl:flex-1 [&::-webkit-scrollbar]:hidden" aria-label="Screens">
          {SCREENS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setScreen(s)}
              title={screenTitle(s)}
              aria-current={s === screen ? 'page' : undefined}
              className={`whitespace-nowrap rounded-full px-3 py-1 text-sm ${s === screen ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-700'}`}
            >
              {screenName(s)}
            </button>
          ))}
        </nav> : null}
        <div className="flex-1" />
        <div className="flex items-center gap-1">
          {isOlder(userscript, APP_VERSION) && (
            <a href="./mykplan-adp-sync.user.js" data-update-hint title={t('The installed script is {installed}; this page serves {served}', { installed: userscript ?? '', served: APP_VERSION })}
              className="mr-1 inline-flex items-center gap-2 rounded-full border border-blue-300 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100 dark:border-blue-500/40 dark:bg-blue-500/10 dark:text-blue-300 dark:hover:bg-blue-500/20">
              {t('Script update {version} →', { version: APP_VERSION })}
            </a>
          )}
          {!ds && !showSettings && (
            // nothing set up yet and the settings are closed: point at them
            <button type="button" onClick={toggleSettings} data-start-hint
              className="mr-1 inline-flex items-center gap-2 rounded-full border border-blue-300 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100 dark:border-blue-500/40 dark:bg-blue-500/10 dark:text-blue-300 dark:hover:bg-blue-500/20">
              <span className="relative flex size-2"><span className="absolute inline-flex size-full animate-ping rounded-full bg-blue-400 opacity-75" /><span className="relative inline-flex size-2 rounded-full bg-blue-500" /></span>
              {t('Start here: open settings →')}
            </button>
          )}
          {d && <button type="button" className={`tb ${showHelp ? 'on' : ''}`} title={t('Help: what the {screen} screen shows', { screen: screenName(screen) })} aria-expanded={showHelp} data-panel-button="help" onClick={toggleHelp}>❓</button>}
          <button type="button" className={`tb ${showSettings ? 'on' : ''}`} title={t('Settings')} aria-expanded={showSettings} data-panel-button="settings" onClick={toggleSettings}>⚙️</button>
          <button type="button" className={`tb ${showLog ? 'on' : ''}`} aria-expanded={showLog} data-panel-button="log" onClick={toggleLog}
            title={t('Log ({warnings} warnings). Dots: userscript {script}, data {data}', {
              warnings: ds ? ds.warnings.length : 0,
              script: userscript ? t('{version} installed', { version: userscript }) : t('not seen on this page'),
              data: ds ? t('as of {day}', { day: ds.asOf ?? '?' }) : t('none yet'),
            })}>
            <span className="flex items-center gap-1">
              <Dot status={userscript ? 'ok' : 'off'} label={userscript ? t('Userscript {version}', { version: userscript }) : t('Userscript')} />
              <Dot status={ds ? 'ok' : 'off'} label={ds ? t('Data {day}', { day: ds.asOf ?? '' }) : t('Data')} />
            </span>
          </button>
          {runIsLive(run) ? (
            <button type="button" className="tb" data-run-button="stop" title={t('Stop the run on mykplan ({done} of {total})', { done: run!.done, total: run!.total })} onClick={askStop}>⏹</button>
          ) : (
            <>
              <button type="button" className="tb font-bold text-blue-600 dark:text-blue-400" data-run-button="sync" disabled={!userscript}
                title={userscript ? t('Sync: opens mykplan and collects what is new (about a minute)') : t('Install the script first (⚙️ Settings, Get started)')} onClick={() => askRun('sync')}>⬇</button>
              <button type="button" className="tb" data-run-button="full" disabled={!userscript}
                title={userscript ? t('Full: opens mykplan and collects everything not saved yet (about 30 minutes the first time)') : t('Install the script first (⚙️ Settings, Get started)')} onClick={() => askRun('full')}>🔄</button>
            </>
          )}
          {/* ☁️ like the twitter viewer: connect once per browser session, then the mykplan_* tabs fill by themselves */}
          <button type="button" className={`tb ${g.connected ? 'on' : ''}`} data-google-button disabled={g.connected || g.busy || !loadConfig().clientId}
            title={g.connected
              ? (g.lastWritten ? t('Google Sheets connected: new data is written to the mykplan_* tabs by itself (last: data built {at})', { at: g.lastWritten.slice(0, 16).replace('T', ' ') }) : t('Google Sheets connected: new data is written to the mykplan_* tabs by itself'))
              : loadConfig().clientId ? t('Connect Google Sheets: then the mykplan_* tabs fill by themselves') : t('Google Sheets: set the Client ID and the spreadsheet in ⚙️ Settings first')}
            onClick={() => void connectGoogle()}>{g.busy ? '⏳' : '☁️'}</button>
          <button type="button" className="tb" data-google-off disabled={!g.connected} title={g.connected ? t('Disconnect Google') : t('Disconnect Google (not connected)')} onClick={disconnectGoogle}>🔌</button>
          <button type="button" className="tb" data-sheets-reload disabled={!g.connected || g.busy} title={g.connected ? t('Reload the data from Google Sheets (another computer, no script needed)') : t('Reload the data from Google Sheets (connect Google first)')} onClick={() => void loadFromSheets()}>↻</button>
          <button type="button" className="tb flex-col leading-none" disabled={!ds} title={t('Export CSV of the transactions')} onClick={() => ds && save(`mykplan-adp-transactions-${ds.asOf ?? 'data'}.csv`, toCsv(['activity_date', 'pay_check_date', 'type', 'source', 'fund', 'units', 'price', 'amount'], ds.transactions.map((t) => [t.activityDate, t.payCheckDate ?? '', t.rawType, t.source ?? '', t.fund, t.units === undefined ? '' : String(t.units), t.price === undefined ? '' : String(t.price), (t.amount / 100).toFixed(2)])), 'text/csv')}>📥<span className="text-[8px] font-bold tracking-wide">CSV</span></button>
          <button type="button" className="tb flex-col leading-none" disabled={!ds} title={t('Export JSON of all the data')} onClick={() => ds && save(`mykplan-adp-${ds.asOf ?? 'data'}.json`, JSON.stringify(ds, null, 1), 'application/json')}>{'{}'}<span className="text-[8px] font-bold tracking-wide">JSON</span></button>
        {/* shows the language in use (like gex: flag and code); a click switches to the other one */}
        <button type="button" className="tb" style={{ width: "auto", padding: "0 .4rem" }} data-lang-button={language} onClick={() => setLang(language === 'en' ? 'ru' : 'en')}
          title={t('Language: English (click for Russian)')}>
          <span className="flex items-center gap-1"><span aria-hidden="true">{LANG_FLAGS[language]}</span><span className="text-[10px] font-semibold uppercase">{language}</span></span>
        </button>
        <button
          type="button"
          onClick={theme.cycle}
          title={themeTitle(theme.mode, theme.systemDark)}
          data-theme-button={theme.mode}
          className="tb sun"
        >
          <span className="relative inline-flex">
            {icon.icon}
            {icon.auto && <span className="absolute -right-2 -top-1.5 text-[8px] font-bold leading-none">A</span>}
          </span>
        </button>
        </div>
      </header>

      <SlidePanel id="help-wrap" open={showHelp && !!d} title={`❓ ${screenName(screen)}: ${help(screen).about}`} onClose={toggleHelp}>
        <dl className="grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-[max-content_1fr]">
          {help(screen).items.map(([term, text]) => (
            <div key={term} className="contents">
              <dt className="font-medium">{term}</dt>
              <dd className="text-slate-600 dark:text-slate-300">{text}</dd>
            </div>
          ))}
        </dl>
      </SlidePanel>
      <SlidePanel id="settings-wrap" open={showSettings} title={`⚙️ ${t('Settings')}`} onClose={toggleSettings}>
        <SettingsPanel ds={ds} d={d} source={source} userscript={userscript} s={s} />
      </SlidePanel>
      <SlidePanel id="log-wrap" open={showLog} title={`🐞 ${t('Log')}`} onClose={toggleLog}>
        <LogPanel ds={ds} error={error} />
      </SlidePanel>
      </div>

      {source === 'demo' && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
          {t('Demo data: made-up funds and amounts, not yours.')}
          <button type="button" className="rounded-md bg-amber-200 px-2 py-0.5 dark:bg-amber-500/30" onClick={clearDemo}>{t('Hide demo')}</button>
        </div>
      )}
      <main className="min-h-0 flex-1 overflow-auto rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800" data-screen={screen}>
        {body}
      </main>
      </div>

      {/* the footer is the bottom gutter: same height as the side gutter, text centered in it (gex FOOTER_CLASS) */}
      <footer className="flex min-h-4 items-center justify-center px-4 text-center text-[0.625rem] leading-tight text-slate-400 lg:min-h-6 lg:px-6">
        <a href="https://github.com/daggerok/mykplan-adp" target="_blank" rel="noreferrer" className="underline decoration-dotted transition-colors hover:text-slate-600 dark:hover:text-slate-200">daggerok &copy; {year}</a>
      </footer>
    </div>
  );
}

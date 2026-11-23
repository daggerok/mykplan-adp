import { Fragment } from 'react';
import { t } from '../../app/i18n';

// The first screen while there is no data: four steps, each ticked by itself as soon as it is done.
// Nothing runs locally: the userscript is served by the same GitLab Pages site as this page
const TAMPERMONKEY = 'https://chromewebstore.google.com/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo';
const MYKPLAN = 'https://mykplan.adp.com/ParticipantSecure_Net/AccountHighlights.aspx';

function Step({ n, done, title, children }: { n: number; done: boolean; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className={`flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${done ? 'bg-green-600 text-white' : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200'}`}>{done ? '✓' : n}</span>
      <div className="flex flex-col gap-1 pt-0.5">
        <div className="font-semibold">{title}</div>
        <div className="text-sm text-slate-600 dark:text-slate-300">{children}</div>
      </div>
    </li>
  );
}

// a translated sentence whose {placeholders} are elements (links, bold, code): t() gives the text in the language of
// the moment and the elements go back into their places, so each language keeps its own word order
export function withParts(text: string, parts: Record<string, React.ReactNode>): React.ReactNode[] {
  return text.split(/(\{\w+\})/).map((piece, i) => {
    const m = /^\{(\w+)\}$/.exec(piece);
    return <Fragment key={i}>{m && Object.prototype.hasOwnProperty.call(parts, m[1]) ? parts[m[1]] : piece}</Fragment>;
  });
}

const link = 'font-medium text-blue-600 underline underline-offset-2 dark:text-blue-400';
const action = 'inline-flex items-center rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500';

// compact: inside the right column of the settings panel (no centering, no extra padding)
// runStarted: the userscript reported a run (any state); hasData: data with the daily prices is in
export function GetStarted({ userscript, hasData, runStarted = false, compact = false }: { userscript: string | null; hasData: boolean; runStarted?: boolean; compact?: boolean }) {
  return (
    <div className={`flex flex-col gap-6 ${compact ? '' : 'mx-auto max-w-2xl py-4'}`} data-get-started={compact ? 'panel' : 'main'}>
      <div>
        <h2 className="text-xl font-semibold">{t('Get started')}</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">{t('Four steps, once. Nothing to install on the computer: everything runs in Chrome.')}</p>
      </div>
      <ol className="flex flex-col gap-5">
        <Step n={1} done={!!userscript} title={t('Let Tampermonkey work on the mykplan sites')}>
          {withParts(t('Already have Tampermonkey (it runs the twitter script)? Then only this: click the puzzle icon right of the address bar → Tampermonkey → ⋮ → {manage} → {access} → add {viewer}, {mykplan} and {adp} (the ADP sign-in page, for the optional 🔑 login) or choose {all}. No Tampermonkey yet: {store} first.'), {
            manage: <b>Manage extension</b>,
            access: <b>Site access</b>,
            viewer: <code>{`${location.origin}/*`}</code>,
            mykplan: <code>https://mykplan.adp.com/*</code>,
            adp: <code>https://online.adp.com/*</code>,
            all: <b>On all sites</b>,
            store: <a className={link} href={TAMPERMONKEY} target="_blank" rel="noreferrer">{t('add it from the Chrome Web Store')}</a>,
          })}
        </Step>
        <Step n={2} done={!!userscript} title={t('Install the mykplan-adp script')}>
          <a className={action} href="./mykplan-adp-sync.user.js">{t('Install script')}</a>
          <span className="ml-2">{withParts(t('Tampermonkey opens a page with an {install} button: press it, then reload this page.'), { install: <b>Install</b> })}</span>
          <div className="mt-1">
            {userscript
              ? <span className="text-green-600">{t('Script {version} found on this page.', { version: userscript })}</span>
              : t('You see the script code as text instead of an Install button? Tampermonkey has no access to this site yet: step 1, then press Install script again.')}
          </div>
        </Step>
        <Step n={3} done={hasData || runStarted} title={t('Log in to mykplan and press 🔄 Full')}>
          {withParts(t('{open} and log in as usual. A dark panel appears in the bottom right corner: press {full} and leave the tab open (about 30 minutes the first time). If mykplan logs you out, log in again and press {cont}.'), {
            open: <a className={link} href={MYKPLAN} target="_blank" rel="noreferrer">{t('Open mykplan')}</a>,
            full: <b>🔄 Full</b>,
            cont: <b>▶ Continue</b>,
          })}
        </Step>
        <Step n={4} done={hasData} title={t('Come back here')}>
          {withParts(t('The data shows up on this page by itself when the run says {done}. After that, once per paycheck: log in to mykplan and press {sync} (about a minute).'), { done: <b>done</b>, sync: <b>⬇ Sync</b> })}
        </Step>
      </ol>
    </div>
  );
}

// once there is data the steps are done: the column tells how to keep the data fresh
export function KeepUpdated({ asOf, userscript }: { asOf: string | null; userscript: string | null }) {
  return (
    <div className="flex flex-col gap-2 text-sm" data-keep-updated>
      <h3 className="font-semibold">{t('Keep it up to date')}</h3>
      <p className="text-slate-600 dark:text-slate-300">{withParts(t('Data as of {day}'), { day: <b>{asOf ?? '—'}</b> })}{userscript ? <> · {t('script {version}', { version: userscript })}</> : null}.</p>
      <p className="text-slate-600 dark:text-slate-300">{withParts(t('After each paycheck: {open}, log in, press {sync} (about a minute). This page updates by itself.'), {
        open: <a className={link} href={MYKPLAN} target="_blank" rel="noreferrer">{t('open mykplan')}</a>,
        sync: <b>⬇ Sync</b>,
      })}</p>
    </div>
  );
}

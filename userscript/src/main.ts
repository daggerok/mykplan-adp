/// <reference lib="esnext" />
import { buildDataset, type Dataset } from '../../shared/dataset';
import { zip } from '../../shared/zip';
import { mountBadge, type Action } from './badge';
import { run, type Progress } from './crawl/run';
import { DATASET_KEY, RUN_KEY, gmDelete, gmGet, gmSet, gmWatch, notify } from './gm';
import { isPlanSignin, passwordRefused, planSignin, signinStep, type Login } from './signin';
import { COMMAND_KEY, freshCommand } from './command';
import { otherTabRun as otherTabRunOf } from './main-helpers';
import { GOOGLE_KEY, gmFetch, usableHandoff, writeFromUserscript } from './sheets-gm';

declare const GM_xmlhttpRequest: Parameters<typeof gmFetch>[0] | undefined;
import { indexedDbStore } from './rawStore';
import { classifySession, probeSession } from './session';

declare const __VERSION__: string;
const VERSION = typeof __VERSION__ === 'string' ? __VERSION__ : 'dev';
const time = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const parseHtml = (html: string) => new DOMParser().parseFromString(html, 'text/html');

function download(name: string, data: BlobPart, type: string): void {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// Tampermonkey storage keys of the optional re-login and of the resume after a login (owner 2026-11-22)
const LOGIN_KEY = 'mykplan-adp.login';
const RESUME_KEY = 'mykplan-adp.resume'; // { mode, at }: a run paused on an ended session, continue after login
// pauses in a row that saved nothing: after 3 the run no longer resumes by itself (review 2026-11-22: a hold page on
// one section while AccountHighlights is fine would pause, reload and restart forever)
const PAUSES_KEY = 'mykplan-adp.pausesWithoutProgress';
const MAX_EMPTY_PAUSES = 3;
const FLOW_KEY = 'mykplan-adp.loginFlowAt';
const REFUSED_KEY = 'mykplan-adp.loginRefusedAt'; // the saved password was refused: no auto login until 🔑 Save
const PASS_KEY = 'mykplan-adp.loginPassAt';
const RESUME_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const SECURE_HOME = '/ParticipantSecure_Net/AccountHighlights.aspx';

// this tab's id, published with the run state, so other tabs see that a run is going elsewhere
const TAB_ID = Math.random().toString(36).slice(2, 10);

function onMykplan(): void {
  const store = indexedDbStore();
  let stopping = false;
  let busy = false;
  let lastMode: 'full' | 'sync' = 'sync';

  const rebuild = async (): Promise<Dataset> => {
    const keys = await store.keys();
    const entries = [];
    for (const key of keys) {
      const e = await store.get(key);
      if (e) entries.push({ key: e.key, type: e.type, text: e.text });
    }
    const ds = buildDataset(entries, parseHtml, new Date().toISOString());
    gmSet(DATASET_KEY, JSON.stringify(ds));
    void writeSheets(ds);
    return ds;
  };

  // the mykplan_* tabs are written from here after every rebuild (every 50 steps and at the end), with the token the
  // viewer handed over after ☁️; without one the data waits and the viewer writes it when it is open and connected
  let sheetsBusy = false;
  let sheetsPending: Dataset | null = null;
  let sheetsNote = '';
  // the newest dataset is always written: one arriving during a write waits and goes right after it (review
  // 2026-11-22: the final write of a run was dropped when the 50-step write was still going)
  const writeSheets = async (first: Dataset) => {
    if (sheetsBusy) { sheetsPending = first; return; }
    sheetsBusy = true;
    let ds: Dataset | null = first;
    while (ds) {
      sheetsPending = null;
      if (ds.transactions.length || ds.dailyFunds.length) {
        const g = usableHandoff(gmGet<string | null>(GOOGLE_KEY, null), Date.now());
        if (!g || typeof GM_xmlhttpRequest !== 'function') sheetsNote = 'sheets: waiting for ☁️ in the viewer';
        else {
          try {
            await writeFromUserscript(ds, g, gmFetch(GM_xmlhttpRequest), () => {});
            sheetsNote = `sheets: written ${time()} (${ds.transactions.length} transactions, ${ds.dailyFunds.length} fund-days)`;
          } catch (err) {
            sheetsNote = `sheets: ${err instanceof Error ? err.message : String(err)}`.slice(0, 200);
          }
        }
        badge.login(sheetsNote);
      }
      ds = sheetsPending;
    }
    sheetsBusy = false;
  };

  // the viewer shows the run state (running n/total, or where it stopped); throttled to one write per 2 s
  let publishedAt = 0;
  const publishRun = (p: Progress) => {
    const now = Date.now();
    if (p.status === 'running' && now - publishedAt < 2000) return;
    publishedAt = now;
    gmSet(RUN_KEY, JSON.stringify({ status: p.status, mode: p.mode, done: p.done, total: p.total, current: p.current ?? null, message: p.message ?? null, at: now, tab: TAB_ID }));
  };

  // one item per line (the panel keeps its width): progress, current step, inside-step note, failures; the last
  // error and the run message are important ("!") and shown in full
  const describe = (p: Progress) => {
    const lines = [`${p.mode} ${p.status}: ${p.done}/${p.total}${p.savedBefore ? ` (+${p.savedBefore} saved before)` : ''}`];
    if (p.current) lines.push(`step: ${p.current}`);
    if (p.note) lines.push(p.note);
    if (p.backdated) lines.push(`!${p.backdated}`);
    if (p.emptyBefore && p.status !== 'running') lines.push(`first transaction ${p.emptyBefore}: earlier days have no balances, skipped`);
    const failed = p.failed.filter((f) => f.key !== 'log');
    if (failed.length) {
      lines.push(`failed: ${failed.length} (they are tried again next run)`);
      lines.push(`!${failed[failed.length - 1]!.key}: ${failed[failed.length - 1]!.error}`);
    }
    if (p.message && p.status !== 'running') lines.push(`${p.status === 'failed' || p.status === 'paused' ? '!' : ''}${p.message}`);
    return lines.join('\n');
  };

  const start = async (mode: 'full' | 'sync') => {
    if (busy) return;
    // one run per browser: a second mykplan tab would switch the server-side choices of the first (review 2026-11-22)
    const other = otherTabRunOf(gmGet<string | null>(RUN_KEY, null), Date.now(), TAB_ID);
    if (other) { badge.status(`!another mykplan tab is running ${other} now: wait for it or press ⏹ there`); return; }
    busy = true;
    stopping = false;
    lastMode = mode;
    gmDelete(RESUME_KEY);
    badge.running(true);
    // the viewer fills while the run goes: the dataset is rebuilt every 50 saved steps (not only at the end)
    let builtAt = 0;
    let building = false;
    let backdatedShown = false;
    const p = await run(mode, {
      store, parseHtml, today, shouldStop: () => stopping,
      onProgress: (x) => {
        if (x.backdated && !backdatedShown) {
          backdatedShown = true;
          notify('mykplan-adp: ADP changed past data', `${x.backdated}; the run fixes it by itself`);
        }
        badge.status(describe(x));
        publishRun(x);
        if (x.status === 'paused') badge.session('expired', time());
        if (x.status === 'running' && x.done - builtAt >= 50 && !building) {
          builtAt = x.done;
          building = true;
          void rebuild().catch(() => undefined).then(() => { building = false; });
        }
      },
    });
    publishRun(p);
    badge.status(`${describe(p)}\nbuilding the dataset…`);
    try {
      const ds = await rebuild();
      badge.status(`${describe(p)}\ndataset: ${ds.transactions.length} transactions, ${ds.dailyFunds.length} fund-days, ${ds.warnings.length} warnings`);
    } catch (err) {
      badge.status(`${describe(p)}\ndataset failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    busy = false;
    badge.running(false, p.status === 'paused' || p.status === 'stopped');
    // "progress" = the run saved more than its first page (highlights)
    const empty = p.status === 'paused' && p.done <= 2 ? gmGet<number>(PAUSES_KEY, 0) + 1 : 0;
    gmSet(PAUSES_KEY, empty);
    if (p.status === 'paused' && empty >= MAX_EMPTY_PAUSES) {
      gmDelete(RESUME_KEY);
      notify('mykplan-adp: run stopped', `It paused ${empty} times in a row without saving anything: log in to mykplan and press 🔄 Full yourself`);
      badge.status(`${describe(p)}\n!paused ${empty} times without progress: not resuming by itself; press 🔄 Full when mykplan works again`);
      return;
    }
    if (p.status === 'paused') {
      // the session ended: remember to continue, then log in again (saved login) or wait for the owner
      gmSet(RESUME_KEY, { mode, at: Date.now() });
      const login = gmGet<Login | null>(LOGIN_KEY, null);
      notify('mykplan-adp: run paused', login ? 'The mykplan session ended: logging in again, the run continues by itself' : 'The mykplan session ended: log in to mykplan, the run continues by itself');
      // always reopen mykplan: a hold page is completed by the browser itself, a sign-in page by 🔑 or the owner
      setTimeout(() => { location.href = SECURE_HOME; }, 3000);
    }
  };

  const onAction = (a: Action) => {
    // a click by the owner starts fresh: the empty-pause counter is for runs that resume by themselves
    if (a === 'sync' || a === 'full') { gmSet(PAUSES_KEY, 0); void start(a); }
    else if (a === 'continue') void start(lastMode);
    else if (a === 'stop') { stopping = true; badge.status('stopping after the current step…'); }
    else if (a === 'check') { badge.session('unknown', 'checking…'); void probeSession().then((s) => badge.session(s, time())); }
    else if (a === 'json') void rebuild().then((ds) => download(`mykplan-adp-${today()}.json`, JSON.stringify(ds, null, 1), 'application/json'));
    else if (a === 'raw') {
      void (async () => {
        badge.status('packing raw pages…');
        const files = [];
        for (const key of await store.keys()) {
          const e = await store.get(key);
          if (e) files.push({ name: key, data: e.bytes ?? new TextEncoder().encode(e.text ?? '') });
        }
        download(`mykplan-adp-raw-${today()}.zip`, zip(files), 'application/zip');
        badge.status(`📦 ${files.length} files → ~/Downloads, then: bun run import-raw`);
      })();
    }
  };

  const badge = mountBadge(VERSION, onAction, {
    saved: () => gmGet<Login | null>(LOGIN_KEY, null)?.user ?? null,
    save: (user, pass) => { gmSet(LOGIN_KEY, { user, pass }); gmDelete(REFUSED_KEY); },
    forget: () => gmDelete(LOGIN_KEY),
  });
  badge.running(false);
  const here = classifySession(location.href, document.documentElement.outerHTML);
  if (here !== 'unknown') badge.session(here, time());
  else void probeSession().then((s) => badge.session(s, time()));
  const saved = gmGet<string | null>(DATASET_KEY, null);
  badge.status(saved ? 'dataset ready; ⬇ Sync after each paycheck' : 'first time: 🔄 Full (about 30 minutes, can be stopped and continued)');

  // a ⏹ from the viewer toolbar stops the run in this tab
  gmWatch(COMMAND_KEY, (raw) => {
    const c = freshCommand(raw, Date.now());
    if (c && c.mode === 'stop' && busy) { stopping = true; gmDelete(COMMAND_KEY); badge.status('stopping after the current step (from the viewer)…'); }
  });
  // ⬇ Sync or 🔄 Full pressed in the viewer toolbar: this tab was opened for it, start (or wait for the login)
  const cmd = freshCommand(gmGet<string | null>(COMMAND_KEY, null), Date.now());
  if (cmd && cmd.mode !== 'stop') {
    gmDelete(COMMAND_KEY);
    void probeSession().then((s) => {
      if (s === 'ok') { badge.status(`${cmd.mode} asked from the viewer: starting…`); setTimeout(() => void start(cmd.mode as 'full' | 'sync'), 800); }
      else { gmSet(RESUME_KEY, { mode: cmd.mode, at: Date.now() }); badge.status('log in to mykplan: the run starts by itself after the login'); }
    });
    return;
  }

  // back after a login with a run waiting: continue it by itself (no ▶ Continue click needed)
  const resume = gmGet<{ mode: 'full' | 'sync'; at: number } | null>(RESUME_KEY, null);
  if (resume && Date.now() - resume.at < RESUME_MAX_AGE_MS) {
    void probeSession().then((s) => {
      if (s !== 'ok') return;
      badge.status(`logged in again: continuing ${resume.mode}…`);
      setTimeout(() => void start(resume.mode), 1500);
    });
  } else if (resume) gmDelete(RESUME_KEY);
}

// ADP sign-in page: only when a run waits (resume mark) and a login is saved; otherwise the script does nothing here
// the sign-in page renders its form a little after load: wait until a field shows before judging it
const findFieldsReady = (): boolean => !!document.querySelector('input') || Array.from(document.querySelectorAll('*')).some((el) => !!el.shadowRoot?.querySelector('input'));

function onSignin(): void {
  // ⬇ or 🔄 from the viewer while logged out: mykplan redirected straight here, so the command becomes the resume
  // mark (the run starts on mykplan right after this login)
  const cmd = freshCommand(gmGet<string | null>(COMMAND_KEY, null), Date.now());
  if (cmd && cmd.mode !== 'stop') {
    gmSet(RESUME_KEY, { mode: cmd.mode, at: Date.now() });
    gmDelete(COMMAND_KEY);
  }
  const resume = gmGet<{ at: number } | null>(RESUME_KEY, null);
  const login = gmGet<Login | null>(LOGIN_KEY, null);
  if (!resume || !login || Date.now() - resume.at > RESUME_MAX_AGE_MS || !isPlanSignin(location.search)) return;
  if (gmGet<number>(REFUSED_KEY, 0)) return;
  const first = { flowAt: gmGet<number>(FLOW_KEY, 0), passAt: gmGet<number>(PASS_KEY, 0) };
  let tries = 0;
  let checkedRefusal = false;
  const timer = setInterval(() => {
    const now = Date.now();
    // the form is back right after our password: refused, stop for good (until a new 🔑 Save)
    if (!checkedRefusal && findFieldsReady()) {
      checkedRefusal = true;
      if (passwordRefused(document, first, now)) {
        gmSet(REFUSED_KEY, now);
        notify('mykplan-adp: saved password refused', 'ADP did not accept the saved login: log in yourself and save the new password in 🔑');
        clearInterval(timer);
        return;
      }
    }
    const marks = { flowAt: gmGet<number>(FLOW_KEY, 0), passAt: gmGet<number>(PASS_KEY, 0) };
    const step = signinStep(document, login, planSignin(marks, now));
    if (step === 'filled-user') gmSet(FLOW_KEY, now);
    if (step === 'filled-pass') {
      if (now - marks.flowAt >= 2 * 60 * 1000) gmSet(FLOW_KEY, now); // one-page form: the password step starts the flow
      gmSet(PASS_KEY, now);
    }
    const stop = step === 'filled-pass' || step === 'mfa' || step === 'too-soon' || ++tries > 120;
    if (step === 'mfa') notify('mykplan-adp: enter the code', 'ADP asks for a one-time code: type it, the run continues after the login');
    if (step === 'too-soon') notify('mykplan-adp: log in yourself', 'An automatic login was tried less than 30 minutes ago; not trying again (no lockout)');
    if (stop) clearInterval(timer);
  }, 1000);
}

// Viewer page (GitLab Pages or localhost): mark the page and hand over the dataset, now and on every change
function onViewer(): void {
  document.documentElement.dataset.mykplanAdpUserscript = VERSION;
  const send = (json: unknown) => {
    if (typeof json === 'string') window.postMessage({ type: 'mykplan-adp:dataset', json }, location.origin);
  };
  window.addEventListener('message', (e) => {
    // the Google token after ☁️ and each silent renew: the mykplan tab writes the mykplan_* tabs with it during runs
    if (e.origin === location.origin && e.data && e.data.type === 'mykplan-adp:google' && typeof e.data.json === 'string') gmSet(GOOGLE_KEY, e.data.json);
    // toolbar buttons of the viewer: ⬇ Sync, 🔄 Full, ⏹ Stop
    if (e.origin === location.origin && e.data && e.data.type === 'mykplan-adp:command' && ['sync', 'full', 'stop'].indexOf(e.data.mode) >= 0) {
      gmSet(COMMAND_KEY, JSON.stringify({ mode: e.data.mode, at: Date.now() }));
    }
    if (e.origin === location.origin && e.data && e.data.type === 'mykplan-adp:request') {
      send(gmGet<string | null>(DATASET_KEY, null));
      sendRun(gmGet<string | null>(RUN_KEY, null));
    }
  });
  send(gmGet<string | null>(DATASET_KEY, null));
  gmWatch(DATASET_KEY, send);
  const sendRun = (json: unknown) => {
    if (typeof json === 'string') window.postMessage({ type: 'mykplan-adp:run', json }, location.origin);
  };
  sendRun(gmGet<string | null>(RUN_KEY, null));
  gmWatch(RUN_KEY, sendRun);
}

if (location.hostname === 'mykplan.adp.com') onMykplan();
else if (location.hostname === 'online.adp.com') onSignin();
else onViewer();

/// <reference lib="esnext" />
import type { SessionState } from './session';

// Panel on mykplan in a shadow root (site CSS never touches it): session dot, progress line and the buttons
// of the plan section 2: ⬇ Sync, 🔄 Full, ⏹ Stop (Continue after a pause), {} JSON, 📦 Raw
export const MIN_KEY = 'mykplan-adp-badge-minimized';

// the saved user name shown on the panel: its first 3 characters and stars ("joh****"); short names show less
export const maskUser = (u: string): string => `${u.slice(0, Math.min(3, Math.max(1, u.length - 2)))}****`;
const COLORS: Record<SessionState, string> = { ok: '#16a34a', expired: '#dc2626', unknown: '#94a3b8' };

export type Action = 'sync' | 'full' | 'stop' | 'continue' | 'json' | 'raw' | 'check';

export interface Badge {
  session(state: SessionState, note?: string): void;
  status(line: string): void;
  running(on: boolean, canContinue?: boolean): void;
  login(sheetsNote: string): void;
}

export interface LoginHooks { saved: () => string | null; save: (user: string, pass: string) => void; forget: () => void }

export function mountBadge(version: string, onAction: (a: Action) => void, login?: LoginHooks): Badge {
  const host = document.createElement('div');
  host.id = 'mykplan-adp-badge';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `
    <style>
      .b { position: fixed; right: 12px; bottom: 12px; z-index: 2147483647; display: flex; flex-direction: column; gap: 6px;
           font: 12px/1.3 system-ui, sans-serif; color: #e2e8f0; background: #0f172a; border-radius: 10px; padding: 8px 10px;
           box-shadow: 0 4px 14px rgba(0,0,0,.25); width: 440px; box-sizing: border-box; }
      .row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
      .dot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
      .st { color: #94a3b8; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
      /* one item per line; long ones end with … (full text in the tooltip); a line marked important wraps in full */
      .st > div { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .st > div.imp { white-space: normal; overflow-wrap: anywhere; color: #fca5a5; }
      .s { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
      button { all: unset; cursor: pointer; padding: 3px 7px; border-radius: 6px; background: #1e293b; }
      button:hover { background: #334155; }
      button[disabled] { opacity: .4; cursor: default; }
      [hidden] { display: none !important; }
      .min { margin-left: auto; padding: 0 7px; background: transparent; font-size: 14px; line-height: 1; }
      .mini { position: fixed; right: 12px; bottom: 12px; z-index: 2147483647; display: flex; align-items: center; gap: 6px;
              height: 36px; min-width: 36px; padding: 0 10px; border-radius: 18px; background: #0f172a; color: #e2e8f0;
              font: 12px/1 system-ui, sans-serif; box-shadow: 0 4px 14px rgba(0,0,0,.25); cursor: pointer; }
      .mini:hover { background: #1e293b; }
      .lg { display: flex; flex-direction: column; gap: 6px; border-top: 1px solid #1e293b; padding-top: 6px; }
      .lg input { all: unset; background: #1e293b; border-radius: 6px; padding: 4px 8px; color: #e2e8f0; }
      .lg .hint, .hint { color: #94a3b8; }
      .lgline { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    </style>
    <button class="mini" data-m="restore" title="mykplan-adp: show the panel" hidden><span class="dot"></span><span class="ml"></span></button>
    <div class="b" role="status">
      <div class="row"><span class="dot"></span><span>mykplan-adp ${version}</span><span class="s"></span>
        <button data-a="check" title="Check that you are still logged in to mykplan (opens nothing, changes nothing)">↻</button>
        <button data-m="login" title="Optional: your mykplan login, so the script can log in again when the session ends">🔑</button>
        <button class="min" data-m="minimize" title="Minimize to a small icon (the run goes on)">–</button></div>
      <div class="row">
        <button data-a="sync" title="New days, current month, new statements, journal, today's snapshot">⬇ Sync</button>
        <button data-a="full" title="Everything not saved yet; about 30 minutes the first time, can be stopped and continued">🔄 Full</button>
        <button data-a="stop" hidden>⏹ Stop</button>
        <button data-a="continue" hidden>▶ Continue</button>
        <button data-a="json" title="Download the parsed data as JSON">{} JSON</button>
        <button data-a="raw" title="Download every saved page, PDF and QFX as one zip (bun run import-raw)">📦 Raw</button>
      </div>
      <div class="st"></div>
      <div class="lgline hint" data-login-line></div>
      <div class="lgline hint" data-sheets-line></div>
      <div class="lg" hidden>
        <div class="hint">Optional. Kept only in this script's Tampermonkey storage (not in the repo, the viewer or Sheets). Used only to log in again when a run's session ended; one try per 30 minutes; a one-time code (MFA) you type yourself.</div>
        <input class="lu" placeholder="mykplan user name" autocomplete="off" spellcheck="false">
        <input class="lp" type="password" placeholder="password" autocomplete="new-password">
        <div class="row"><button data-m="login-save">Save</button><button data-m="login-forget">Forget</button><span class="ls hint"></span></div>
      </div>
    </div>`;
  root.querySelectorAll<HTMLButtonElement>('button[data-a]').forEach((b) => b.addEventListener('click', () => onAction(b.dataset.a as Action)));
  document.body.appendChild(host);
  const q = <T extends Element>(s: string) => root.querySelector<T & HTMLElement>(s)!;
  // minimized: only a small round icon with the session dot and the progress; remembered per browser
  const setMin = (on: boolean) => {
    q('.b').hidden = on;
    q('.mini').hidden = !on;
    host.dataset.minimized = on ? 'yes' : 'no';
    try { localStorage.setItem(MIN_KEY, on ? '1' : '0'); } catch { /* blocked storage: not remembered */ }
  };
  q('[data-m="minimize"]').addEventListener('click', () => setMin(true));
  q('[data-m="restore"]').addEventListener('click', () => setMin(false));
  // the optional login form under 🔑; the password is never shown back, only the masked user name
  const showSaved = () => {
    const u = login?.saved();
    const line = u ? `🔑 login saved: ${maskUser(u)} / *****` : '🔑 login not saved: you log in yourself';
    q('[data-login-line]').textContent = line;
    q('.ls').textContent = u ? 'saved' : 'not saved';
    (q('.lu') as HTMLInputElement).placeholder = u ? maskUser(u) : 'mykplan user name';
    (q('.lp') as HTMLInputElement).placeholder = u ? '*****' : 'password';
  };
  q('[data-m="login"]').addEventListener('click', () => { q('.lg').hidden = !q('.lg').hidden; showSaved(); });
  q('[data-m="login-save"]').addEventListener('click', () => {
    const u = (q('.lu') as HTMLInputElement).value.trim();
    const p = (q('.lp') as HTMLInputElement).value;
    if (!u || !p) { q('.ls').textContent = 'both fields, please'; return; }
    login?.save(u, p);
    (q('.lu') as HTMLInputElement).value = '';
    (q('.lp') as HTMLInputElement).value = '';
    showSaved();
  });
  q('[data-m="login-forget"]').addEventListener('click', () => { login?.forget(); showSaved(); });
  showSaved();
  let remembered = false;
  try { remembered = localStorage.getItem(MIN_KEY) === '1'; } catch { /* default: open */ }
  setMin(remembered);
  return {
    session(state, note) {
      root.querySelectorAll<HTMLElement>('.dot').forEach((d) => { d.style.background = COLORS[state]; });
      q('.s').textContent = `· session ${state}${note ? ` · ${note}` : ''}`;
      host.dataset.session = state;
    },
    status(line) {
      // lines starting with "!" are important (errors): shown in full, wrapped
      const box = q('.st');
      box.textContent = '';
      line.split('\n').filter(Boolean).forEach((l) => {
        const div = document.createElement('div');
        const imp = l.startsWith('!');
        div.textContent = imp ? l.slice(1) : l;
        div.title = div.textContent;
        if (imp) div.className = 'imp';
        box.appendChild(div);
      });
      // the icon shows the step counter while a run goes ("8/1037"), a tick when done
      const count = line.match(/(\d+\/\d+)/)?.[1];
      q('.ml').textContent = /\bdone\b/.test(line) ? '✓' : / running/.test(line) && count ? count : '';
    },
    login(note) { q('[data-sheets-line]').textContent = note; q('[data-sheets-line]').title = note; },
    running(on, canContinue = false) {
      (['sync', 'full', 'json', 'raw'] as const).forEach((a) => { q<HTMLButtonElement>(`[data-a="${a}"]`).disabled = on; });
      q('[data-a="stop"]').hidden = !on;
      q('[data-a="continue"]').hidden = on || !canContinue;
    },
  };
}

/// <reference lib="esnext" />
// Google Identity Services in the browser (the daggerok/youtube and daggerok/twitter way, rewritten):
// initTokenClient with the spreadsheets scope, the access token kept in memory only with its expiry,
// renewed silently (prompt '') and 'consent' only on the first connect. localStorage keeps the public
// config {clientId, spreadsheetId, email}, never the token. Nothing here logs the token
export const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
export const CONFIG_KEY = 'mykplan-adp-gs-config';
const GIS_SRC = 'https://accounts.google.com/gsi/client';
// a token with less than this left is renewed before use
const MARGIN_MS = 60000;

export interface GsConfig {
  clientId: string;
  spreadsheetId: string;
  email: string;
}

export const EMPTY_CONFIG: GsConfig = { clientId: '', spreadsheetId: '', email: '' };

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function storage(): StorageLike | null {
  try {
    const g = globalThis as unknown as { localStorage?: StorageLike };
    return g.localStorage || null;
  } catch {
    return null;
  }
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** The saved config; an empty one when nothing is saved, storage is blocked or the value is broken. */
export function loadConfig(): GsConfig {
  try {
    const s = storage();
    const raw = s ? s.getItem(CONFIG_KEY) : null;
    if (!raw) return { clientId: '', spreadsheetId: '', email: '' };
    const v: unknown = JSON.parse(raw);
    if (typeof v !== 'object' || v === null) return { clientId: '', spreadsheetId: '', email: '' };
    const o = v as Record<string, unknown>;
    return { clientId: str(o.clientId), spreadsheetId: parseSpreadsheetId(str(o.spreadsheetId)), email: str(o.email) };
  } catch {
    return { clientId: '', spreadsheetId: '', email: '' };
  }
}

/** Saves the config (a pasted spreadsheet URL is stored as its id); false when storage is unavailable. */
export function saveConfig(c: Partial<GsConfig>): boolean {
  const merged = loadConfig();
  if (c.clientId !== undefined) merged.clientId = c.clientId.trim();
  if (c.spreadsheetId !== undefined) merged.spreadsheetId = parseSpreadsheetId(c.spreadsheetId);
  if (c.email !== undefined) merged.email = c.email.trim();
  try {
    const s = storage();
    if (!s) return false;
    s.setItem(CONFIG_KEY, JSON.stringify(merged));
    return true;
  } catch {
    return false;
  }
}

export function clearConfig(): void {
  try {
    const s = storage();
    if (s) s.removeItem(CONFIG_KEY);
  } catch { /* storage blocked */ }
}

/** The id out of a full spreadsheet URL (…/spreadsheets/d/<id>/edit#gid=0) or a bare id; '' for nothing usable. */
export function parseSpreadsheetId(v: string): string {
  const t = (v || '').trim();
  if (!t) return '';
  const m = /\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/.exec(t);
  if (m) return m[1];
  return /^[a-zA-Z0-9_-]+$/.test(t) ? t : '';
}

export const spreadsheetUrl = (id: string): string => 'https://docs.google.com/spreadsheets/d/' + id + '/edit';

/** For Setup: show only the edges of a client id, spreadsheet id or email (the 👁 button shows the whole value). */
export function mask(v: string): string {
  if (!v) return '';
  if (v.length <= 8) return '•'.repeat(v.length);
  return v.slice(0, 4) + '•'.repeat(Math.min(12, v.length - 8)) + v.slice(-4);
}

// ---- GIS ----

type TokenResponse = { access_token?: string; expires_in?: number | string; error?: string; error_description?: string };
type TokenClient = { requestAccessToken: (o: { prompt: string }) => void };
export interface Gis {
  accounts: {
    oauth2: {
      initTokenClient: (o: {
        client_id: string;
        scope: string;
        login_hint?: string;
        callback: (r: TokenResponse) => void;
        error_callback?: (e: { type?: string; message?: string }) => void;
      }) => TokenClient;
      revoke: (token: string, done: () => void) => void;
    };
  };
}

const windowGis = (): Gis | undefined => (globalThis as unknown as { google?: Gis }).google;

let loading: Promise<void> | null = null;

function waitForGis(timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const tick = (): void => {
      const g = windowGis();
      if (g && g.accounts && g.accounts.oauth2) return resolve();
      if (Date.now() - t0 > timeoutMs) return reject(new Error('Google Identity Services did not load'));
      setTimeout(tick, 50);
    };
    tick();
  });
}

/** Adds the GIS script once and waits for google.accounts.oauth2. */
export function loadGis(timeoutMs = 12000): Promise<void> {
  const g = windowGis();
  if (g && g.accounts && g.accounts.oauth2) return Promise.resolve();
  if (!loading) {
    loading = new Promise<void>((resolve, reject) => {
      const fail = (e: unknown): void => { loading = null; reject(e); };
      if (document.querySelector('script[data-gis]')) {
        waitForGis(timeoutMs).then(resolve, fail);
        return;
      }
      const s = document.createElement('script');
      s.src = GIS_SRC;
      s.async = true;
      s.defer = true;
      s.setAttribute('data-gis', '1');
      s.onload = () => { waitForGis(timeoutMs).then(resolve, fail); };
      s.onerror = () => fail(new Error('Google Identity Services failed to load (blocked or offline?)'));
      document.head.appendChild(s);
    });
  }
  return loading;
}

export interface Token {
  value: string;
  expiresAt: number;
}

export interface GoogleAuthOptions {
  // read at every request so Setup changes apply at once
  config: () => GsConfig;
  // tests inject a fake; the browser default loads the GIS script
  gis?: () => Promise<Gis>;
  now?: () => number;
}

/**
 * The token holder. `get(force)` matches the Sheets client's TokenGetter: a token with more than a minute
 * left is reused, otherwise renewed silently; concurrent renewals share one request; force renews after a 401.
 */
export class GoogleAuth {
  private token: Token | null = null;
  private pending: Promise<Token> | null = null;
  private connectedOnce = false;
  private disabled = false;
  private readonly opts: GoogleAuthOptions;

  constructor(opts: GoogleAuthOptions) {
    this.opts = opts;
  }

  private now(): number {
    return this.opts.now ? this.opts.now() : Date.now();
  }

  get connected(): boolean {
    return !this.disabled && !!this.token && this.token.expiresAt > this.now();
  }

  /** The token and its expiry for the userscript channel (GM storage), null when none or disconnected. */
  peek(): Token | null {
    return this.disabled || !this.token ? null : { value: this.token.value, expiresAt: this.token.expiresAt };
  }

  /**
   * Connect in Setup (a user click). 'consent' only on the first connect: no token yet in this page and no
   * email saved in the config (the viewer saves it after the first connect); silent otherwise. `consent`
   * overrides that (a "switch account" button)
   */
  async connect(consent?: boolean): Promise<void> {
    this.disabled = false;
    const first = !this.connectedOnce && !this.opts.config().email;
    await this.renew(consent === undefined ? first : consent);
  }

  async get(force = false): Promise<string> {
    if (this.disabled) throw new Error('Google is disconnected: press Connect in Setup');
    if (!force && this.token && this.now() + MARGIN_MS < this.token.expiresAt) return this.token.value;
    return (await this.renew(false)).value;
  }

  /** The bound getter for SheetsClient({ getToken }). */
  getter(): (force: boolean) => Promise<string> {
    return (force: boolean) => this.get(force);
  }

  private renew(consent: boolean): Promise<Token> {
    if (this.pending) return this.pending;
    this.pending = this.request(consent)
      .then((t) => {
        this.token = t;
        this.connectedOnce = true;
        return t;
      }, (e: unknown) => {
        // a failed renew keeps a token that still works (review 2026-11-22: it was thrown away 15 minutes early)
        if (this.token && this.now() >= this.token.expiresAt) this.token = null;
        throw e;
      });
    const done = (): void => { this.pending = null; };
    this.pending.then(done, done);
    return this.pending;
  }

  private async request(consent: boolean): Promise<Token> {
    const cfg = this.opts.config();
    const clientId = cfg.clientId.trim();
    if (!clientId) throw new Error('Enter the Google OAuth Client ID in Setup first');
    const g = this.opts.gis ? await this.opts.gis() : await loadGis().then(() => {
      const w = windowGis();
      if (!w) throw new Error('Google Identity Services unavailable');
      return w;
    });
    return new Promise<Token>((resolve, reject) => {
      const client = g.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPE,
        login_hint: cfg.email || undefined,
        callback: (r) => {
          if (r.error) return reject(new Error('Google sign-in: ' + (r.error_description || r.error)));
          if (!r.access_token) return reject(new Error('Google sign-in returned no access token'));
          const expiresIn = Number(r.expires_in) || 3600;
          resolve({ value: r.access_token, expiresAt: this.now() + expiresIn * 1000 });
        },
        error_callback: (e) => reject(new Error('Google sign-in: ' + ((e && (e.type || e.message)) || 'failed'))),
      });
      client.requestAccessToken({ prompt: consent ? 'consent' : '' });
    });
  }

  /** Disconnect: revoke and forget the token; get() fails until the next connect(). */
  disconnect(): void {
    const t = this.token;
    this.token = null;
    this.disabled = true;
    if (!t) return;
    try {
      const g = windowGis();
      if (g) g.accounts.oauth2.revoke(t.value, () => { /* done */ });
    } catch { /* GIS gone */ }
  }
}

/** A spreadsheet link with the middle of its id hidden (twitter and youtube Setup): the 👁 button shows it whole. */
export function maskSpreadsheetUrl(url: string): string {
  if (!url) return '';
  const idx = url.indexOf('/d/');
  if (idx === -1) return mask(url);
  const prefix = url.slice(0, idx + 3);
  const rest = url.slice(idx + 3);
  const id = rest.split('/')[0] ?? '';
  const masked = id.length <= 4 ? '••••••••' : id.slice(0, 3) + '••••••••••••••••' + id.slice(-3);
  return prefix + masked + rest.slice(id.length);
}

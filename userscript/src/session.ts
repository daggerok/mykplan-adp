/// <reference lib="esnext" />
// Is the mykplan session alive? Decided from the page URL and its HTML, no clicks.
// Timeout and logout land on ISITimeout or ISIlogout (WarnTimeout warns first); a login form has a password field.
// Seen 2026-11-21: without a session a secure page redirects to https://online.adp.com/signin/v1/?APPID=401K...
// (another host, so the userscript never runs there)
export type SessionState = 'ok' | 'expired' | 'unknown';

const EXPIRED_URL = /ISITimeout|ISIlogout|\/login|signin|logon/i;
const SECURE_PATH = /\/ParticipantSecure_Net\//i;

// the SSO hold page ("being authorized for your request") is not a working session (review 2026-11-22)
export const AUTH_HOLD = /being authorized for your request|hold your data while you are being authorized/i;

export function classifySession(url: string, html: string): SessionState {
  if (EXPIRED_URL.test(url) || AUTH_HOLD.test(html)) return 'expired';
  if (/<input[^>]+type=["']?password/i.test(html)) return 'expired';
  if (SECURE_PATH.test(url) && /__VIEWSTATE|__doPostBack/.test(html)) return 'ok';
  return 'unknown';
}

// A read-only GET of a light secure page, called on load only when the current page says nothing and when the
// owner clicks the badge. redirect 'manual': an expired session redirects to online.adp.com, and following that
// cross-origin redirect would end in a CORS error (= unknown); a redirect at all means no session
export const PROBE_PATH = '/ParticipantSecure_Net/AccountHighlights.aspx';

export async function probeSession(fetcher: typeof fetch = fetch): Promise<SessionState> {
  try {
    const res = await fetcher(PROBE_PATH, { credentials: 'include', redirect: 'manual', cache: 'no-store' });
    if (res.type === 'opaqueredirect' || (res.status >= 300 && res.status < 400)) return 'expired';
    return classifySession(res.url, await res.text());
  } catch {
    return 'unknown';
  }
}

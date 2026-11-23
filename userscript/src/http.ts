/// <reference lib="esnext" />
// Same-origin requests on mykplan.adp.com with the owner's own session. Read only: the only forms posted are the
// query forms of TransactionHistory, TransactionHistoryDownloads (Quicken), Statements (on-demand view) and the
// AccountUpdatesSummary list and Detail postbacks. Change forms (Contributions, Transfer, Allocation, SaveSmart)
// are only ever read with GET; postForm refuses their paths
import { AUTH_HOLD, probeSession } from './session';

export const BASE = '/ParticipantSecure_Net/';

const READ_ONLY_POSTS = [
  /\/TransactionHistory\.aspx$/i,
  /\/TransactionHistoryDownloads\.aspx$/i,
  /\/RSOnDemandReports\/Statements\.aspx$/i,
  /\/AccountUpdatesSummary\.aspx$/i,
];

// the site answered, but with an error page or without the expected link: asking again gives the same answer,
// so these are not retried (only network failures are)
export class SiteError extends Error {}

export class SessionExpired extends Error {
  constructor() { super('mykplan session expired: log in again and press Continue'); }
}

export type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

const expiredUrl = (url: string) => /ISITimeout|ISIlogout|online\.adp\.com\/signin|\/signin/i.test(url);
// seen live 2026-11-22 ~17:10: for a few minutes every answer was an SSO hold page ("This page is used to hold your
// data while you are being authorized for your request ... Continue") that a browser passes by itself but fetch does
// not. It is treated as an ended session: the run pauses, the tab opens mykplan so the browser completes it, resumes
export { AUTH_HOLD };

// Without a session mykplan redirects to online.adp.com: fetch follows it across origins and fails with a CORS
// TypeError, never an opaqueredirect (review 2026-11-22). A failed request therefore asks once, without following
// redirects, whether the session is still there; an ended one pauses the run instead of hours of retries
async function send(fetcher: Fetcher, path: string, init: RequestInit): Promise<Response> {
  try {
    return await fetcher(path, init);
  } catch (err) {
    if ((await probeSession(fetcher as typeof fetch)) === 'expired') throw new SessionExpired();
    throw err;
  }
}

async function checked(res: Response): Promise<Response> {
  if (res.type === 'opaqueredirect' || expiredUrl(res.url)) throw new SessionExpired();
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${res.url}`);
  return res;
}

export async function getText(path: string, fetcher: Fetcher = fetch): Promise<{ url: string; text: string }> {
  const res = await checked(await send(fetcher, path, { credentials: 'include', cache: 'no-store' }));
  const text = await res.text();
  if (/<input[^>]+type=["']?password/i.test(text) || AUTH_HOLD.test(text)) throw new SessionExpired();
  return { url: res.url, text };
}

export async function getBytes(path: string, fetcher: Fetcher = fetch): Promise<{ type: string; bytes: Uint8Array }> {
  const res = await checked(await send(fetcher, path, { credentials: 'include', cache: 'no-store' }));
  return { type: res.headers.get('content-type') ?? '', bytes: new Uint8Array(await res.arrayBuffer()) };
}

// hidden inputs (view state) of a page, read with a regex so it also runs where DOMParser is missing (tests)
export function hiddenFields(html: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /<input[^>]*type=["']?hidden["']?[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const tag = m[0];
    const name = tag.match(/name=["']([^"']+)["']/i)?.[1];
    const value = tag.match(/value=["']([^"']*)["']/i)?.[1] ?? '';
    if (name) out[name] = value.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  }
  return out;
}

// GET the form page for a fresh __VIEWSTATE (the plan section 11), then POST it with the given fields.
// `formHtml` reuses a page already in hand (journal Detail postbacks must post the list page they came from)
export async function postForm(
  path: string,
  fields: Record<string, string>,
  opts: { fetcher?: Fetcher; formHtml?: string } = {},
): Promise<{ url: string; text: string; formHtml: string }> {
  if (!READ_ONLY_POSTS.some((re) => re.test(path))) throw new Error(`refusing to post ${path}: not a read-only query form`);
  const fetcher = opts.fetcher ?? fetch;
  const formHtml = opts.formHtml ?? (await getText(path, fetcher)).text;
  const body = new URLSearchParams();
  const hidden = hiddenFields(formHtml);
  Object.keys(hidden).forEach((k) => body.set(k, hidden[k]!));
  Object.keys(fields).forEach((k) => body.set(k, fields[k]!));
  const res = await checked(await send(fetcher, path, { method: 'POST', credentials: 'include', body, cache: 'no-store' }));
  const text = await res.text();
  if (AUTH_HOLD.test(text)) throw new SessionExpired();
  return { url: res.url, text, formHtml };
}

// Statements, Quicken and journal Detail answer a postback with a script that opens the real resource:
// window.open('StatementPDF.aspx?rand=...'). Returns that address resolved against the posting page
export function windowOpenTarget(html: string, name: RegExp, pageUrl: string): string | null {
  const re = /window\.open\s*\(\s*['"]([^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const target = m[1]!.replace(/&amp;/g, '&');
    if (name.test(target)) return new URL(target, pageUrl).toString();
  }
  return null;
}

// "The ending date must be prior to or equal to the last price date: 11/20/2026" and other ErrorP texts
export function siteError(url: string, html: string): string | null {
  if (!/ErrorP\.aspx/i.test(url)) return null;
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  return text.match(/(The date range cannot exceed[^.]*|The ending date must be[^.]*\.\s*[\d/]*|[^.]{0,80}error[^.]{0,80})/i)?.[1]?.trim() ?? 'site error page';
}

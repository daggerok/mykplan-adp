/// <reference lib="esnext" />
// Writing the mykplan_* tabs from the mykplan tab while a run goes (the plan, section 9; the twitter way): the viewer
// hands over its Google token and the spreadsheet id through Tampermonkey storage after ☁️ and on every silent
// renew; requests to sheets.googleapis.com go through GM_xmlhttpRequest (page CSP and CORS do not apply)
import type { Dataset } from '../../shared/dataset';
import { SheetsClient, type FetchLike } from '../../shared/sheets/client';
import { pushAll } from '../../src/app/sheetsSync';
import { derive } from '../../src/app/derive';

export const GOOGLE_KEY = 'mykplan-adp.google'; // JSON { token, expiresAt, spreadsheetId }
export interface GoogleHandoff { token: string; expiresAt: number; spreadsheetId: string }

type GmRequest = (d: {
  method: string; url: string; headers?: Record<string, string>; data?: string; responseType?: 'text';
  onload: (r: { status: number; responseText: string; responseHeaders: string }) => void;
  onerror: (e: unknown) => void; ontimeout?: () => void; timeout?: number;
}) => void;

// a fetch over GM_xmlhttpRequest returning a real Response, so the shared Sheets client works unchanged
export function gmFetch(request: GmRequest): FetchLike {
  return (input, init) => new Promise<Response>((resolve, reject) => {
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((v, k) => { headers[k] = v; });
    request({
      method: init?.method ?? 'GET', url: input, headers, data: typeof init?.body === 'string' ? init.body : undefined, responseType: 'text', timeout: 30000,
      onload: (r) => {
        const h = new Headers();
        r.responseHeaders.split(/\r?\n/).forEach((line) => { const i = line.indexOf(':'); if (i > 0) h.append(line.slice(0, i).trim(), line.slice(i + 1).trim()); });
        resolve(new Response(r.status === 204 ? null : r.responseText, { status: r.status || 200, headers: h }));
      },
      onerror: () => reject(new Error(`network error: ${input}`)),
      ontimeout: () => reject(new Error(`timeout: ${input}`)),
    });
  });
}

// a token is used only with a minute left; otherwise the data waits for the viewer (☁️ or its silent renew)
export function usableHandoff(raw: unknown, now: number): GoogleHandoff | null {
  if (typeof raw !== 'string') return null;
  try {
    const g = JSON.parse(raw) as GoogleHandoff;
    return g.token && g.spreadsheetId && g.expiresAt - now > 60_000 ? g : null;
  } catch {
    return null;
  }
}

export async function writeFromUserscript(ds: Dataset, g: GoogleHandoff, fetcher: FetchLike, log: (line: string) => void): Promise<void> {
  const client = new SheetsClient({
    fetch: fetcher,
    spreadsheetId: g.spreadsheetId,
    // no renew here: an expired token fails clearly and the data waits for the viewer
    getToken: async (force) => { if (force) throw new Error('the Google token expired: open the viewer, it renews it'); return g.token; },
  });
  await pushAll(client, ds, ds.dailyFunds.length ? derive(ds) : null, log);
}

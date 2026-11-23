/// <reference types="bun" />
/// <reference types="node" />
/// <reference lib="esnext" />
// Content-Security-Policy of the built viewer (the plan section 8): only the benchmark feed hosts and Google.
// Added at build time, not in src/index.html: the dev server injects its own hot-reload scripts.
// The inline theme script is allowed by its sha256, nothing else inline runs
import { createHash } from 'node:crypto';

export const CONNECT = [
  "'self'",
  'https://daggerok.github.io',
  'https://raw.githubusercontent.com',
  'https://cdn.jsdelivr.net',
  'https://sheets.googleapis.com',
  'https://oauth2.googleapis.com',
  'https://www.googleapis.com',
];

export function inlineScriptHashes(html: string): string[] {
  const out: string[] = [];
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) out.push(`'sha256-${createHash('sha256').update(m[1]!, 'utf8').digest('base64')}'`);
  return out;
}

export function cspFor(html: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' ${inlineScriptHashes(html).join(' ')} https://accounts.google.com/gsi/client`,
    "style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style",
    "font-src 'self' data:",
    "img-src 'self' data: https://*.googleusercontent.com",
    `connect-src ${CONNECT.join(' ')}`,
    'frame-src https://accounts.google.com',
    "base-uri 'self'",
    "form-action 'none'",
  ].join('; ');
}

export function withCsp(html: string): string {
  const meta = `<meta http-equiv="Content-Security-Policy" content="${cspFor(html)}" />`;
  const out = html.replace(/<meta charset=["']?utf-8["']?\s*\/?>/i, (m) => `${m}\n    ${meta}`);
  // a page without its policy must not ship (review 2026-11-22: a rewritten charset tag skipped it silently)
  if (out === html) throw new Error('CSP: no <meta charset="utf-8"> in the built page, the policy could not be added');
  return out;
}

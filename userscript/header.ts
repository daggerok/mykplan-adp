/// <reference lib="esnext" />
// Tampermonkey header of dist/mykplan-adp-sync.user.js (scripts/build-userscript.ts puts it in front of the bundle)
// the viewer lives on public GitHub Pages since 2026-11-22; the old GitLab Pages address keeps working meanwhile
export const PAGES_URL = 'https://daggerok.github.io/mykplan-adp/';
export const OLD_PAGES_URL = 'https://daggerok.gitlab.io/mykplan-adp/';
export const MYKPLAN_URL = 'https://mykplan.adp.com/ParticipantSecure_Net/';
export const DEV_URL = 'http://localhost:1234/';
// the ADP sign-in page: the script acts there only for the optional re-login (userscript/src/signin.ts)
export const SIGNIN_URL = 'https://online.adp.com/signin/';
export const USERSCRIPT_FILE = 'mykplan-adp-sync.user.js';

// dev: the dev-server build also runs on http://localhost:1234; the published script does not (review 2026-11-22:
// port 1234 is the default of other local apps too, any of them would receive the 401k data)
export function userscriptHeader(version: string, dev = false): string {
  return [
    '// ==UserScript==',
    '// @name         mykplan-adp sync',
    '// @namespace    https://gitlab.com/daggerok/mykplan-adp', // kept: Tampermonkey tells scripts apart by name and namespace
    `// @version      ${version}`,
    '// @description  Reads your own ADP mykplan 401k pages in your logged-in browser (read only) and hands the data to the mykplan-adp viewer',
    '// @author       daggerok',
    `// @homepageURL  ${PAGES_URL}`,
    `// @match        ${MYKPLAN_URL}*`,
    `// @match        ${PAGES_URL}*`,
    `// @match        ${OLD_PAGES_URL}*`,
    ...(dev ? [`// @match        ${DEV_URL}*`] : []),
    `// @match        ${SIGNIN_URL}*`,
    '// @run-at       document-end',
    '// @noframes',
    '// @grant        GM_getValue',
    '// @grant        GM_setValue',
    '// @grant        GM_deleteValue',
    '// @grant        GM_addValueChangeListener',
    '// @grant        GM_notification',
    '// @grant        GM_xmlhttpRequest',
    '// @connect      sheets.googleapis.com',
    '// ==/UserScript==',
    '',
  ].join('\n');
}

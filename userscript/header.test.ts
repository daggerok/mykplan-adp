/// <reference types="bun" />
/// <reference types="node" />
/// <reference lib="esnext" />
import { expect, test } from 'bun:test';
import { DEV_URL, MYKPLAN_URL, OLD_PAGES_URL, PAGES_URL, SIGNIN_URL, userscriptHeader } from './header';

test('header matches mykplan, the Pages viewer and localhost, read-only grants', () => {
  const h = userscriptHeader('1.2.3');
  expect(h.startsWith('// ==UserScript==')).toBe(true);
  expect(h).toContain('// ==/UserScript==');
  expect(h).toContain('// @version      1.2.3');
  for (const u of [MYKPLAN_URL, PAGES_URL, OLD_PAGES_URL, SIGNIN_URL]) expect(h).toContain(`// @match        ${u}*`);
  // localhost only in the dev-server build
  expect(h).not.toContain(DEV_URL);
  expect(userscriptHeader('1.2.3', true)).toContain(`// @match        ${DEV_URL}*`);
  expect(h).toContain('// @connect      sheets.googleapis.com');
});

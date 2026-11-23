/// <reference types="bun" />
/// <reference types="node" />
/// <reference lib="esnext" />
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, beforeAll, expect, test } from 'bun:test';

beforeAll(() => GlobalRegistrator.register({ url: 'https://mykplan.adp.com/ParticipantSecure_Net/AccountHighlights.aspx' }));
afterAll(() => GlobalRegistrator.unregister());

test('minimize to a small icon with the progress, restore, remembered', async () => {
  const { mountBadge, MIN_KEY } = await import('./badge');
  localStorage.removeItem(MIN_KEY);
  document.body.innerHTML = '';
  const actions: string[] = [];
  const badge = mountBadge('9.9.9', (a) => actions.push(a));
  const host = document.getElementById('mykplan-adp-badge')!;
  const root = host.shadowRoot!;
  const q = (s: string) => root.querySelector<HTMLElement>(s)!;
  expect(host.dataset.minimized).toBe('no');
  badge.status('full running: 8/1037 · journal/2026-11-22.html');
  q('[data-m="minimize"]').click();
  expect(q('.b').hidden).toBe(true);
  expect(q('.mini').hidden).toBe(false);
  expect(q('.ml').textContent).toBe('8/1037');
  expect(localStorage.getItem(MIN_KEY)).toBe('1');
  badge.status('full done: 1037/1037\ndone');
  expect(q('.ml').textContent).toBe('✓');
  q('[data-m="restore"]').click();
  expect(q('.b').hidden).toBe(false);
  expect(localStorage.getItem(MIN_KEY)).toBe('0');
  q('[data-a="full"]').click();
  expect(actions).toEqual(['full']);
  // a new page (next mykplan page load) starts minimized when it was left minimized
  localStorage.setItem(MIN_KEY, '1');
  document.body.innerHTML = '';
  mountBadge('9.9.9', () => {});
  expect(document.getElementById('mykplan-adp-badge')!.dataset.minimized).toBe('yes');
});

test('the saved login is shown masked on the panel, the password only as stars', async () => {
  const { mountBadge, maskUser } = await import('./badge');
  expect(maskUser('john.example')).toBe('joh****');
  expect(maskUser('ab')).toBe('a****');
  document.body.innerHTML = '';
  let saved: string | null = null;
  mountBadge('9.9.9', () => {}, { saved: () => saved, save: (u) => { saved = u; }, forget: () => { saved = null; } });
  const root = document.getElementById('mykplan-adp-badge')!.shadowRoot!;
  const line = () => root.querySelector<HTMLElement>('[data-login-line]')!.textContent;
  expect(line()).toContain('not saved');
  root.querySelector<HTMLInputElement>('.lu')!.value = 'john.example';
  root.querySelector<HTMLInputElement>('.lp')!.value = 'secret-pass';
  root.querySelector<HTMLElement>('[data-m="login-save"]')!.click();
  expect(line()).toBe('🔑 login saved: joh**** / *****');
  expect(line()).not.toContain('secret');
  expect(root.querySelector<HTMLInputElement>('.lp')!.value).toBe('');
  root.querySelector<HTMLElement>('[data-m="login-forget"]')!.click();
  expect(line()).toContain('not saved');
});

test('one item per line, the panel keeps its width, important lines wrap', async () => {
  const { mountBadge } = await import('./badge');
  document.body.innerHTML = '';
  const badge = mountBadge('9.9.9', () => {});
  const root = document.getElementById('mykplan-adp-badge')!.shadowRoot!;
  badge.status('sync running: 14/889\nstep: qfx/2025-05-12_2026-05-11.qfx\nfailed: 2\n!qfx/2023-05-12_2024-05-11.qfx: no Quicken download link (Maximum 12-month period)');
  const lines = Array.from(root.querySelectorAll<HTMLElement>('.st > div'));
  expect(lines.map((l) => l.className)).toEqual(['', '', '', 'imp']);
  expect(lines[3]!.textContent).toBe('qfx/2023-05-12_2024-05-11.qfx: no Quicken download link (Maximum 12-month period)');
  expect(lines[1]!.title).toBe('step: qfx/2025-05-12_2026-05-11.qfx');
  expect(root.querySelector('style')!.textContent).toContain('width: 440px');
});

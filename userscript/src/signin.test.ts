/// <reference types="bun" />
/// <reference types="node" />
/// <reference lib="esnext" />
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, beforeAll, expect, test } from 'bun:test';

beforeAll(() => GlobalRegistrator.register({ url: 'https://online.adp.com/signin/v1/?APPID=401K' }));
afterAll(() => GlobalRegistrator.unregister());

const LOGIN = { user: 'someone', pass: 'secret' };

test('two-step sign-in: user first, then the password; one-time code stops it', async () => {
  const { signinStep } = await import('./signin');
  const ALL = { user: true, pass: true };
  const clicks: string[] = [];
  document.body.innerHTML = '<form><input id="login-form_username" autocomplete="username"><button type="button" id="next">Next</button></form>';
  document.getElementById('next')!.addEventListener('click', () => clicks.push('next'));
  let typed = '';
  document.getElementById('login-form_username')!.addEventListener('input', (e) => { typed = (e.target as HTMLInputElement).value; });
  expect(signinStep(document, LOGIN, ALL)).toBe('filled-user');
  expect(typed).toBe('someone');
  expect(clicks).toEqual(['next']);
  // not allowed now (a recent attempt): nothing is typed
  document.body.innerHTML = '<input id="u" autocomplete="username"><button>Next</button>';
  expect(signinStep(document, LOGIN, { user: false, pass: false })).toBe('too-soon');
  expect((document.getElementById('u') as HTMLInputElement).value).toBe('');

  document.body.innerHTML = '<input type="password" id="pw"><button type="submit" id="go">Sign In</button>';
  document.getElementById('go')!.addEventListener('click', () => clicks.push('sign in'));
  expect(signinStep(document, LOGIN, ALL)).toBe('filled-pass');
  expect((document.getElementById('pw') as HTMLInputElement).value).toBe('secret');
  expect(clicks).toEqual(['next', 'sign in']);

  document.body.innerHTML = '<input autocomplete="one-time-code" id="otp"><button>Verify</button>';
  expect(signinStep(document, LOGIN, ALL)).toBe('mfa');
  expect((document.getElementById('otp') as HTMLInputElement).value).toBe('');
});

test('fields inside an open shadow root (web components)', async () => {
  const { findFields } = await import('./signin');
  document.body.innerHTML = '<sdf-input id="host"></sdf-input>';
  const root = document.getElementById('host')!.attachShadow({ mode: 'open' });
  root.innerHTML = '<input type="email" id="inner">';
  expect(findFields(document).user?.id).toBe('inner');
});

test('planSignin: one user step per 30 min, one password per flow', async () => {
  const { planSignin, ATTEMPT_GAP_MS } = await import('./signin');
  const T = 10 * ATTEMPT_GAP_MS;
  // nothing yet: a flow may start, a one-page form may send its password
  expect(planSignin({ flowAt: 0, passAt: 0 }, T)).toEqual({ user: true, pass: true });
  // user typed 10 s ago, no password yet: the password page of this flow may send it once
  expect(planSignin({ flowAt: T - 10_000, passAt: 0 }, T)).toEqual({ user: false, pass: true });
  // the password of this flow was sent (wrong password, the page came back): nothing more for 30 min
  expect(planSignin({ flowAt: T - 20_000, passAt: T - 10_000 }, T)).toEqual({ user: false, pass: false });
  expect(planSignin({ flowAt: T - 20_000, passAt: T - 10_000 }, T + ATTEMPT_GAP_MS)).toEqual({ user: true, pass: true });
});

test('a form shown again after our password is a refused password; only the 401k sign-in is used', async () => {
  const { passwordRefused, isPlanSignin } = await import('./signin');
  const now = 10_000_000;
  document.body.innerHTML = '<input id="u" autocomplete="username"><input type="password" id="p"><button>Sign In</button>';
  // this flow sent its password a minute ago and the form is back: refused
  expect(passwordRefused(document, { flowAt: now - 120_000, passAt: now - 60_000 }, now)).toBe(true);
  // the password step of a fresh flow (no password sent yet): not refused
  expect(passwordRefused(document, { flowAt: now - 10_000, passAt: 0 }, now)).toBe(false);
  // an old attempt (hours ago) says nothing about this page
  expect(passwordRefused(document, { flowAt: now - 7_200_000, passAt: now - 7_100_000 }, now)).toBe(false);
  // a one-time code page after the password is not a refusal
  document.body.innerHTML = '<input autocomplete="one-time-code">';
  expect(passwordRefused(document, { flowAt: now - 120_000, passAt: now - 60_000 }, now)).toBe(false);
  expect(isPlanSignin('?APPID=401K&productId=1')).toBe(true);
  expect(isPlanSignin('?APPID=WFNPortal')).toBe(false);
  expect(isPlanSignin('')).toBe(false);
});

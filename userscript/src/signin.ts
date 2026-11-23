/// <reference lib="esnext" />
// Optional automatic re-login on https://online.adp.com/signin (owner 2026-11-22: "if there are no username / pwd,
// then it will expect that we already logined"). The login lives only in this script's Tampermonkey storage
// (GM_setValue, visible to this script only, never in the repo, the viewer or Sheets).
// Safety: it acts only when a run asked for it (resume flag), at most one attempt per 30 minutes (no lockout),
// and stops at any one-time code (MFA): the owner types that. The sign-in markup is not known yet, so fields are
// found by their meaning (autocomplete, type, id, label), also inside open shadow roots (ADP uses web components)
export interface Login { user: string; pass: string }

export const ATTEMPT_GAP_MS = 30 * 60 * 1000;

export type SigninStep = 'mfa' | 'filled-user' | 'filled-pass' | 'nothing' | 'too-soon';

function deepAll(root: Document | ShadowRoot | Element, selector: string): HTMLElement[] {
  const out: HTMLElement[] = [];
  const visit = (r: Document | ShadowRoot | Element) => {
    r.querySelectorAll<HTMLElement>(selector).forEach((el) => out.push(el));
    r.querySelectorAll('*').forEach((el) => { if (el.shadowRoot) visit(el.shadowRoot); });
  };
  visit(root);
  return out;
}

const visible = (el: HTMLElement) => !el.hasAttribute('hidden') && el.getAttribute('aria-hidden') !== 'true' && (el as HTMLInputElement).type !== 'hidden' && !(el as HTMLInputElement).disabled;
const label = (el: HTMLElement) => `${el.id} ${el.getAttribute('name') ?? ''} ${el.getAttribute('autocomplete') ?? ''} ${el.getAttribute('aria-label') ?? ''} ${el.getAttribute('placeholder') ?? ''}`.toLowerCase();

export function findFields(doc: Document) {
  const inputs = deepAll(doc, 'input').filter(visible) as HTMLInputElement[];
  const code = inputs.find((i) => /one-time-code|otp|passcode|verification|\bcode\b/.test(label(i)));
  const pass = inputs.find((i) => i.type === 'password');
  const user = inputs.find((i) => i !== pass && i !== code && (/username|user ?id|login|email/.test(label(i)) || i.type === 'email'));
  const buttons = deepAll(doc, 'button, [role="button"], input[type="submit"], sdf-button').filter(visible);
  const submit = buttons.find((b) => /^(sign in|log in|next|continue|submit)$/i.test((b.textContent || (b as HTMLInputElement).value || '').trim()))
    ?? buttons.find((b) => (b as HTMLButtonElement).type === 'submit');
  return { user, pass, code, submit };
}

// set a value the way a person typing would: native setter + input and change events (frameworks listen to them)
export function typeInto(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value')?.set;
  if (setter) setter.call(input, value); else input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  input.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
}

// allow: what this page may do now (decided by the caller from the Tampermonkey storage marks, see planSignin):
// the user name once per 30 minutes, the password once per flow, right after its user name step
export function signinStep(doc: Document, login: Login, allow: { user: boolean; pass: boolean }): SigninStep {
  const f = findFields(doc);
  if (f.code) return 'mfa';
  if (f.pass && !f.pass.value) {
    if (!allow.pass) return 'too-soon';
    if (f.user && !f.user.value) typeInto(f.user, login.user);
    typeInto(f.pass, login.pass);
    f.submit?.click();
    return 'filled-pass';
  }
  if (f.user && !f.user.value) {
    if (!allow.user) return 'too-soon';
    typeInto(f.user, login.user);
    f.submit?.click();
    return 'filled-user';
  }
  return 'nothing';
}

export const FLOW_MS = 2 * 60 * 1000;

// marks kept in Tampermonkey storage across the sign-in pages: when the last flow started (user name typed) and
// when a password was last sent. A flow may send one password within 2 minutes of its start; a new flow may start
// once per 30 minutes. A page where only a password field shows (one-page form) counts as a new flow
export function planSignin(marks: { flowAt: number; passAt: number }, now: number): { user: boolean; pass: boolean } {
  const newFlowOk = now - marks.flowAt >= ATTEMPT_GAP_MS;
  const inFlow = now - marks.flowAt < FLOW_MS && marks.passAt < marks.flowAt;
  return { user: newFlowOk, pass: inFlow || (newFlowOk && now - marks.passAt >= ATTEMPT_GAP_MS) };
}

// a sign-in form shown again after this flow already sent its password (within 10 minutes) means the saved password
// was refused: no more tries until the owner saves a login again (review 2026-11-22: after a password change the old
// one was retried every 30 minutes for hours)
export function passwordRefused(doc: Document, marks: { flowAt: number; passAt: number }, now: number): boolean {
  const f = findFields(doc);
  const formAgain = (!!f.pass && !f.pass.value) || (!!f.user && !f.user.value);
  return formAgain && !f.code && marks.passAt >= marks.flowAt && marks.passAt > 0 && now - marks.passAt < 10 * 60 * 1000;
}

// only the 401k sign-in: the same page signs in to other ADP products (review 2026-11-22); seen live: ?APPID=401K
export const isPlanSignin = (search: string): boolean => /[?&]APPID=401K(&|$)/i.test(search);

/// <reference types="bun" />
/// <reference types="node" />
/// <reference lib="esnext" />
// A masked settings value is shown only by 👁: a click or focus on the dots keeps it hidden (owner 2026-11-22)
import { afterAll, beforeAll, expect, test } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';

beforeAll(() => {
  GlobalRegistrator.register({ url: 'https://daggerok.github.io/mykplan-adp/' });
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterAll(() => GlobalRegistrator.unregister());

test('click and focus keep the dots, 👁 shows the value for editing and hides it again', async () => {
  const { act } = await import('react');
  const { createRoot } = await import('react-dom/client');
  const { MaskedField } = await import('../src/ui/react/MaskedField');
  const secret = '1234567890-abcdefghijk.apps.googleusercontent.com';
  document.body.innerHTML = '<div id="root"></div>';
  const root = createRoot(document.getElementById('root')!);
  await act(async () => root.render(<MaskedField label="Client ID" value={secret} mask={(v) => `${v.slice(0, 4)}••••`} placeholder="" onChange={() => {}} />));
  const input = () => document.querySelector<HTMLInputElement>('input')!;
  const eye = () => document.querySelector<HTMLButtonElement>('button')!;
  expect(input().value).toBe('1234••••');
  await act(async () => { input().click(); input().focus(); });
  expect(input().value).toBe('1234••••');
  expect(input().readOnly).toBe(true);
  await act(async () => eye().click());
  expect(input().value).toBe(secret);
  expect(input().readOnly).toBe(false);
  await act(async () => eye().click());
  expect(input().value).toBe('1234••••');
  await act(async () => root.unmount());
});

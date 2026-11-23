/// <reference types="bun" />
/// <reference types="node" />
/// <reference lib="esnext" />
import { expect, test } from 'bun:test';
import { COMMAND_MAX_AGE_MS, freshCommand } from './command';

test('a command is used only while fresh and well formed', () => {
  const now = 1_000_000;
  expect(freshCommand(JSON.stringify({ mode: 'full', at: now - 1000 }), now)).toEqual({ mode: 'full', at: now - 1000 });
  expect(freshCommand(JSON.stringify({ mode: 'sync', at: now - COMMAND_MAX_AGE_MS }), now)).toBeNull();
  expect(freshCommand(JSON.stringify({ mode: 'delete', at: now }), now)).toBeNull();
  expect(freshCommand('{broken', now)).toBeNull();
  expect(freshCommand(null, now)).toBeNull();
});

test('another tab running blocks a second run; this tab, a stale or a finished run does not', async () => {
  const { otherTabRun } = await import('./main-helpers');
  const now = 1_000_000;
  const run = (o: object) => JSON.stringify({ status: 'running', done: 5, total: 10, at: now - 1000, tab: 'other', ...o });
  expect(otherTabRun(run({}), now, 'me')).toBe('5/10');
  expect(otherTabRun(run({ tab: 'me' }), now, 'me')).toBeNull();
  expect(otherTabRun(run({ at: now - 5 * 60 * 1000 }), now, 'me')).toBeNull();
  expect(otherTabRun(run({ status: 'done' }), now, 'me')).toBeNull();
  expect(otherTabRun(null, now, 'me')).toBeNull();
});

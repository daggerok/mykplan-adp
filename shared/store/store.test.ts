/// <reference types="bun" />
/// <reference types="node" />
/// <reference lib="esnext" />
import { expect, test } from 'bun:test';
import { createStore } from '.';

test('set notifies, same value does not, unsubscribe stops', () => {
  const s = createStore(1);
  let n = 0;
  const off = s.subscribe(() => n++);
  s.set(2);
  s.set((v) => v + 1);
  s.set(3);
  expect([s.get(), n]).toEqual([3, 2]);
  off();
  s.set(4);
  expect(n).toBe(2);
});

/// <reference types="bun" />
/// <reference types="node" />
/// <reference lib="esnext" />
import { expect, test } from 'bun:test';
import { isOlder } from './version';

test('version comparison', () => {
  expect(isOlder('0.3.3', '0.4.1')).toBe(true);
  expect(isOlder('0.4.1', '0.4.1')).toBe(false);
  expect(isOlder('0.10.0', '0.9.9')).toBe(false);
  expect(isOlder(null, '0.4.1')).toBe(false);
  expect(isOlder('0.3.3', 'dev')).toBe(false);
});

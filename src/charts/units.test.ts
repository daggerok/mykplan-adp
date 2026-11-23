/// <reference types="bun" />
/// <reference lib="esnext" />
import { expect, test } from 'bun:test';
import { formatUnit, roomFor } from './units';

test('scale labels carry their unit', () => {
  expect(formatUnit('%')(5.234)).toBe('5.23%');
  expect(formatUnit('%')(-12.34)).toBe('-12.3%');
  expect(formatUnit('%')(150)).toBe('150%');
  expect(formatUnit('$')(62033.62)).toBe('$62,034');
  expect(formatUnit('$')(600)).toBe('$600.00');
  expect(formatUnit('index')(139.94)).toBe('139.9');
});

test('room right of the last bar: about 5% of the bars, never less than 3', () => {
  expect(roomFor(0)).toBe(3);
  expect(roomFor(40)).toBe(3);
  expect(roomFor(180)).toBe(9);
  expect(roomFor(900)).toBe(45);
});

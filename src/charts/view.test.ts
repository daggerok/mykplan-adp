/// <reference types="bun" />
/// <reference lib="esnext" />
import { expect, test } from 'bun:test';
import { panned, zoomed } from './view';

test('zoom keeps the middle, a move shifts by a fifth of the width', () => {
  expect(zoomed({ from: 0, to: 100 }, 'in')).toEqual({ from: 15, to: 85 });
  const out = zoomed({ from: 15, to: 85 }, 'out');
  expect(out.from).toBeCloseTo(0, 9);
  expect(out.to).toBeCloseTo(100, 9);
  expect(panned({ from: 0, to: 100 }, 1)).toEqual({ from: 20, to: 120 });
  expect(panned({ from: 0, to: 100 }, -1)).toEqual({ from: -20, to: 80 });
});

/// <reference types="bun" />
/// <reference types="node" />
/// <reference lib="esnext" />
import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_BENCHMARKS, FEEDS } from '../shared/benchmarks/config';

const read = (name: string) => JSON.parse(readFileSync(join(__dirname, '..', 'config', name), 'utf8'));
const benchmarks = read('benchmarks.json') as { default: string[]; feeds: Record<string, unknown> };
const defaults = read('defaults.json') as { forecast: { retireAge: number } };

test('every default benchmark has a feed', () => {
  expect(benchmarks.default).toEqual(['SPY', 'QQQ', 'SMH', 'SOXQ', 'VTV', 'RSP', 'DIVO', 'SCHD']);
  for (const t of benchmarks.default) expect(benchmarks.feeds[t]).toBeDefined();
});

test('defaults carry no personal data (birth date and salary live in config/user.local.json)', () => {
  const text = JSON.stringify(defaults);
  expect(text).not.toMatch(/birth|salary|\d{4}-\d{2}-\d{2}/i);
  expect(defaults.forecast.retireAge).toBe(67);
});

test('shared/benchmarks/config.ts = config/benchmarks.json', () => {
  expect(DEFAULT_BENCHMARKS).toEqual(benchmarks.default);
  expect(FEEDS).toEqual(benchmarks.feeds as typeof FEEDS);
});

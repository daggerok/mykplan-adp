/// <reference types="bun" />
/// <reference types="node" />
/// <reference lib="esnext" />
// Test helper: the trimmed feeds in this folder have the real shape of daggerok.github.io/<Brand>/api/<slug>/funds/<T>/
// (meta.json + history/00N.json), cut to 10-17 rows around one ex-date, with asOf moved to the last row
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FeedInput, RawRow, RawTable } from '../../../shared/benchmarks/types';

export const FIXTURES = __dirname;

export const readJson = (rel: string): Record<string, unknown> => JSON.parse(readFileSync(join(FIXTURES, rel), 'utf8')) as Record<string, unknown>;

export const fixtureExists = (rel: string): boolean => existsSync(join(FIXTURES, rel));

// All pages of a fixture feed merged in page order, as fetchFeed hands them to an adapter
export function loadFixture(ticker: string): FeedInput {
  const meta = readJson(`${ticker}/meta.json`);
  const history = meta.history as { pages: string[] };
  const pages = history.pages.map((p) => readJson(`${ticker}/${p.replace(/^\.\//, '')}`) as unknown as { headers: string[]; rows: RawRow[] });
  const rows: RawRow[] = [];
  pages.forEach((p) => { p.rows.forEach((r) => rows.push(r)); });
  return { ticker, history: { headers: pages[0]!.headers, rows }, distributions: meta.distributions as RawTable | undefined };
}

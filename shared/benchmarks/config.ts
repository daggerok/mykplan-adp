/// <reference lib="esnext" />
// config/benchmarks.json as code: browser files cannot import JSON without a tsconfig (TS2732 in the IDE).
// tests/config.test.ts keeps the two equal
import type { FeedSpec } from './fetchFeed';

export const DEFAULT_BENCHMARKS = ['SPY', 'QQQ', 'SMH', 'SOXQ', 'VTV', 'RSP', 'DIVO', 'SCHD'];

export const FEEDS: Record<string, FeedSpec> = {
  SPY: { brand: 'SPDR', slug: 'spdr', adapter: 'navDist' },
  QQQ: { brand: 'Invesco', slug: 'invesco', adapter: 'yahoo' },
  SOXQ: { brand: 'Invesco', slug: 'invesco', adapter: 'yahoo' },
  RSP: { brand: 'Invesco', slug: 'invesco', adapter: 'yahoo' },
  SMH: { brand: 'VanEck', slug: 'vaneck', adapter: 'navDist' },
  VTV: { brand: 'Vanguard', slug: 'vanguard', adapter: 'vanguard' },
  DIVO: { brand: 'Amplify', slug: 'amplify', adapter: 'yahoo' },
  SCHD: { brand: 'Schwab', slug: 'schwab', adapter: 'yahoo' },
};

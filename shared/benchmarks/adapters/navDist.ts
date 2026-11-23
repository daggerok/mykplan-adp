/// <reference lib="esnext" />
// SPDR (SPY) and VanEck (SMH): official NAV history + the distributions table of meta.json.
// close = NAV, tr reinvests every distribution on its ex-date
import type { AdaptResult, FeedInput } from '../types';
import { distSeries, findHeader, headersOf, missing } from './common';

export function navDist(input: FeedInput): AdaptResult {
  const headers = headersOf(input.history);
  const date = findHeader(headers, [/^date$/i, /date/i]);
  const nav = findHeader(headers, [/^nav$/i, /net asset value/i]);
  if (!date) return missing(input.ticker, 'Date', headers);
  if (!nav) return missing(input.ticker, 'NAV', headers);
  return distSeries(input, { date, close: nav, nav });
}

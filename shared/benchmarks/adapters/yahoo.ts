/// <reference lib="esnext" />
// Invesco (QQQ, SOXQ, RSP), Amplify (DIVO), Schwab (SCHD): Yahoo daily Close + Adj Close.
// close = Close, tr = Adj Close scaled so it starts at the first close
import type { AdaptResult, FeedInput } from '../types';
import { adjSeries, findHeader, headersOf, missing } from './common';

export function yahoo(input: FeedInput): AdaptResult {
  const headers = headersOf(input.history);
  const date = findHeader(headers, [/^date$/i, /date/i]);
  const close = findHeader(headers, [/^close$/i]);
  const adj = findHeader(headers, [/^adj\.? ?close$/i, /adj(usted)?\.? ?close/i]);
  if (!date) return missing(input.ticker, 'Date', headers);
  if (!close) return missing(input.ticker, 'Close', headers);
  if (!adj) return missing(input.ticker, 'Adj Close', headers);
  return adjSeries(input, { date, close, adj });
}

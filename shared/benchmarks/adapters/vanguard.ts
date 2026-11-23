/// <reference lib="esnext" />
// Vanguard (VTV): Open, High, Low, Close, Adj Close (Yahoo) + official NAV on recent rows.
// OHLC as is, tr = Adj Close scaled to the first close, nav where the row has it.
// Month-end rows that carry only a NAV (weekends) have no Close and are skipped with a warning
import type { AdaptResult, FeedInput } from '../types';
import { adjSeries, findHeader, headersOf, missing } from './common';

export function vanguard(input: FeedInput): AdaptResult {
  const headers = headersOf(input.history);
  const date = findHeader(headers, [/^date$/i, /date/i]);
  const close = findHeader(headers, [/^close$/i]);
  const adj = findHeader(headers, [/^adj\.? ?close$/i]);
  if (!date) return missing(input.ticker, 'Date', headers);
  if (!close) return missing(input.ticker, 'Close', headers);
  if (!adj) return missing(input.ticker, 'Adj Close', headers);
  return adjSeries(input, {
    date, close, adj,
    open: findHeader(headers, [/^open$/i]),
    high: findHeader(headers, [/^high$/i]),
    low: findHeader(headers, [/^low$/i]),
    nav: findHeader(headers, [/^nav$/i]),
  });
}

/// <reference lib="esnext" />
// Any feed, columns picked by header names: Date; Close (else Market Price, Price, NAV); optional Open, High,
// Low, NAV. tr from Adj Close when there is one, else from the distributions, else tr = close (price return,
// reported in warnings)
import type { AdaptResult, FeedInput } from '../types';
import { adjSeries, distSeries, findHeader, headersOf, missing } from './common';

export function generic(input: FeedInput): AdaptResult {
  const headers = headersOf(input.history);
  const date = findHeader(headers, [/^date$/i, /^as ?of( date)?$/i, /date/i]);
  const close = findHeader(headers, [/^close$/i, /^(market )?price$/i, /^close price$/i, /^nav$/i, /net asset value/i]);
  if (!date) return missing(input.ticker, 'Date', headers);
  if (!close) return missing(input.ticker, 'Close, Price or NAV', headers);
  const cols = {
    date, close,
    open: findHeader(headers, [/^open$/i]),
    high: findHeader(headers, [/^high$/i]),
    low: findHeader(headers, [/^low$/i]),
    nav: findHeader(headers, [/^nav$/i, /net asset value/i]),
  };
  const adj = findHeader(headers, [/^adj\.? ?close$/i, /adj(usted)?\.? ?close/i]);
  if (adj) return adjSeries(input, { date, close, adj, open: cols.open, high: cols.high, low: cols.low, nav: cols.nav });
  const r = distSeries(input, cols);
  if (!input.distributions || !input.distributions.rows.length) {
    r.warnings.unshift(`${input.ticker}: no Adj Close and no distributions, tr is the price return of ${close}`);
  }
  return r;
}

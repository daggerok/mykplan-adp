/// <reference lib="esnext" />
// Two facts about saved history that the plan alone cannot know:
// 1. firstActivity: the account has no balances before its first transaction, so day and month pages before it are
//    empty on the site (seen live: weeks of pages without a fund table before the first contribution). They are not
//    asked and not counted as failures
// 2. backdated: a closed day or month is never asked again, but ADP can post a transaction with an earlier date.
//    Every run asks the open year window anyway; its transactions are compared with the saved month pages of the
//    same dates. The first date where they differ makes every month and day page from that date on stale
import type { Transaction } from '../../../shared/model';

export interface SavedWindow { key: string; from: string; to: string; tx: Transaction[] }

// "tx/fund/month/2026-06-01_2026-06-30.html" -> its window
export function windowOfKey(key: string): { from: string; to: string } | null {
  const m = key.match(/(\d{4}-\d{2}-\d{2})_(\d{4}-\d{2}-\d{2})\.html$/);
  return m ? { from: m[1]!, to: m[2]! } : null;
}

// the date a page ends on: a day page is its own day, a window page its last day
export function keyEnd(key: string): string | null {
  const day = key.match(/^tx\/day\/(\d{4}-\d{2}-\d{2})\.html$/)?.[1];
  return day ?? windowOfKey(key)?.to ?? null;
}

export const firstActivity = (tx: Transaction[]): string | null =>
  tx.reduce<string | null>((min, t) => (min === null || t.activityDate < min ? t.activityDate : min), null);

const count = (tx: Transaction[], lo: string, hi: string) => {
  const m = new Map<string, Transaction>();
  const n = new Map<string, number>();
  tx.forEach((t) => {
    if (t.activityDate < lo || t.activityDate > hi) return;
    m.set(t.id, t);
    n.set(t.id, (n.get(t.id) ?? 0) + 1);
  });
  return { m, n };
};

// the earliest date where the fresh year window and a saved month page disagree, or null
export function backdatedFrom(fresh: { from: string; to: string; tx: Transaction[] }, saved: SavedWindow[]): string | null {
  let first: string | null = null;
  saved.forEach((w) => {
    const lo = w.from > fresh.from ? w.from : fresh.from;
    const hi = w.to < fresh.to ? w.to : fresh.to;
    if (lo > hi) return;
    const a = count(fresh.tx, lo, hi);
    const b = count(w.tx, lo, hi);
    const ids = new Set(Array.from(a.n.keys()).concat(Array.from(b.n.keys())));
    ids.forEach((id) => {
      if ((a.n.get(id) ?? 0) === (b.n.get(id) ?? 0)) return;
      const date = (a.m.get(id) ?? b.m.get(id))!.activityDate;
      if (first === null || date < first) first = date;
    });
  });
  return first;
}

// saved pages whose numbers a change on `from` makes wrong: month pages (both views) ending on or after it and
// every day page from it on. Year windows are not listed: the open one is asked on every run anyway
export const staleKeys = (keys: string[], from: string): string[] =>
  keys.filter((k) => /^tx\/((fund|source)\/month\/|day\/)/.test(k) && (keyEnd(k) ?? '') >= from);

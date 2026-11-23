/// <reference lib="esnext" />
// A run: highlights first (its "As of" day is the last day with prices), the on-demand statement list, then the
// planned steps one by one with pauses. Every saved step is a checkpoint: after a logout, Stop or a closed tab the
// next run plans again and skips what is saved, so it continues where it ended (the plan section 11)
import { parseProfile } from '../../../shared/parse/profile';
import { SessionExpired } from '../http';
import type { RawStore } from '../rawStore';
import { pause as defaultPause, withBackoff } from '../throttle';
import { executeStep, listStatementQuarters, validRaw, type Ctx } from './execute';
import { parseTxPrint } from '../../../shared/parse/txPrint';
import { backdatedFrom, firstActivity, keyEnd, staleKeys, windowOfKey, type SavedWindow } from './history';
import { HISTORY_START, planSteps, yearWindows, type Step } from './plan';

export type RunStatus = 'running' | 'done' | 'paused' | 'stopped' | 'failed';

export interface Progress {
  mode: 'full' | 'sync';
  status: RunStatus;
  done: number;
  total: number;
  current?: string;
  note?: string; // progress inside the current step
  savedBefore?: number; // pages already saved when this run started (they are not asked again)
  backdated?: string; // ADP changed closed history: the date and how many saved pages are asked again
  emptyBefore?: string; // the account's first transaction: pages before it are empty on the site, not failures
  failed: Array<{ key: string; error: string }>;
  message?: string;
}

export interface RunDeps {
  store: RawStore;
  fetcher?: Ctx['fetcher'];
  parseHtml: (html: string) => Document;
  today: () => string;
  pause?: () => Promise<void>;
  backoffWait?: (ms: number) => Promise<void>;
  shouldStop: () => boolean;
  onProgress: (p: Progress) => void;
}

export async function run(mode: 'full' | 'sync', deps: RunDeps): Promise<Progress> {
  const p: Progress = { mode, status: 'running', done: 0, total: 0, failed: [] };
  const report = () => deps.onProgress({ ...p, failed: p.failed.slice() });
  const pauseFn = deps.pause ?? (() => defaultPause());
  const ctx: Ctx = {
    store: deps.store, fetcher: deps.fetcher, between: pauseFn,
    log: (l) => p.failed.push({ key: 'log', error: l }),
    progress: (note) => { p.note = note; report(); },
  };
  const today = deps.today();
  try {
    const hl: Step = { kind: 'highlights', key: `highlights/${today}.html` };
    await withBackoff(() => executeStep(hl, ctx), { wait: deps.backoffWait });
    const profile = parseProfile(deps.parseHtml((await deps.store.get(hl.key))!.text ?? ''));
    if (!profile) throw new Error('AccountHighlights: no "As of" day');
    await pauseFn();
    const quarters = await withBackoff(() => listStatementQuarters(ctx), { wait: deps.backoffWait });
    // pages saved earlier without their table (the 2026-11-22 hold pages) count as missing and are asked again
    const saved = new Set<string>();
    let broken = 0;
    for (const key of await deps.store.keys()) {
      if (!key.startsWith('tx/')) { saved.add(key); continue; }
      const e = await deps.store.get(key);
      if (validRaw(key, e?.text)) saved.add(key); else broken++;
    }
    if (broken) p.note = `${broken} saved pages had no data (hold pages): asking them again`;
    const txOf = async (key: string): Promise<SavedWindow | null> => {
      const w = windowOfKey(key);
      const e = w && (await deps.store.get(key));
      return w && e?.text ? { key, ...w, tx: parseTxPrint(deps.parseHtml(e.text), w).transactions } : null;
    };
    // the first year window holds the account's first transaction (saved on an earlier run)
    const firstYear = (await deps.store.keys(`tx/fund/year/${HISTORY_START}_`)).filter((k) => saved.has(k)).pop();
    const firstDayOf = async (key: string | undefined) => (key ? firstActivity((await txOf(key))?.tx ?? []) : null);
    let firstDay = await firstDayOf(firstYear);

    // the open year window first: compared with the saved month pages it shows transactions ADP posted later
    // with an earlier date; every page from that date on is then asked again
    const years = yearWindows(HISTORY_START, profile.asOf);
    const open = years[years.length - 1]!;
    const openStep: Step = { kind: 'txWindow', key: `tx/fund/year/${open.from}_${open.to}.html`, view: 'fund', from: open.from, to: open.to };
    p.total = 2;
    p.done = 1;
    p.current = openStep.key;
    report();
    await pauseFn();
    try {
      await withBackoff(() => executeStep(openStep, ctx), { wait: deps.backoffWait });
      const fresh = await txOf(openStep.key);
      const months = (await Promise.all(Array.from(saved).filter((k) => k.startsWith('tx/fund/month/') && (keyEnd(k) ?? '') >= open.from).map(txOf)))
        .filter((w): w is SavedWindow => !!w);
      const from = fresh ? backdatedFrom(fresh, months) : null;
      if (from) {
        const stale = staleKeys(Array.from(saved), from);
        for (const k of stale) { await deps.store.delete(k); saved.delete(k); }
        p.backdated = `ADP changed history from ${from}: ${stale.length} saved pages are asked again`;
      }
      if (years.length === 1) firstDay = firstActivity(fresh?.tx ?? []);
    } catch (err) {
      if (err instanceof SessionExpired) throw err;
      p.failed.push({ key: openStep.key, error: err instanceof Error ? err.message : String(err) });
    }
    p.savedBefore = saved.size;
    saved.add(openStep.key);
    const steps = planSteps({ mode, lastPriceDay: profile.asOf, today, saved: (k) => saved.has(k), statementQuarters: quarters, firstDay })
      .filter((s) => s.kind !== 'highlights' && s.key !== openStep.key);
    p.total = steps.length + 2;
    p.done = 2;
    report();
    for (const step of steps) {
      if (deps.shouldStop()) { p.status = 'stopped'; p.message = 'stopped: press Sync or Full to continue'; report(); return p; }
      p.current = step.key;
      p.note = undefined;
      report();
      await pauseFn();
      try {
        await withBackoff(() => executeStep(step, ctx), {
          wait: deps.backoffWait,
          // a retry is visible on the panel, not a silent minute on one line
          onRetry: (n, err) => { p.note = `retry ${n} of 3 after: ${err instanceof Error ? err.message : String(err)}`.slice(0, 160); report(); },
        });
      } catch (err) {
        if (err instanceof SessionExpired) throw err;
        // one broken step never stops the run; its raw is missing, the next run tries it again
        p.failed.push({ key: step.key, error: err instanceof Error ? err.message : String(err) });
      }
      p.done++;
      p.note = undefined;
      report();
    }
    // a first run learns the first transaction only now: pages before it were empty, not broken
    firstDay ??= await firstDayOf((await deps.store.keys(`tx/fund/year/${HISTORY_START}_`)).pop());
    if (firstDay) {
      const day = firstDay;
      const empty = p.failed.filter((f) => /has no "Activity by/.test(f.error) && (keyEnd(f.key) ?? '9') < day);
      if (empty.length) p.failed = p.failed.filter((f) => empty.indexOf(f) < 0);
      p.emptyBefore = day;
    }
    p.status = 'done';
    p.current = undefined;
    p.message = p.failed.length ? `done, ${p.failed.length} step(s) failed (they are tried again next run)` : 'done';
  } catch (err) {
    if (err instanceof SessionExpired) { p.status = 'paused'; p.message = 'session expired: log in to mykplan and press Continue'; }
    else { p.status = 'failed'; p.message = err instanceof Error ? err.message : String(err); }
  }
  report();
  return p;
}

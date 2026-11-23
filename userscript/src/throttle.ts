/// <reference lib="esnext" />
// Requests go one at a time with a pause between them (M1: 1 s pauses, ~45 requests, no refusal or logout);
// a failed request is retried after 5, 15 and 60 s. An expired session is not retried: the run pauses instead
import { SessionExpired, SiteError } from './http';

export const PAUSE_MS: [number, number] = [1000, 2000];
export const BACKOFF_S = [5, 15, 60];

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
export const pause = (range: [number, number] = PAUSE_MS, rnd: () => number = Math.random) =>
  sleep(range[0] + Math.round((range[1] - range[0]) * rnd()));

export async function withBackoff<T>(fn: () => Promise<T>, opts: { delays?: number[]; wait?: (ms: number) => Promise<void>; onRetry?: (n: number, err: unknown) => void } = {}): Promise<T> {
  const delays = opts.delays ?? BACKOFF_S;
  const wait = opts.wait ?? sleep;
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof SessionExpired || err instanceof SiteError || attempt >= delays.length) throw err;
      opts.onRetry?.(attempt + 1, err);
      await wait(delays[attempt]! * 1000);
    }
  }
}

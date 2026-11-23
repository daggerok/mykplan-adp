/// <reference lib="esnext" />
// small pure helpers of main.ts (main.ts runs on import, so its logic that tests need lives here)

// a live run of another tab (updated within 2 minutes): its "n/total", else null (review 2026-11-22: one run per
// browser, a second mykplan tab would switch the server-side choices of the first)
export function otherTabRun(raw: string | null, now: number, self: string): string | null {
  if (!raw) return null;
  try {
    const r = JSON.parse(raw) as { status?: string; at?: number; tab?: string; done?: number; total?: number };
    return r.status === 'running' && r.tab && r.tab !== self && typeof r.at === 'number' && now - r.at < 2 * 60 * 1000 ? `${r.done}/${r.total}` : null;
  } catch {
    return null;
  }
}

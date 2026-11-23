/// <reference lib="esnext" />
// Commands from the viewer toolbar (⬇ Sync, 🔄 Full, ⏹ Stop, like the twitter viewer): the viewer page posts them,
// the bridge stores them in Tampermonkey storage, the mykplan tab picks them up. A command is used once and only
// while fresh, so an old click never starts a run days later
export type Command = { mode: 'sync' | 'full' | 'stop'; at: number };

export const COMMAND_KEY = 'mykplan-adp.command';
export const COMMAND_MAX_AGE_MS = 2 * 60 * 1000;

export function freshCommand(raw: unknown, now: number): Command | null {
  if (typeof raw !== 'string') return null;
  try {
    const c = JSON.parse(raw) as Command;
    if ((c.mode !== 'sync' && c.mode !== 'full' && c.mode !== 'stop') || typeof c.at !== 'number') return null;
    return now - c.at >= 0 && now - c.at < COMMAND_MAX_AGE_MS ? c : null;
  } catch {
    return null;
  }
}

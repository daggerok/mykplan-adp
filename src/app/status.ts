/// <reference lib="esnext" />
// Status of the two outside parts the viewer talks to. The userscript bridge marks the page with
// <html data-mykplan-adp-userscript="<version>"> (userscript/src/bridge.ts); Google comes in M9
export type Status = 'ok' | 'off' | 'pending';

export const USERSCRIPT_MARK = 'mykplanAdpUserscript';

export function userscriptVersion(root: { dataset: DOMStringMap }): string | null {
  return root.dataset[USERSCRIPT_MARK] ?? null;
}

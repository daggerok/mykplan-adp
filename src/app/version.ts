/// <reference lib="esnext" />
// The version of this viewer build (= the script it serves); "dev" on the dev server, where define is not applied
declare const __APP_VERSION__: string | undefined;
export const APP_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';

// "0.3.3" < "0.4.1"; anything unparsable is never called outdated
export function isOlder(installed: string | null, current: string): boolean {
  const parse = (v: string) => (/^\d+\.\d+\.\d+$/.test(v) ? v.split('.').map(Number) : null);
  const a = installed ? parse(installed) : null;
  const b = parse(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i]! < b[i]!;
  return false;
}

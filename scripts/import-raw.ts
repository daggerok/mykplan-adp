/// <reference types="bun" />
/// <reference types="node" />
/// <reference lib="esnext" />
// Moves what the userscript saved into data/raw/ of this clone: the 📦 Raw archives
// (~/Downloads/mykplan-adp-raw-*.zip, unpacked with `unzip -n`) and loose files under ~/Downloads/mykplan-adp/raw/.
// data/ is gitignored: statements and raw pages never reach a remote. Existing files are never overwritten:
// closed periods are downloaded once and kept for good (the plan section 0)
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, relative } from 'node:path';

export function importRaw(from: string, to: string): { copied: string[]; skipped: string[] } {
  const copied: string[] = [];
  const skipped: string[] = [];
  if (!existsSync(from)) return { copied, skipped };
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const src = join(dir, name);
      if (statSync(src).isDirectory()) { walk(src); continue; }
      const rel = relative(from, src);
      const dst = join(to, rel);
      if (existsSync(dst)) { skipped.push(rel); continue; }
      mkdirSync(dirname(dst), { recursive: true });
      copyFileSync(src, dst);
      copied.push(rel);
    }
  };
  walk(from);
  return { copied, skipped };
}

// every mykplan-adp-raw-*.zip of a folder, oldest first; -n never overwrites a file already in data/raw
export function importZips(dir: string, to: string): string[] {
  if (!existsSync(dir)) return [];
  const zips = readdirSync(dir).filter((n) => /^mykplan-adp-raw-.*\.zip$/.test(n)).sort();
  mkdirSync(to, { recursive: true });
  zips.forEach((n) => execFileSync('unzip', ['-q', '-n', join(dir, n), '-d', to]));
  return zips;
}

if (require.main === module) {
  const downloads = process.env.RAW_DOWNLOADS ?? join(homedir(), 'Downloads');
  const from = process.env.RAW_FROM ?? join(downloads, 'mykplan-adp', 'raw');
  const to = join(__dirname, '..', 'data', 'raw');
  const zips = importZips(downloads, to);
  const { copied, skipped } = importRaw(from, to);
  console.log(`${zips.length} archive(s) unpacked into ${to}; ${from}: ${copied.length} copied, ${skipped.length} already there`);
}

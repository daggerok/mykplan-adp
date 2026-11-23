/// <reference types="bun" />
/// <reference types="node" />
/// <reference lib="esnext" />
import { expect, test } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { lang, t } from '.';
import { RU } from './ru';

const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  if (p === __dirname) return []; // this folder explains t() in comments
  return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f) ? [p] : [];
});
const SRC = join(__dirname, '..', '..');
// t('...'), t("...") and t(`...`) with a plain literal as the first argument
const KEYS = /\bt\(\s*(['"`])((?:\\.|(?!\1).)*)\1/g;
const unescape = (s: string) => s.replace(/\\(['"`\\])/g, '$1');

test('every t() text in src has a Russian line, and no key is built at run time', () => {
  const missing: string[] = [];
  const dynamic: string[] = [];
  files(SRC).forEach((f) => {
    const src = readFileSync(f, 'utf8');
    let m: RegExpExecArray | null;
    KEYS.lastIndex = 0;
    while ((m = KEYS.exec(src))) {
      const key = unescape(m[2]!);
      if (m[1] === '`' && key.includes('${')) { dynamic.push(`${f}: ${key}`); continue; }
      if (!(key in RU)) missing.push(`${f.slice(SRC.length + 1)}: ${key}`);
    }
  });
  expect(dynamic).toEqual([]);
  expect(missing).toEqual([]);
});

test('placeholders are filled in both languages; a missing Russian line falls back to English', () => {
  RU['Beat {cmp} in {n}'] = 'Лучше {cmp} в {n}';
  lang.set('en');
  expect(t('Beat {cmp} in {n}', { cmp: 'SPY', n: 3 })).toBe('Beat SPY in 3');
  lang.set('ru');
  expect(t('Beat {cmp} in {n}', { cmp: 'SPY', n: 3 })).toBe('Лучше SPY в 3');
  expect(t('no such line')).toBe('no such line');
  lang.set('en');
  delete RU['Beat {cmp} in {n}'];
});

test('Russian lines keep the placeholders of their English text', () => {
  const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(',');
  const wrong = Object.keys(RU).filter((k) => ph(k) !== ph(RU[k]!));
  expect(wrong).toEqual([]);
});

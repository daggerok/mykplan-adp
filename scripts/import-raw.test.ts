/// <reference types="bun" />
/// <reference types="node" />
/// <reference lib="esnext" />
import { afterAll, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { zip } from '../shared/zip';
import { importRaw, importZips } from './import-raw';

const work = mkdtempSync(join(__dirname, '..', '.import-raw-test-'));
afterAll(() => rmSync(work, { recursive: true, force: true }));

test('copies new files with their folders and never overwrites', () => {
  const from = join(work, 'from');
  const to = join(work, 'to');
  mkdirSync(join(from, 'statements'), { recursive: true });
  writeFileSync(join(from, 'statements', 'q1.pdf'), 'new');
  writeFileSync(join(from, 'tx.html'), 'tx');
  mkdirSync(to, { recursive: true });
  writeFileSync(join(to, 'tx.html'), 'kept');
  const r = importRaw(from, to);
  expect(r.copied).toEqual([join('statements', 'q1.pdf')]);
  expect(r.skipped).toEqual(['tx.html']);
  expect(readFileSync(join(to, 'tx.html'), 'utf8')).toBe('kept');
  expect(importRaw(join(work, 'missing'), to)).toEqual({ copied: [], skipped: [] });
});

test('raw archives are unpacked without overwriting', () => {
  const dl = join(work, 'dl');
  const to = join(work, 'zipto');
  mkdirSync(dl, { recursive: true });
  mkdirSync(join(to, 'tx'), { recursive: true });
  writeFileSync(join(to, 'tx', 'a.html'), 'kept');
  writeFileSync(join(dl, 'mykplan-adp-raw-2026-11-21.zip'), zip([
    { name: 'tx/a.html', data: new TextEncoder().encode('new') },
    { name: 'tx/b.html', data: new TextEncoder().encode('b') },
  ]));
  writeFileSync(join(dl, 'other.zip'), 'not ours');
  expect(importZips(dl, to)).toEqual(['mykplan-adp-raw-2026-11-21.zip']);
  expect(readFileSync(join(to, 'tx', 'a.html'), 'utf8')).toBe('kept');
  expect(readFileSync(join(to, 'tx', 'b.html'), 'utf8')).toBe('b');
});

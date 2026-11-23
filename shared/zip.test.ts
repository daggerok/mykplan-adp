/// <reference types="bun" />
/// <reference types="node" />
/// <reference lib="esnext" />
import { afterAll, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { crc32, zip } from './zip';

const work = mkdtempSync(join(__dirname, '..', '.zip-test-'));
afterAll(() => rmSync(work, { recursive: true, force: true }));

test('crc32 of a known string', () => {
  expect(crc32(new TextEncoder().encode('123456789')).toString(16)).toBe('cbf43926');
});

test('unzip accepts the archive and restores folders and bytes', () => {
  const pdf = new Uint8Array([37, 80, 68, 70, 45, 0, 255, 10]);
  const file = join(work, 'raw.zip');
  writeFileSync(file, zip([
    { name: 'tx/day/2024-06-14.html', data: new TextEncoder().encode('<html>day</html>') },
    { name: 'stmt/2023-09-30.pdf', data: pdf },
  ]));
  execFileSync('unzip', ['-t', '-q', file]);
  execFileSync('unzip', ['-q', '-n', file, '-d', join(work, 'out')]);
  expect(readFileSync(join(work, 'out', 'tx', 'day', '2024-06-14.html'), 'utf8')).toBe('<html>day</html>');
  expect(new Uint8Array(readFileSync(join(work, 'out', 'stmt', '2023-09-30.pdf')))).toEqual(pdf);
});

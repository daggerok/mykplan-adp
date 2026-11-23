/// <reference types="bun" />
/// <reference types="node" />
/// <reference lib="esnext" />
import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cspFor, inlineScriptHashes, withCsp } from './csp';

const html = readFileSync(join(__dirname, '..', 'src', 'index.html'), 'utf8');

test('the inline theme script is allowed by its hash, module scripts by self', () => {
  const body = html.match(/<script id="theme-boot">([\s\S]*?)<\/script>/)![1]!;
  const hash = `'sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}'`;
  expect(inlineScriptHashes(html)).toEqual([hash]);
  expect(cspFor(html)).toContain(`script-src 'self' ${hash} https://accounts.google.com/gsi/client`);
  expect(cspFor(html)).toContain('connect-src \'self\' https://daggerok.github.io');
  expect(cspFor(html)).not.toContain("'unsafe-eval'");
});

test('the meta goes right after the charset', () => {
  const out = withCsp(html);
  expect(out.indexOf('Content-Security-Policy')).toBeGreaterThan(out.indexOf('charset'));
  expect(out.indexOf('Content-Security-Policy')).toBeLessThan(out.indexOf('<title>'));
});

test('a page without the charset meta fails the build instead of shipping without a policy', () => {
  expect(() => withCsp('<html><head><title>x</title></head></html>')).toThrow('CSP');
  expect(withCsp("<meta charset='UTF-8'><title>x</title>")).toContain('Content-Security-Policy');
});

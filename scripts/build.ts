/// <reference types="bun" />
/// <reference types="node" />
/// <reference lib="esnext" />
// Production build: viewer -> dist/ (HTML entry, Tailwind through bun-plugin-tailwind) + the userscript.
// BASE sets the public path (build:pages uses /mykplan-adp/ for https://daggerok.github.io/mykplan-adp/);
// OUTDIR builds elsewhere (local checks use .check/out, ignored by git)
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import tailwind from 'bun-plugin-tailwind';
import { buildUserscript } from './build-userscript';
import { withCsp } from './csp';

async function main(): Promise<void> {
  const root = join(__dirname, '..');
  const outdir = process.env.OUTDIR ? join(root, process.env.OUTDIR) : join(root, 'dist');
  const base = process.env.BASE ?? '/';
  const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version: string };

  rmSync(outdir, { recursive: true, force: true });
  const result = await Bun.build({
    entrypoints: [join(root, 'src/index.html')],
    outdir,
    publicPath: base,
    minify: true,
    sourcemap: 'linked',
    target: 'browser',
    plugins: [tailwind],
    // the viewer compares its own version with the installed script and offers the update
    define: { 'process.env.NODE_ENV': '"production"', __APP_VERSION__: JSON.stringify(version) },
  });
  if (!result.success) {
    result.logs.forEach((log) => console.error(String(log)));
    throw new Error('viewer build failed');
  }
  result.outputs.forEach((o) => console.log(`${o.path.replace(`${root}/`, '')}  ${o.size ?? ''}`));
  const page = join(outdir, 'index.html');
  writeFileSync(page, withCsp(readFileSync(page, 'utf8')));
  await buildUserscript(outdir);
}

main().catch((err: unknown) => { console.error(err); process.exitCode = 1; });

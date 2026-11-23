/// <reference types="bun" />
/// <reference types="node" />
/// <reference lib="esnext" />
// Dev server on http://localhost:1234 (port fixed: userscript @match and Google OAuth origins use it).
// HTML import + hot reload; Tailwind comes from bunfig.toml [serve.static] plugins
import { buildUserscript } from './build-userscript';
import { sampleDataset } from '../shared/sample';

async function main(): Promise<void> {
  // dynamic import: a default import of *.html needs esModuleInterop in the IDE (no tsconfig)
  const index = ((await import('../src/index.html')) as unknown as { default: Bun.HTMLBundle }).default;
  // the dev build also matches http://localhost:1234 (the published one does not)
  const file = await buildUserscript(undefined, true);
  const server = Bun.serve({
    port: Number(process.env.PORT ?? 1234),
    development: { hmr: true, console: true },
    routes: {
      '/mykplan-adp-sync.user.js': () => new Response(Bun.file(file), { headers: { 'content-type': 'text/javascript; charset=utf-8' } }),
      // made-up data for a look at the viewer without real data (dev server only, never built into dist)
      '/dev/sample-dataset.json': () => Response.json(sampleDataset()),
      '/*': index,
    },
  });
  console.log(`viewer: ${server.url}`);
}

main().catch((err: unknown) => { console.error(err); process.exitCode = 1; });

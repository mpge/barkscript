import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { BarkError, formatError } from '../src/errors.js';
import { run } from '../src/run.js';

const root = resolve(import.meta.dirname);
const browserBuild = resolve(root, '..', 'dist', 'browser');
const siteProgram = resolve(root, 'site.bark');

/**
 * The HTML pages are not written by hand: website/site.bark builds them.
 * Run it with the BarkScript runtime and write each page it woofs.
 */
async function generatePages(): Promise<string[]> {
  const source = readFileSync(siteProgram, 'utf8');
  let output = '';
  try {
    const { exitCode } = await run(source, { filename: 'site.bark', io: { write: (text) => (output += text) } });
    if (exitCode !== 0) throw new Error(`site.bark played dead with exit code ${exitCode}.\n${output}`);
  } catch (error) {
    if (error instanceof BarkError) throw new Error(`site.bark did not compile.\n\n${formatError(error, source, 'website/site.bark')}`);
    throw error;
  }
  const pages = JSON.parse(output) as Array<{ file: string; html: string }>;
  for (const page of pages) writeFileSync(resolve(root, page.file), page.html);
  return pages.map((page) => page.file);
}

/** Regenerate the pages when site.bark changes during `npm run site:dev`. */
function barkPages(): Plugin {
  return {
    name: 'barkscript-pages',
    configureServer(server) {
      server.watcher.add(siteProgram);
      server.watcher.on('change', async (file) => {
        if (resolve(file) !== siteProgram) return;
        try {
          await generatePages();
          server.ws.send({ type: 'full-reload' });
        } catch (error) {
          server.config.logger.error(String((error as Error).message));
        }
      });
    },
  };
}

/** Serve the browser build at /barkscript.min.js, so pages can load BarkScript from barkscript.com. */
function browserScript(): Plugin {
  return {
    name: 'barkscript-browser-script',
    closeBundle() {
      const outDir = resolve(root, 'dist');
      for (const file of ['barkscript.min.js', 'barkscript.min.js.map', 'barkscript.mjs', 'barkscript.mjs.map']) {
        const from = resolve(browserBuild, file);
        if (!existsSync(from)) throw new Error(`Run "npm run build:browser" first: ${from} is missing.`);
        mkdirSync(outDir, { recursive: true });
        copyFileSync(from, resolve(outDir, file));
      }
    },
  };
}

export default defineConfig(async () => {
  const pages = await generatePages();
  return {
    root,
    base: './',
    plugins: [barkPages(), browserScript()],
    build: {
      outDir: resolve(root, 'dist'),
      emptyOutDir: true,
      rollupOptions: {
        input: Object.fromEntries(pages.map((file) => [file.replace(/\.html$/, ''), resolve(root, file)])),
      },
    },
    server: { fs: { allow: [resolve(root, '..')] } },
    worker: { format: 'es' as const },
  };
});

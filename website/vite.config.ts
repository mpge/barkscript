import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

const root = resolve(import.meta.dirname);
const browserBuild = resolve(root, '..', 'dist', 'browser');

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

export default defineConfig({
  root,
  base: './',
  plugins: [browserScript()],
  build: {
    outDir: resolve(root, 'dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(root, 'index.html'),
        docs: resolve(root, 'docs.html'),
      },
    },
  },
  server: { fs: { allow: [resolve(root, '..')] } },
  worker: { format: 'es' },
});

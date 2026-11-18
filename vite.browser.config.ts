import { resolve } from 'node:path';
import { defineConfig } from 'vite';

/** The browser build: one script tag, then <script type="text/barkscript"> anywhere on the page. */
export default defineConfig({
  build: {
    outDir: resolve(import.meta.dirname, 'dist/browser'),
    emptyOutDir: true,
    target: 'es2020',
    sourcemap: true,
    lib: {
      entry: resolve(import.meta.dirname, 'src/browser.ts'),
      name: 'BarkScript',
      formats: ['iife', 'es'],
      fileName: (format) => (format === 'iife' ? 'barkscript.min.js' : 'barkscript.mjs'),
    },
  },
});

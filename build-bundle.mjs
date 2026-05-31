// build-bundle.mjs
// Script untuk membundle nsfwjs + model weights ke satu file
// yang bisa dipakai di Chrome Extension Offscreen Document

import { build } from 'esbuild';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, 'chrome-extension', 'lib');

// ── Bundle nsfwjs (include model weights) ───────────────────────────────
console.log('Building nsfwjs bundle with embedded model weights...');
await build({
  entryPoints: ['build-entry.js'],
  bundle: true,
  outfile: path.join(outDir, 'nsfwjs-bundle.js'),
  format: 'iife',
  // PENTING: globalName harus 'nsfwShieldLib' agar cocok dengan yang dicek di offscreen.js
  // (typeof nsfwShieldLib !== 'undefined')
  globalName: 'nsfwShieldLib',
  platform: 'browser',
  minify: false,           // Jangan minify agar lebih mudah debug; bisa diubah ke true setelah OK
  keepNames: true,         // Jaga nama fungsi agar model registry lookup tidak rusak
  define: {
    'process.env.NODE_ENV': '"production"',
  },
  // Resolve node_modules dari project root
  nodePaths: [path.join(__dirname, 'node_modules')],
});

console.log('✅ Bundle created: chrome-extension/lib/nsfwjs-bundle.js');


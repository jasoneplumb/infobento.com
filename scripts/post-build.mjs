#!/usr/bin/env node
/**
 * Post-build: copy non-TS data files from each package's src/ to dist/.
 *
 * tsc doesn't copy JSON or other static assets. The fallback bundles for
 * the quote/joke/horoscope endpoints (loaded at runtime via readFileSync)
 * need to live next to the compiled .js files at deploy time.
 */

import { cpSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(fileURLToPath(import.meta.url), '../..');

let copied = 0;

/**
 * Walk a src/ directory and copy any non-.ts/.tsx files into the matching
 * dist/ directory, preserving relative structure.
 */
function copyStaticAssets(srcDir, dstDir) {
  if (!existsSync(srcDir)) return;
  for (const entry of readdirSync(srcDir)) {
    const srcPath = join(srcDir, entry);
    const dstPath = join(dstDir, entry);
    const s = statSync(srcPath);
    if (s.isDirectory()) {
      copyStaticAssets(srcPath, dstPath);
    } else if (!entry.endsWith('.ts') && !entry.endsWith('.tsx')) {
      mkdirSync(dstDir, { recursive: true });
      cpSync(srcPath, dstPath);
      copied++;
    }
  }
}

const packages = ['api', 'core', 'renderer'];

for (const pkg of packages) {
  const src = join(repoRoot, 'packages', pkg, 'src');
  const dist = join(repoRoot, 'packages', pkg, 'dist');
  if (!existsSync(dist)) continue;
  copyStaticAssets(src, dist);
}

console.log(`post-build: copied ${copied} static asset(s) into dist/`);

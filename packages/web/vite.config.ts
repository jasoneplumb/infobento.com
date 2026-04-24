import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const pkg = JSON.parse(
  readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf8'),
) as { version: string };

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:4000',
    },
  },
  build: {
    outDir: 'dist',
  },
  resolve: {
    alias: {
      // pngjs is Node-only (uses Buffer); the web preview renders via <canvas>
      // instead of PNG, so we stub the import to avoid bundling issues.
      pngjs: fileURLToPath(new URL('./src/stubs/pngjs.ts', import.meta.url)),
      // ttf-font.ts uses node:fs to load font files; stub it for browser builds.
      // The web preview will call the API server for rendered frames instead.
      '../src/ttf-font.js': fileURLToPath(new URL('./src/stubs/ttf-font.ts', import.meta.url)),
      '../../renderer/src/ttf-font.js': fileURLToPath(
        new URL('./src/stubs/ttf-font.ts', import.meta.url),
      ),
    },
  },
});

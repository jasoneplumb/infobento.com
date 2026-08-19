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
    rollupOptions: {
      input: {
        // Multi-page build: the editor SPA plus the standalone setup guide.
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        'setup-guide': fileURLToPath(new URL('./setup-guide.html', import.meta.url)),
      },
    },
  },
});

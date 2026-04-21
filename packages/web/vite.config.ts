import { defineConfig } from 'vite';

export default defineConfig({
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
      pngjs: '/dev/null',
    },
  },
});

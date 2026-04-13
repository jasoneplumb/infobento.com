/**
 * Intent: Hono HTTP server serving both API routes and the built web UI
 * Context: In dev, only API runs here (Vite proxies /api). In prod, serves everything.
 * Pattern: Same-port architecture — static files + API from one server (like phasebot)
 * Future: Add serveStatic for production, WebSocket for live preview
 */

import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serveStatic } from '@hono/node-server/serve-static';
import { serve } from '@hono/node-server';
import { generateFrame, validateConfig } from './index.js';
import { DISPLAY_WIDTH, DISPLAY_HEIGHT } from '@infobento/core';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = new Hono();

app.use('/*', cors());

// --- API routes ---

app.get('/api/health', (c) => {
  return c.json({ status: 'ok', version: '0.1.0' });
});

app.get('/api/box-types', (c) => {
  return c.json([
    { type: 'weather', label: 'Weather', requiresAuth: false },
    { type: 'quote', label: 'Daily Quote', requiresAuth: false },
    { type: 'countdown', label: 'Countdown', requiresAuth: false },
    { type: 'qr', label: 'QR Code', requiresAuth: false },
    { type: 'text', label: 'Static Text', requiresAuth: false },
    { type: 'calendar', label: 'Calendar', requiresAuth: true },
    { type: 'tasks', label: 'Tasks', requiresAuth: true },
    { type: 'stocks', label: 'Stocks', requiresAuth: true },
  ]);
});

app.post('/api/validate', async (c) => {
  const config = await c.req.json();
  return c.json(validateConfig(config));
});

app.post('/api/render', async (c) => {
  const config = await c.req.json();
  const validation = validateConfig(config);
  if (!validation.valid) {
    return c.json({ error: 'Invalid config', details: validation.errors }, 400);
  }
  const frame = generateFrame(config);
  return new Response(frame.data, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'X-Frame-Width': String(frame.width),
      'X-Frame-Height': String(frame.height),
    },
  });
});

// --- Static file serving (production) ---

const webDist = resolve(__dirname, '../../web/dist');
if (existsSync(webDist)) {
  app.use('/*', serveStatic({ root: '../../web/dist' }));

  // SPA fallback: serve index.html for non-API routes
  app.use('*', serveStatic({ root: '../../web/dist', path: 'index.html' }));
}

// --- Start server ---

const port = parseInt(process.env['PORT'] ?? '4000', 10);
const host = process.env['HOST'] ?? '127.0.0.1';

serve({ fetch: app.fetch, port, hostname: host }, (info) => {
  console.log(`InfoBento API listening on http://${info.address}:${info.port}`);
  console.log(`  Health:    http://${info.address}:${info.port}/api/health`);
  console.log(`  Display:   ${DISPLAY_WIDTH}x${DISPLAY_HEIGHT} 1-bit`);
});

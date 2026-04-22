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
import { generateFrame, generatePreview, validateConfig } from './index.js';
import { DISPLAY_WIDTH, DISPLAY_HEIGHT } from '@infobento/core';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = new Hono();

app.use('/*', cors());

// --- API routes ---

app.get('/api/health', (c) => {
  return c.json({ status: 'ok', version: '0.2.0' });
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

app.post('/api/preview', async (c) => {
  const config = await c.req.json();
  const validation = validateConfig(config);
  if (!validation.valid) {
    return c.json({ error: 'Invalid config', details: validation.errors }, 400);
  }
  const rawScale = Number(c.req.query('scale') ?? '3');
  if (!Number.isInteger(rawScale) || rawScale < 1 || rawScale > 8) {
    return c.json({ error: 'scale must be an integer between 1 and 8' }, 400);
  }
  const png = generatePreview(config, rawScale);
  return new Response(png, {
    headers: { 'Content-Type': 'image/png' },
  });
});

app.get('/api/quote', async (c) => {
  try {
    const res = await fetch('https://zenquotes.io/api/random');
    if (!res.ok) {
      return c.json({ error: 'ZenQuotes API returned an error' }, 502);
    }
    const data: unknown = await res.json();
    if (!Array.isArray(data) || data.length === 0) {
      return c.json({ error: 'Unexpected response from ZenQuotes' }, 502);
    }
    const quote = data[0] as { q?: string; a?: string };
    return c.json({ q: quote.q ?? '', a: quote.a ?? '' });
  } catch {
    return c.json({ error: 'Failed to fetch quote from ZenQuotes' }, 502);
  }
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

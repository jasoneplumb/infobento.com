/**
 * Intent: Hono HTTP server serving both API routes and the built web UI
 * Context: In dev, only API runs here (Vite proxies /api). In prod, serves everything.
 * Pattern: Same-port architecture — static files + API from one server (like phasebot)
 * Future: Add serveStatic for production, WebSocket for live preview
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Read version from package.json at startup
const __pkgPath = resolve(dirname(fileURLToPath(import.meta.url)), '../package.json');
const __version = JSON.parse(readFileSync(__pkgPath, 'utf8')).version as string;
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serveStatic } from '@hono/node-server/serve-static';
import { serve } from '@hono/node-server';
import {
  generateFrame,
  generatePreview,
  generateDualFrame,
  generateDualPreview,
  validateConfig,
} from './index.js';
import { DISPLAY_WIDTH, DISPLAY_HEIGHT } from '@infobento/core';
import { pickFallbackQuote, pickFallbackJoke, pickFallbackHoroscope } from './fallback/index.js';
import { createAccount, getDb, type OAuthProvider } from './db.js';
import { clearSessionCookie, issueSessionCookie, readSession } from './auth/session.js';
import {
  createAuthenticationOptions,
  createRegistrationOptions,
  verifyAuthentication,
  verifyRegistration,
} from './auth/passkey.js';
import {
  buildAuthorizationRequest,
  handleOAuthCallback,
  readOAuthCredentials,
  redirectUriFor,
} from './auth/oauth.js';
import { setCookie, getCookie, deleteCookie } from 'hono/cookie';
import {
  formatHttpDate,
  getDeviceConfigForPull,
  getDeviceFrameForPull,
  parseOrientation,
} from './device.js';
import { consumeToken } from './rate-limit.js';
import { createPairHandler } from './pair.js';
import {
  createListDevicesHandler,
  createPutDeviceConfigHandler,
  createUnpairDeviceHandler,
} from './me.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = new Hono();

app.use('/*', cors());

// --- API routes ---

app.get('/api/health', (c) => {
  return c.json({ status: 'ok', version: __version });
});

app.get('/api/box-types', (c) => {
  return c.json([
    { type: 'weather', label: 'Weather', requiresAuth: false },
    { type: 'quote', label: 'Daily Quote', requiresAuth: false },
    { type: 'horoscope', label: 'Horoscope', requiresAuth: false },
    { type: 'joke', label: 'Joke', requiresAuth: false },
    { type: 'onthisday', label: 'On This Day', requiresAuth: false },
    { type: 'stocks', label: 'Stocks', requiresAuth: false },
    { type: 'countdown', label: 'Countdown', requiresAuth: false },
    { type: 'qr', label: 'QR Code', requiresAuth: false },
    { type: 'text', label: 'Static Text', requiresAuth: false },
  ]);
});

app.post('/api/validate', async (c) => {
  const body: unknown = await c.req.json();
  return c.json(validateConfig(body));
});

app.post('/api/render', async (c) => {
  const body: unknown = await c.req.json();
  const validation = validateConfig(body);
  if (!validation.valid) {
    return c.json({ error: 'Invalid config', details: validation.errors }, 400);
  }
  const config = body as import('@infobento/core').BentoConfig;
  const frame = generateFrame(config);
  return new Response(frame.data as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'X-Frame-Width': String(frame.width),
      'X-Frame-Height': String(frame.height),
    },
  });
});

app.post('/api/preview', async (c) => {
  const body = await c.req.json();
  // Preview skips validation for live editing — renderer handles missing data with placeholders
  const config = body as import('@infobento/core').BentoConfig;
  const rawScale = Number(c.req.query('scale') ?? '3');
  if (!Number.isInteger(rawScale) || rawScale < 1 || rawScale > 8) {
    return c.json({ error: 'scale must be an integer between 1 and 8' }, 400);
  }

  // Dual mode: return both landscape and portrait as base64 JSON
  const dual = c.req.query('dual');
  if (dual === '1') {
    const pngs = generateDualPreview(config, rawScale);
    return c.json({
      landscape: Buffer.from(pngs.landscape).toString('base64'),
      portrait: Buffer.from(pngs.portrait).toString('base64'),
      landscapeIds: pngs.landscapeIds,
      portraitIds: pngs.portraitIds,
    });
  }

  // Single mode (backward compat)
  const png = generatePreview(config, rawScale);
  return new Response(png as unknown as BodyInit, {
    headers: { 'Content-Type': 'image/png' },
  });
});

app.post('/api/render-dual', async (c) => {
  const body: unknown = await c.req.json();
  const validation = validateConfig(body);
  if (!validation.valid) {
    return c.json({ error: 'Invalid config', details: validation.errors }, 400);
  }
  const config = body as import('@infobento/core').BentoConfig;
  const dual = generateDualFrame(config);
  return c.json({
    landscape: {
      width: dual.landscape.width,
      height: dual.landscape.height,
      data: Buffer.from(dual.landscape.data).toString('base64'),
    },
    portrait: {
      width: dual.portrait.width,
      height: dual.portrait.height,
      data: Buffer.from(dual.portrait.data).toString('base64'),
    },
  });
});

// JokeAPI v2 categories per its live error response (Knock-Knock is NOT one
// of them — the URL path treats hyphens as separators, so it's unreachable).
const VALID_JOKE_CATEGORIES = new Set([
  'Programming',
  'Misc',
  'Pun',
  'Dark',
  'Spooky',
  'Christmas',
]);

/** Title-case the user's category input so it matches JokeAPI casing. */
function normalizeJokeCategory(input: string): string {
  const lower = input.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

const VALID_ONTHISDAY_CATEGORIES = new Set(['events', 'births', 'deaths', 'holidays', 'all']);

interface WikiOnThisDayEntry {
  text?: string;
  year?: number;
}
interface WikiOnThisDayResponse {
  events?: WikiOnThisDayEntry[];
  births?: WikiOnThisDayEntry[];
  deaths?: WikiOnThisDayEntry[];
  holidays?: WikiOnThisDayEntry[];
}

app.get('/api/onthisday', async (c) => {
  const requested = (c.req.query('category') ?? 'events').trim().toLowerCase();
  const category = VALID_ONTHISDAY_CATEGORIES.has(requested) ? requested : 'events';
  try {
    const now = new Date();
    const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(now.getUTCDate()).padStart(2, '0');
    // Wikipedia's /all endpoint returns the union of categories; we then sample
    // from the requested subset (or across all four for category='all').
    const url = `https://api.wikimedia.org/feed/v1/wikipedia/en/onthisday/all/${mm}/${dd}`;
    const res = await fetch(url);
    if (!res.ok) {
      return c.json({ error: 'Wikipedia API returned an error' }, 502);
    }
    const data = (await res.json()) as WikiOnThisDayResponse;
    let pool: WikiOnThisDayEntry[] = [];
    if (category === 'all') {
      pool = [
        ...(data.events ?? []),
        ...(data.births ?? []),
        ...(data.deaths ?? []),
        ...(data.holidays ?? []),
      ];
    } else if (category === 'events') {
      pool = data.events ?? [];
    } else if (category === 'births') {
      pool = data.births ?? [];
    } else if (category === 'deaths') {
      pool = data.deaths ?? [];
    } else if (category === 'holidays') {
      pool = data.holidays ?? [];
    }
    if (pool.length === 0) {
      return c.json({ error: 'No entries found for this date and category' }, 404);
    }
    const pick = pool[Math.floor(Math.random() * pool.length)];
    if (!pick?.text) {
      return c.json({ error: 'Selected entry had no text' }, 502);
    }
    return c.json({
      text: pick.text,
      year: pick.year != null ? String(pick.year) : '',
      category,
    });
  } catch {
    return c.json({ error: 'Failed to fetch On This Day entry' }, 502);
  }
});

app.get('/api/joke', async (c) => {
  const raw = (c.req.query('categories') ?? '').trim();
  let categoriesPath = 'Any';
  if (raw) {
    const valid = raw
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .map(normalizeJokeCategory)
      .filter((s) => VALID_JOKE_CATEGORIES.has(s));
    if (valid.length > 0) categoriesPath = valid.join(',');
  }
  const url =
    `https://v2.jokeapi.dev/joke/${categoriesPath}` +
    `?safe-mode&type=single` +
    `&blacklistFlags=nsfw,religious,political,racist,sexist,explicit`;
  try {
    const res = await fetch(url);
    if (res.ok) {
      const data = (await res.json()) as { error?: boolean; joke?: string; category?: string };
      if (!data.error && data.joke) {
        const text = data.joke.replace(/\s+/g, ' ').trim();
        return c.json({ text, category: data.category ?? '' });
      }
    }
  } catch {
    // fall through to bundled fallback
  }
  const fb = pickFallbackJoke(raw);
  if (fb) {
    return c.json({ text: fb.text, category: fb.category, fallback: true });
  }
  return c.json({ error: 'No joke found matching the criteria' }, 502);
});

const VALID_ZODIAC_SIGNS = new Set([
  'aries',
  'taurus',
  'gemini',
  'cancer',
  'leo',
  'virgo',
  'libra',
  'scorpio',
  'sagittarius',
  'capricorn',
  'aquarius',
  'pisces',
]);

app.get('/api/horoscope', async (c) => {
  const sign = (c.req.query('sign') ?? '').trim().toLowerCase();
  if (!sign || !VALID_ZODIAC_SIGNS.has(sign)) {
    return c.json({ error: 'Invalid or missing zodiac sign' }, 400);
  }
  try {
    const url = `https://api.api-ninjas.com/v1/horoscope?zodiac=${sign}`;
    const res = await fetch(url);
    if (res.ok) {
      const data = (await res.json()) as { sign?: string; date?: string; horoscope?: string };
      if (data.horoscope) {
        return c.json({ sign, text: data.horoscope, date: data.date ?? '' });
      }
    }
  } catch {
    // fall through to bundled fallback
  }
  const fb = pickFallbackHoroscope(sign);
  if (fb) {
    return c.json({ sign: fb.sign, text: fb.text, date: '', fallback: true });
  }
  return c.json({ error: 'Failed to fetch horoscope' }, 502);
});

/** Map a duration preset to a Yahoo Finance chart range + interval pair */
const STOCK_RANGE_MAP: Record<string, { range: string; interval: string }> = {
  '1d': { range: '2d', interval: '1d' },
  '5d': { range: '5d', interval: '1d' },
  '1mo': { range: '1mo', interval: '1d' },
  '3mo': { range: '3mo', interval: '1d' },
  '6mo': { range: '6mo', interval: '1d' },
  '1y': { range: '1y', interval: '1wk' },
  '5y': { range: '5y', interval: '1mo' },
};

app.get('/api/stocks', async (c) => {
  const raw = (c.req.query('symbol') ?? '').trim().toUpperCase();
  // Allow letters/digits/dots/hyphens — covers AAPL, BRK.A, BTC-USD, etc.
  if (!raw || !/^[A-Z][A-Z0-9.-]{0,9}$/.test(raw)) {
    return c.json({ error: 'Invalid or missing symbol' }, 400);
  }
  const durationParam = (c.req.query('duration') ?? '1d').trim();
  const ri = STOCK_RANGE_MAP[durationParam] ?? STOCK_RANGE_MAP['1d'];
  if (!ri) {
    return c.json({ error: 'Invalid duration' }, 400);
  }
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(raw)}?interval=${ri.interval}&range=${ri.range}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; InfoBento/1.0)' },
    });
    if (!res.ok) {
      return c.json({ error: 'Stocks API returned an error' }, 502);
    }
    const data = (await res.json()) as {
      chart?: {
        result?: {
          meta?: { regularMarketPrice?: number; chartPreviousClose?: number };
          indicators?: { quote?: { close?: (number | null)[] }[] };
        }[];
      };
    };
    const result = data.chart?.result?.[0];
    const meta = result?.meta;
    const price = meta?.regularMarketPrice;
    if (price == null) {
      return c.json({ error: 'No quote data available' }, 404);
    }

    // Baseline (start-of-range) price:
    //   1d → previous close from meta (today vs. yesterday).
    //   longer → first non-null close in the returned series.
    let baseline: number | undefined;
    if (durationParam === '1d') {
      baseline = meta?.chartPreviousClose;
    } else {
      const closes = result?.indicators?.quote?.[0]?.close ?? [];
      baseline = closes.find((v): v is number => typeof v === 'number' && Number.isFinite(v));
    }
    if (baseline == null) {
      return c.json({ error: 'No baseline price for duration' }, 404);
    }
    const change = price - baseline;
    const changePercent = baseline !== 0 ? (change / baseline) * 100 : 0;
    return c.json({ price, change, changePercent });
  } catch {
    return c.json({ error: 'Failed to fetch stock quote' }, 502);
  }
});

app.get('/api/quote', async (c) => {
  const tagsParam = c.req.query('tags')?.trim() ?? '';
  const maxLengthParam = c.req.query('maxLength')?.trim() ?? '';

  const url = new URL('https://api.quotable.kurokeita.dev/api/quotes/random');
  if (tagsParam) {
    // Quotable API expects title-cased tag names (e.g. "Wisdom", "Famous Quotes").
    // Normalize each comma-separated tag, title-casing every space-separated word.
    const tags = tagsParam
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0)
      .map((t) =>
        t
          .split(/\s+/)
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
          .join(' '),
      )
      .join(',');
    if (tags) url.searchParams.set('tags', tags);
  }
  if (maxLengthParam && /^\d+$/.test(maxLengthParam)) {
    url.searchParams.set('maxLength', maxLengthParam);
  }
  try {
    const res = await fetch(url.toString());
    if (res.ok) {
      const data: unknown = await res.json();
      if (
        data &&
        typeof data === 'object' &&
        'quote' in data &&
        (data as { quote: unknown }).quote != null &&
        typeof (data as { quote: unknown }).quote === 'object'
      ) {
        const quote = (data as { quote: { content?: string; author?: { name?: string } } }).quote;
        if (quote.content) {
          return c.json({ q: quote.content, a: quote.author?.name ?? '' });
        }
      }
    }
  } catch {
    // fall through to bundled fallback
  }
  const fb = pickFallbackQuote(tagsParam);
  if (fb) {
    return c.json({ q: fb.text, a: fb.author, fallback: true });
  }
  return c.json({ error: 'No quote found matching the criteria' }, 502);
});

// --- Auth routes (issue #73) ---
//
// Passkey is the primary credential. OAuth (Apple, Google) is the fallback.
// Session cookie is decoupled from credential type — adding/removing a
// passkey or OAuth identity does not invalidate sessions.
//
// All endpoints return generic responses to avoid account-existence leaks
// where applicable.

const PENDING_ACCOUNT_COOKIE = 'ib_pending_account';
const PENDING_ACCOUNT_TTL = 15 * 60; // 15 minutes

/**
 * Resolve the account id for a passkey-registration request. Either:
 *  - the user is already signed in (linking a new passkey), OR
 *  - a one-shot pending-account cookie identifies a freshly-created account
 *    that has yet to register its first credential.
 *
 * If neither, mint a new account and emit the pending cookie. This keeps the
 * "first-time visitor with no email" UX seamless: registration creates the
 * account, the verification step finalizes the credential. Self-hosters that
 * want an invite-only model can layer policy on top.
 */
function resolveOrCreatePendingAccount(c: import('hono').Context): string {
  const session = readSession(c);
  if (session) return session.accountId;
  const pending = getCookie(c, PENDING_ACCOUNT_COOKIE);
  if (pending) return pending;
  const db = getDb();
  const account = createAccount(db);
  setCookie(c, PENDING_ACCOUNT_COOKIE, account.id, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: process.env['NODE_ENV'] === 'production',
    path: '/',
    maxAge: PENDING_ACCOUNT_TTL,
  });
  return account.id;
}

app.post('/api/auth/passkey/register/options', async (c) => {
  try {
    const accountId = resolveOrCreatePendingAccount(c);
    const result = await createRegistrationOptions(getDb(), accountId);
    return c.json({ options: result.options, challengeToken: result.challengeToken });
  } catch (e) {
    return c.json(
      { error: 'registration_options_failed', detail: e instanceof Error ? e.message : 'unknown' },
      500,
    );
  }
});

app.post('/api/auth/passkey/register/verify', async (c) => {
  let body: { credential?: unknown; challengeToken?: unknown };
  try {
    body = (await c.req.json()) as { credential?: unknown; challengeToken?: unknown };
  } catch {
    return c.json({ error: 'invalid_json' }, 400);
  }
  if (!body.credential || typeof body.challengeToken !== 'string') {
    return c.json({ error: 'invalid_request' }, 400);
  }
  const result = await verifyRegistration(getDb(), {
    credential: body.credential as Parameters<typeof verifyRegistration>[1]['credential'],
    challengeToken: body.challengeToken,
  });
  if (!result.ok) return c.json({ error: result.reason }, 400);
  issueSessionCookie(c, result.accountId);
  deleteCookie(c, PENDING_ACCOUNT_COOKIE, { path: '/' });
  return c.json({ ok: true });
});

app.post('/api/auth/passkey/login/options', async (c) => {
  try {
    const result = await createAuthenticationOptions(getDb());
    return c.json({ options: result.options, challengeToken: result.challengeToken });
  } catch (e) {
    return c.json(
      {
        error: 'authentication_options_failed',
        detail: e instanceof Error ? e.message : 'unknown',
      },
      500,
    );
  }
});

app.post('/api/auth/passkey/login/verify', async (c) => {
  let body: { assertion?: unknown; challengeToken?: unknown };
  try {
    body = (await c.req.json()) as { assertion?: unknown; challengeToken?: unknown };
  } catch {
    return c.json({ error: 'invalid_json' }, 400);
  }
  if (!body.assertion || typeof body.challengeToken !== 'string') {
    return c.json({ error: 'invalid_request' }, 400);
  }
  const result = await verifyAuthentication(getDb(), {
    assertion: body.assertion as Parameters<typeof verifyAuthentication>[1]['assertion'],
    challengeToken: body.challengeToken,
  });
  if (!result.ok) return c.json({ error: result.reason }, 401);
  issueSessionCookie(c, result.accountId);
  return c.json({ ok: true });
});

const OAUTH_STATE_COOKIE = 'ib_oauth_state';

function oauthProviderFromParam(param: string): OAuthProvider | null {
  if (param === 'apple' || param === 'google') return param;
  return null;
}

app.get('/api/auth/oauth/:provider/start', (c) => {
  const provider = oauthProviderFromParam(c.req.param('provider'));
  if (!provider) {
    // Always 302 to keep behavior consistent (avoid endpoint-existence leaks).
    return c.redirect('/');
  }
  const creds = readOAuthCredentials();
  const clientId = provider === 'apple' ? creds.apple.clientId : creds.google.clientId;
  if (!clientId) return c.redirect('/');
  const next = c.req.query('next');
  const result = buildAuthorizationRequest(provider, {
    clientId,
    redirectUri: redirectUriFor(provider, creds.redirectUriBase),
    next: next ?? undefined,
  });
  setCookie(c, OAUTH_STATE_COOKIE, result.stateToken, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: process.env['NODE_ENV'] === 'production',
    path: '/',
    maxAge: 10 * 60,
  });
  return c.redirect(result.redirectUrl);
});

app.get('/api/auth/oauth/:provider/callback', async (c) => {
  const provider = oauthProviderFromParam(c.req.param('provider'));
  if (!provider) return c.redirect('/');
  const code = c.req.query('code');
  const state = c.req.query('state');
  const stateToken = getCookie(c, OAUTH_STATE_COOKIE);
  if (!code || !state || !stateToken) {
    return c.redirect('/?auth_error=missing_params');
  }
  const creds = readOAuthCredentials();
  const result = await handleOAuthCallback(getDb(), {
    provider,
    code,
    state,
    stateToken,
    creds,
  });
  deleteCookie(c, OAUTH_STATE_COOKIE, { path: '/' });
  if (!result.ok) {
    return c.redirect(`/?auth_error=${encodeURIComponent(result.reason)}`);
  }
  issueSessionCookie(c, result.accountId);
  // When we linked into an existing account on email match, surface a flag so
  // the editor can prompt the user to confirm — don't auto-link silently.
  const next = result.next;
  const sep = next.includes('?') ? '&' : '?';
  const suffix = result.linkedToExistingEmail ? `${sep}linked=1` : '';
  return c.redirect(`${next}${suffix}`);
});

app.post('/api/auth/signout', (c) => {
  clearSessionCookie(c);
  return c.json({ ok: true });
});

app.get('/api/auth/session', (c) => {
  const session = readSession(c);
  if (!session) return c.json({ authenticated: false });
  return c.json({ authenticated: true, accountId: session.accountId, exp: session.exp });
});

// --- Device pairing (issue #74) ---
//
// A signed-in user claims a device by its printed pair code, binding the
// device record to their account. Requires a valid session cookie.
app.post('/api/pair', createPairHandler(getDb));

// --- User-facing device management (issue #76) ---
//
// These authenticate via the SESSION COOKIE and verify the signed-in account
// OWNS the device. Distinct from the firmware-facing pull endpoints below,
// where the device id itself is the bearer secret and there is no session.
app.put('/api/device/:id/config', createPutDeviceConfigHandler(getDb));
app.get('/api/me/devices', createListDevicesHandler(getDb));
app.delete('/api/device/:id/owner', createUnpairDeviceHandler(getDb));

// --- Device-pull endpoints (issue #75) ---
//
// Firmware fetches its current config + rendered frame on each refresh tick.
// Both endpoints are keyed by device id; the device id is the bearer secret
// (no auth header — long opaque token, treat like an API key).
// Rate-limited per device id to 10/min as a misbehaving-firmware guard;
// normal traffic is 1-2/day per device.

app.get('/api/device/:id/config', (c) => {
  const id = c.req.param('id');
  if (!consumeToken(id)) {
    return c.json({ error: 'rate_limited' }, 429, { 'Retry-After': '60' });
  }
  const result = getDeviceConfigForPull(getDb(), id, c.req.header('if-modified-since') ?? null);
  if (result.status === 404) return c.json({ error: 'not_found' }, 404);
  if (result.status === 304) {
    return new Response(null, {
      status: 304,
      headers: { 'Last-Modified': formatHttpDate(result.lastModifiedMs) },
    });
  }
  return new Response(result.configJson, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Last-Modified': formatHttpDate(result.lastModifiedMs),
    },
  });
});

app.get('/api/device/:id/frame', (c) => {
  const id = c.req.param('id');
  if (!consumeToken(id)) {
    return c.json({ error: 'rate_limited' }, 429, { 'Retry-After': '60' });
  }
  const orientation = parseOrientation(c.req.query('orientation'));
  const result = getDeviceFrameForPull(
    getDb(),
    id,
    orientation,
    c.req.header('if-modified-since') ?? null,
  );
  if (result.status === 404) return c.json({ error: 'not_found' }, 404);
  if (result.status === 500) return c.json({ error: result.error }, 500);
  if (result.status === 304) {
    return new Response(null, {
      status: 304,
      headers: { 'Last-Modified': formatHttpDate(result.lastModifiedMs) },
    });
  }
  return new Response(result.data as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(result.data.byteLength),
      'Last-Modified': formatHttpDate(result.lastModifiedMs),
      'X-Frame-Width': String(result.width),
      'X-Frame-Height': String(result.height),
    },
  });
});

// --- Static file serving (production) ---

const webDist = resolve(__dirname, '../../web/dist');
if (existsSync(webDist)) {
  app.use('/*', serveStatic({ root: relative(process.cwd(), webDist) }));

  // SPA fallback: serve index.html for non-API routes
  app.use('*', serveStatic({ root: relative(process.cwd(), webDist), path: 'index.html' }));
}

// --- Start server ---

const port = parseInt(process.env['PORT'] ?? '4000', 10);
const host = process.env['HOST'] ?? '127.0.0.1';

serve({ fetch: app.fetch, port, hostname: host }, (info) => {
  console.log(`InfoBento API listening on http://${info.address}:${info.port}`);
  console.log(`  Health:    http://${info.address}:${info.port}/api/health`);
  console.log(`  Display:   ${DISPLAY_WIDTH}x${DISPLAY_HEIGHT} 1-bit`);
});

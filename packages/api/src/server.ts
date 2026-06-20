/**
 * Intent: Hono HTTP server serving both API routes and the built web UI
 * Context: In dev, only API runs here (Vite proxies /api). In prod, serves everything.
 * Pattern: Same-port architecture — static files + API from one server (like phasebot)
 * Future: Add serveStatic for production, WebSocket for live preview
 */

import { existsSync, readFileSync, realpathSync } from 'node:fs';
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
import {
  fetchJoke,
  fetchQuote,
  fetchHoroscope,
  fetchStocks,
  fetchOnThisDay,
  isValidStockSymbol,
  STOCK_RANGE_MAP,
  VALID_ZODIAC_SIGNS,
} from '@infobento/data';
import { createAccount, consumeForget, getDb, type OAuthProvider } from './db.js';
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
  createForgetWifiHandler,
  createListDevicesHandler,
  createPutDeviceConfigHandler,
  createUnpairDeviceHandler,
} from './me.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const app = new Hono();

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

// On-this-day / joke / horoscope / stocks / quote are thin wrappers over
// @infobento/data (RFC 0001 Phase 1). The data layer performs the upstream call
// and returns null on failure; the route applies the bundled fallback
// (quote/joke/horoscope) or maps null to an error (onthisday/stocks). Request
// validation (400s) stays here using the validators exported from the data
// package, so the data fetchers can be reused at pull-time hydration.

app.get('/api/onthisday', async (c) => {
  const result = await fetchOnThisDay(c.req.query('category') ?? 'events');
  if (!result) {
    return c.json({ error: 'Failed to fetch On This Day entry' }, 502);
  }
  return c.json({ text: result.text, year: result.year, category: result.category });
});

app.get('/api/joke', async (c) => {
  const raw = (c.req.query('categories') ?? '').trim();
  const joke = await fetchJoke(raw);
  if (joke) {
    return c.json({ text: joke.text, category: joke.category });
  }
  const fb = pickFallbackJoke(raw);
  if (fb) {
    return c.json({ text: fb.text, category: fb.category, fallback: true });
  }
  return c.json({ error: 'No joke found matching the criteria' }, 502);
});

app.get('/api/horoscope', async (c) => {
  const sign = (c.req.query('sign') ?? '').trim().toLowerCase();
  if (!sign || !VALID_ZODIAC_SIGNS.has(sign)) {
    return c.json({ error: 'Invalid or missing zodiac sign' }, 400);
  }
  const reading = await fetchHoroscope(sign);
  if (reading) {
    return c.json({ sign: reading.sign, text: reading.text, date: reading.date });
  }
  const fb = pickFallbackHoroscope(sign);
  if (fb) {
    return c.json({ sign: fb.sign, text: fb.text, date: '', fallback: true });
  }
  return c.json({ error: 'Failed to fetch horoscope' }, 502);
});

app.get('/api/stocks', async (c) => {
  const symbol = (c.req.query('symbol') ?? '').trim().toUpperCase();
  if (!isValidStockSymbol(symbol)) {
    return c.json({ error: 'Invalid or missing symbol' }, 400);
  }
  const duration = (c.req.query('duration') ?? '1d').trim();
  // A bad duration is a caller error → 400, distinct from upstream failure
  // (502 below). fetchStocks also guards null for the same input defensively.
  if (!STOCK_RANGE_MAP[duration]) {
    return c.json({ error: 'Invalid duration' }, 400);
  }
  const quote = await fetchStocks(symbol, duration);
  if (!quote) {
    return c.json({ error: 'Failed to fetch stock quote' }, 502);
  }
  return c.json({ price: quote.price, change: quote.change, changePercent: quote.changePercent });
});

app.get('/api/quote', async (c) => {
  const tagsParam = c.req.query('tags')?.trim() ?? '';
  const maxLengthParam = c.req.query('maxLength')?.trim() ?? '';
  const maxLength = /^\d+$/.test(maxLengthParam) ? Number(maxLengthParam) : undefined;
  const quote = await fetchQuote({ tags: tagsParam, maxLength });
  if (quote) {
    return c.json({ q: quote.text, a: quote.author });
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
  if (!clientId) {
    // Operator misconfiguration (missing client id), not a user error or an
    // endpoint-existence probe — fail loudly so it's diagnosable. See issue #118.
    const envVar = provider === 'google' ? 'GOOGLE_CLIENT_ID' : 'APPLE_CLIENT_ID';
    console.warn(`OAuth start aborted: ${envVar} is not configured for provider "${provider}"`);
    return c.redirect('/?auth_error=oauth_unconfigured');
  }
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
// "Forget Wi-Fi" (issue #39) — owner queues a credential reset that the device
// picks up on its next pull (X-Device-Forget header below). Web-side equivalent
// of the physical pinhole reset.
app.post('/api/device/:id/forget', createForgetWifiHandler(getDb));

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
  // Deliver a pending "forget Wi-Fi" (issue #39) on this contact — read-and-clear
  // so it's sent exactly once. Only consumed on a 200/304 (device exists), never
  // on the 404 above where there's nothing to deliver to.
  const headers: Record<string, string> = {
    'Last-Modified': formatHttpDate(result.lastModifiedMs),
  };
  if (consumeForget(getDb(), id)) headers['X-Device-Forget'] = '1';
  if (result.status === 304) {
    return new Response(null, { status: 304, headers });
  }
  headers['Content-Type'] = 'application/json';
  return new Response(result.configJson, { status: 200, headers });
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
  // Deliver a pending "forget Wi-Fi" (issue #39) on this contact, read-and-clear.
  // Only on 200/304 — never on the 404/500 above, where there's no frame poll to
  // ride along with (and a 500 means we never reached a clean delivery point).
  const headers: Record<string, string> = {
    'Last-Modified': formatHttpDate(result.lastModifiedMs),
  };
  if (consumeForget(getDb(), id)) headers['X-Device-Forget'] = '1';
  if (result.status === 304) {
    return new Response(null, { status: 304, headers });
  }
  headers['Content-Type'] = 'application/octet-stream';
  headers['Content-Length'] = String(result.data.byteLength);
  headers['X-Frame-Width'] = String(result.width);
  headers['X-Frame-Height'] = String(result.height);
  return new Response(result.data as unknown as BodyInit, { status: 200, headers });
});

// --- Static file serving (production) ---

const webDist = resolve(__dirname, '../../web/dist');
if (existsSync(webDist)) {
  app.use('/*', serveStatic({ root: relative(process.cwd(), webDist) }));

  // SPA fallback: serve index.html for non-API routes
  app.use('*', serveStatic({ root: relative(process.cwd(), webDist), path: 'index.html' }));
}

// --- Start server ---

// Only bind a port when run as the entry point (`node dist/server.js` /
// `tsx watch src/server.ts`). Importing this module — e.g. from a test — must
// not start a listener. Paths are realpath-normalized so a symlinked invocation
// path (macOS /tmp→/private/tmp, pnpm store, etc.) still compares equal.
function isEntryPoint(): boolean {
  const entry = process.argv[1];
  if (entry === undefined) return false;
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url));
  } catch (e) {
    // A missing path just means "doesn't apply" → not the entry point. Any other
    // error (EACCES, etc.) is unexpected and must stay visible rather than
    // silently preventing startup — the very failure mode #118 is about.
    if (e instanceof Error && 'code' in e && e.code === 'ENOENT') return false;
    throw e;
  }
}

if (isEntryPoint()) {
  const port = parseInt(process.env['PORT'] ?? '4000', 10);
  const host = process.env['HOST'] ?? '127.0.0.1';

  serve({ fetch: app.fetch, port, hostname: host }, (info) => {
    console.log(`InfoBento API listening on http://${info.address}:${info.port}`);
    console.log(`  Health:    http://${info.address}:${info.port}/api/health`);
    console.log(`  Display:   ${DISPLAY_WIDTH}x${DISPLAY_HEIGHT} 1-bit`);
  });
}

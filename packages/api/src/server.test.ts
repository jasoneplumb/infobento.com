/**
 * OAuth start handler — operator-misconfiguration visibility (#118).
 *
 * Importing ./server.js must NOT bind a port (the listener is entry-point
 * guarded), so we can drive the live route table with app.request().
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from './server.js';
import {
  _resetSingletonForTesting,
  getDb,
  createAccount,
  createDevice,
  setConfig,
  claimDevice,
  requestForget,
} from './db.js';
import { _resetForTesting as resetRateLimit } from './rate-limit.js';

const OAUTH_ENV = [
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'APPLE_CLIENT_ID',
  'APPLE_TEAM_ID',
  'APPLE_KEY_ID',
  'APPLE_PRIVATE_KEY',
] as const;

describe('GET /api/auth/oauth/:provider/start', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    // Snapshot and clear OAuth env so the unconfigured branch is deterministic.
    for (const k of OAUTH_ENV) {
      saved[k] = process.env[k];
      // Reflect.deleteProperty truly unsets (env values stringify, so `= undefined`
      // would leave the string "undefined") without tripping no-dynamic-delete.
      Reflect.deleteProperty(process.env, k);
    }
    process.env['SESSION_SECRET'] = 'test-secret-at-least-16-chars';
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    for (const k of OAUTH_ENV) {
      if (saved[k] === undefined) Reflect.deleteProperty(process.env, k);
      else process.env[k] = saved[k];
    }
    Reflect.deleteProperty(process.env, 'SESSION_SECRET');
    warnSpy.mockRestore();
  });

  it('redirects to /?auth_error=oauth_unconfigured when GOOGLE_CLIENT_ID is unset', async () => {
    const res = await app.request('/api/auth/oauth/google/start');
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/?auth_error=oauth_unconfigured');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('GOOGLE_CLIENT_ID'));
  });

  it('redirects to /?auth_error=oauth_unconfigured when APPLE_CLIENT_ID is unset', async () => {
    const res = await app.request('/api/auth/oauth/apple/start');
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/?auth_error=oauth_unconfigured');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('APPLE_CLIENT_ID'));
  });

  it('keeps an unknown provider a silent redirect to / (no endpoint-existence leak)', async () => {
    const res = await app.request('/api/auth/oauth/bogus/start');
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('proceeds to the provider when the client id IS configured (no false trigger)', async () => {
    process.env['GOOGLE_CLIENT_ID'] = 'test-client-id.apps.googleusercontent.com';
    const res = await app.request('/api/auth/oauth/google/start');
    expect(res.status).toBe(302);
    const location = res.headers.get('location') ?? '';
    expect(location.startsWith('https://accounts.google.com/')).toBe(true);
    expect(location).not.toContain('auth_error');
  });
});

/**
 * "Forget Wi-Fi" delivery (issue #39): a queued forget must ride out to the
 * device on its next firmware pull as an `X-Device-Forget: 1` header, exactly
 * once. Driven through the live route table over an in-memory singleton DB so
 * the inline pull handlers (not factory-exported) are exercised end-to-end.
 */
describe('X-Device-Forget delivery on device-pull', () => {
  // A minimal config that renders, so /frame returns a 200 (not 404/500).
  const VALID_CONFIG = JSON.stringify({
    boxes: [{ id: '1', label: 'Hi', type: 'text', config: { type: 'text', text: 'yo' } }],
    refreshesPerDay: 1,
  });

  beforeEach(() => {
    process.env['SESSION_SECRET'] = 'test-secret-at-least-16-chars';
    process.env['INFOBENTO_DB_PATH'] = ':memory:';
    _resetSingletonForTesting();
    resetRateLimit();
  });

  afterEach(() => {
    Reflect.deleteProperty(process.env, 'SESSION_SECRET');
    Reflect.deleteProperty(process.env, 'INFOBENTO_DB_PATH');
    _resetSingletonForTesting();
  });

  function seedForgottenDevice(pairCode = 'PULLFGT'): { id: string; ownerId: string } {
    const db = getDb();
    const owner = createAccount(db);
    const device = createDevice(db, { pairCode });
    claimDevice(db, pairCode, owner.id);
    setConfig(db, device.id, VALID_CONFIG);
    requestForget(db, device.id, owner.id);
    return { id: device.id, ownerId: owner.id };
  }

  it('delivers X-Device-Forget on the next /frame pull, then clears it', async () => {
    const { id } = seedForgottenDevice();

    const first = await app.request(`/api/device/${id}/frame`);
    expect(first.status).toBe(200);
    expect(first.headers.get('X-Device-Forget')).toBe('1');

    // Delivered exactly once: the second pull no longer carries the command.
    const second = await app.request(`/api/device/${id}/frame`);
    expect(second.status).toBe(200);
    expect(second.headers.get('X-Device-Forget')).toBeNull();
  });

  it('delivers X-Device-Forget on a /config pull too', async () => {
    const { id } = seedForgottenDevice();
    const res = await app.request(`/api/device/${id}/config`);
    expect(res.status).toBe(200);
    expect(res.headers.get('X-Device-Forget')).toBe('1');
  });

  // The steady-state firmware path: the device already cached Last-Modified on a
  // prior wake, so it sends If-Modified-Since and gets a 304. A queued forget must
  // still ride along on that 304 — `consumeForget` runs before the 304 branch.
  it('delivers X-Device-Forget on a 304 /frame pull (device already cached)', async () => {
    const { id, ownerId } = seedForgottenDevice('PULLFGT304F');
    const first = await app.request(`/api/device/${id}/frame`);
    expect(first.status).toBe(200);
    const lastModified = first.headers.get('Last-Modified') ?? '';

    // First pull consumed the forget; re-queue it for the cached-device pull.
    requestForget(getDb(), id, ownerId);
    const second = await app.request(`/api/device/${id}/frame`, {
      headers: { 'If-Modified-Since': lastModified },
    });
    expect(second.status).toBe(304);
    expect(second.headers.get('X-Device-Forget')).toBe('1');
  });

  it('delivers X-Device-Forget on a 304 /config pull (device already cached)', async () => {
    const { id, ownerId } = seedForgottenDevice('PULLFGT304C');
    const first = await app.request(`/api/device/${id}/config`);
    expect(first.status).toBe(200);
    const lastModified = first.headers.get('Last-Modified') ?? '';

    requestForget(getDb(), id, ownerId);
    const second = await app.request(`/api/device/${id}/config`, {
      headers: { 'If-Modified-Since': lastModified },
    });
    expect(second.status).toBe(304);
    expect(second.headers.get('X-Device-Forget')).toBe('1');
  });

  it('omits X-Device-Forget when nothing is pending', async () => {
    const db = getDb();
    const owner = createAccount(db);
    const device = createDevice(db, { pairCode: 'PULLNONE' });
    claimDevice(db, 'PULLNONE', owner.id);
    setConfig(db, device.id, VALID_CONFIG);

    const res = await app.request(`/api/device/${device.id}/frame`);
    expect(res.status).toBe(200);
    expect(res.headers.get('X-Device-Forget')).toBeNull();
  });

  it('sends X-Refresh-Interval (seconds) on the frame pull so the device sleeps to cadence', async () => {
    const db = getDb();
    const device = createDevice(db, { pairCode: 'PULLRPD' });
    setConfig(db, device.id, VALID_CONFIG); // refreshesPerDay: 1 → 86400s

    const res = await app.request(`/api/device/${device.id}/frame`);
    expect(res.status).toBe(200);
    expect(res.headers.get('X-Refresh-Interval')).toBe('86400');
  });

  it('omits X-Refresh-Interval when scheduled refresh is disabled (refreshesPerDay: 0)', async () => {
    const db = getDb();
    const device = createDevice(db, { pairCode: 'PULLOFF' });
    setConfig(
      db,
      device.id,
      JSON.stringify({
        boxes: [{ id: '1', label: 'Hi', type: 'text', config: { type: 'text', text: 'yo' } }],
        refreshesPerDay: 0,
      }),
    );

    const res = await app.request(`/api/device/${device.id}/frame`);
    expect(res.status).toBe(200);
    expect(res.headers.get('X-Refresh-Interval')).toBeNull();
  });
});

/**
 * Combined dual-orientation pull (issue #160, RFC 0002): `GET /frames` returns
 * both framebuffers concatenated so the device can flip orientation locally. It
 * shares the /frame trust boundary, 304 gate, and ride-along headers.
 */
describe('GET /api/device/:id/frames', () => {
  const VALID_CONFIG = JSON.stringify({
    boxes: [{ id: '1', label: 'Hi', type: 'text', config: { type: 'text', text: 'yo' } }],
    refreshesPerDay: 1,
  });

  beforeEach(() => {
    process.env['SESSION_SECRET'] = 'test-secret-at-least-16-chars';
    process.env['INFOBENTO_DB_PATH'] = ':memory:';
    _resetSingletonForTesting();
    resetRateLimit();
  });

  afterEach(() => {
    Reflect.deleteProperty(process.env, 'SESSION_SECRET');
    Reflect.deleteProperty(process.env, 'INFOBENTO_DB_PATH');
    _resetSingletonForTesting();
  });

  function seedDevice(pairCode: string): string {
    const db = getDb();
    const device = createDevice(db, { pairCode });
    setConfig(db, device.id, VALID_CONFIG);
    return device.id;
  }

  it('200 returns both frames concatenated with per-orientation byte-length headers', async () => {
    const id = seedDevice('FRAMES1');
    const res = await app.request(`/api/device/${id}/frames`);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/octet-stream');

    const landBytes = Number(res.headers.get('X-Frame-Landscape-Bytes'));
    const portBytes = Number(res.headers.get('X-Frame-Portrait-Bytes'));
    // 920 x 680 at 2bpp packs to 156,400 bytes per orientation.
    expect(landBytes).toBe(156_400);
    expect(portBytes).toBe(156_400);

    // Portrait is pre-rotated into the panel raster, so both halves declare the
    // SAME (landscape) geometry — the device uploads either identically.
    expect(Number(res.headers.get('X-Frame-Landscape-Width'))).toBeGreaterThanOrEqual(
      Number(res.headers.get('X-Frame-Landscape-Height')),
    );
    expect(res.headers.get('X-Frame-Portrait-Width')).toBe(
      res.headers.get('X-Frame-Landscape-Width'),
    );
    expect(res.headers.get('X-Frame-Portrait-Height')).toBe(
      res.headers.get('X-Frame-Landscape-Height'),
    );

    // Body is exactly the two halves concatenated; Content-Length agrees.
    const body = new Uint8Array(await res.arrayBuffer());
    expect(body.byteLength).toBe(landBytes + portBytes);
    expect(Number(res.headers.get('Content-Length'))).toBe(body.byteLength);
  });

  it('304 (If-Modified-Since) returns no body — same gate as /frame', async () => {
    const id = seedDevice('FRAMES2');
    const first = await app.request(`/api/device/${id}/frames`);
    expect(first.status).toBe(200);
    const lastModified = first.headers.get('Last-Modified') ?? '';
    expect(lastModified).not.toBe('');

    const second = await app.request(`/api/device/${id}/frames`, {
      headers: { 'If-Modified-Since': lastModified },
    });
    expect(second.status).toBe(304);
    expect((await second.arrayBuffer()).byteLength).toBe(0);
  });

  it('404 for an unknown device id', async () => {
    const res = await app.request('/api/device/does-not-exist/frames');
    expect(res.status).toBe(404);
  });
});

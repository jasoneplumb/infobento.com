/**
 * OAuth start handler — operator-misconfiguration visibility (#118).
 *
 * Importing ./server.js must NOT bind a port (the listener is entry-point
 * guarded), so we can drive the live route table with app.request().
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { app, _resetBoxDataForTesting, _resetGeolocateCacheForTesting } from './server.js';
import { USER_AGENT } from '@infobento/data';
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

  // Device-declared panel size (#288).
  it('renders at the X-Panel size and returns a size-scoped ETag', async () => {
    const id = seedDevice('PANEL1'); // config carries no size → would be 920x680
    const res = await app.request(`/api/device/${id}/frames`, {
      headers: { 'X-Panel': '800x480' },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('X-Frame-Landscape-Bytes')).toBe('96000');
    expect(res.headers.get('X-Frame-Portrait-Bytes')).toBe('96000');
    expect(res.headers.get('X-Frame-Landscape-Width')).toBe('800');
    expect(res.headers.get('X-Frame-Landscape-Height')).toBe('480');
    expect(res.headers.get('ETag')).toMatch(/^"\d+-800x480"$/);
    expect(res.headers.get('Vary')).toBe('X-Panel');
  });

  it('304s a matching If-None-Match, but not one issued for another panel size', async () => {
    const id = seedDevice('PANEL2');
    const first = await app.request(`/api/device/${id}/frames`, {
      headers: { 'X-Panel': '800x480' },
    });
    const etag = first.headers.get('ETag') ?? '';
    const lastModified = first.headers.get('Last-Modified') ?? '';

    const same = await app.request(`/api/device/${id}/frames`, {
      headers: { 'X-Panel': '800x480', 'If-None-Match': etag, 'If-Modified-Since': lastModified },
    });
    expect(same.status).toBe(304);
    expect(same.headers.get('ETag')).toBe(etag);

    const other = await app.request(`/api/device/${id}/frames`, {
      headers: { 'X-Panel': '920x680', 'If-None-Match': etag, 'If-Modified-Since': lastModified },
    });
    expect(other.status).toBe(200);
    expect(other.headers.get('X-Frame-Landscape-Bytes')).toBe('156400');
  });

  it('422s a declared size outside DEVICE_PROFILES and logs it server-side', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const id = seedDevice('PANEL3');
      const res = await app.request(`/api/device/${id}/frames`, {
        headers: { 'X-Panel': '1024x600' },
      });
      expect(res.status).toBe(422);
      expect(await res.json()).toEqual({
        error: 'unsupported_panel',
        panel: '1024x600',
        supported: ['800x480', '920x680'],
      });
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('"1024x600"'));
      // The bearer-secret device id is never logged in full.
      expect(warn).not.toHaveBeenCalledWith(expect.stringContaining(id));
    } finally {
      warn.mockRestore();
    }
  });
});

describe('GET /api/geolocate (#183)', () => {
  beforeEach(() => {
    _resetGeolocateCacheForTesting();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('looks up the first x-forwarded-for hop (the client IP behind a proxy)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ city: 'Detroit', region: 'Michigan', country_code: 'us' })),
      );
    vi.stubGlobal('fetch', fetchMock);

    const res = await app.request('/api/geolocate', {
      headers: { 'x-forwarded-for': '8.8.8.8, 10.0.0.1' },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ city: 'Detroit, Michigan', countryCode: 'US' });
    // Node's default UA is rate-limited by ipapi.co (#278).
    expect(fetchMock).toHaveBeenCalledWith('https://ipapi.co/8.8.8.8/json/', {
      headers: { 'User-Agent': USER_AGENT },
    });
  });

  it('uses an ip-less lookup for private/loopback client addresses', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ city: 'London', country_code: 'gb' })));
    vi.stubGlobal('fetch', fetchMock);

    const res = await app.request('/api/geolocate', {
      headers: { 'x-forwarded-for': '192.168.1.10' },
    });
    expect(await res.json()).toEqual({ city: 'London', countryCode: 'GB' });
    expect(fetchMock).toHaveBeenCalledWith('https://ipapi.co/json/', {
      headers: { 'User-Agent': USER_AGENT },
    });
  });

  it('returns 200 with nulls when the upstream lookup fails (absence is normal)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('upstream down')));

    const res = await app.request('/api/geolocate');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ city: null, countryCode: null });
  });

  it('serves repeat lookups for the same client IP from cache (one upstream call)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ city: 'Detroit', country_code: 'us' })));
    vi.stubGlobal('fetch', fetchMock);

    const headers = { 'x-forwarded-for': '8.8.8.8' };
    const first = await app.request('/api/geolocate', { headers });
    const second = await app.request('/api/geolocate', { headers });
    expect(await first.json()).toEqual({ city: 'Detroit', countryCode: 'US' });
    expect(await second.json()).toEqual({ city: 'Detroit', countryCode: 'US' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not cache failures — the next request retries upstream', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('slow down', { status: 429 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ city: 'Detroit', country_code: 'us' })));
    vi.stubGlobal('fetch', fetchMock);

    const headers = { 'x-forwarded-for': '8.8.8.8' };
    expect(await (await app.request('/api/geolocate', { headers })).json()).toEqual({
      city: null,
      countryCode: null,
    });
    expect(await (await app.request('/api/geolocate', { headers })).json()).toEqual({
      city: 'Detroit',
      countryCode: 'US',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('GET /api/box-data/:type (#287)', () => {
  const HOLIDAY = [{ date: '2026-12-25', localName: 'Christmas Day', name: 'Christmas Day' }];
  const CLIENT = { 'x-forwarded-for': '203.0.113.7' };

  /** Every distinct two-letter code, for tests that need many cache misses. */
  const CODES = Array.from({ length: 26 * 26 }, (_, i) =>
    String.fromCharCode(65 + Math.floor(i / 26), 65 + (i % 26)),
  );

  function stubHolidays(): ReturnType<typeof vi.fn> {
    const mock = vi.fn(async () => new Response(JSON.stringify(HOLIDAY)));
    vi.stubGlobal('fetch', mock);
    return mock;
  }

  beforeEach(() => {
    _resetBoxDataForTesting();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('geocodes server-side and sends the identifying User-Agent upstream', async () => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);
      const body = url.includes('nominatim')
        ? [{ lat: '45.5', lon: '-122.6', display_name: 'Portland' }]
        : {
            utc_offset_seconds: -25200,
            current: { temperature_2m: 20, weather_code: 0 },
            daily: { temperature_2m_max: [25], temperature_2m_min: [10] },
          };
      return new Response(JSON.stringify(body));
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await app.request('/api/box-data/weather?location=Portland&unit=C');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      data: { temperature: 20, condition: 'Clear', high: 25, low: 10, utcOffsetSeconds: -25200 },
    });

    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
    const nominatim = calls.find(([url]) => url.includes('nominatim.openstreetmap.org'));
    const openMeteo = calls.find(([url]) => url.includes('api.open-meteo.com'));
    expect(nominatim?.[1].headers).toMatchObject({ 'User-Agent': USER_AGENT });
    expect(openMeteo?.[1]).toEqual({ headers: { 'User-Agent': USER_AGENT } });
  });

  it('returns 200 with data: null when the upstream fails (absence is normal)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('upstream down')));

    const res = await app.request('/api/box-data/holidays?country=GB');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: null });
  });

  it('serves a repeat request from cache, keyed on the normalized input', async () => {
    const fetchMock = stubHolidays();

    const first = await app.request('/api/box-data/holidays?country=gb');
    const second = await app.request('/api/box-data/holidays?country=%20GB%20');
    const expected = { data: { name: 'Christmas Day', date: '2026-12-25' } };
    expect(await first.json()).toEqual(expected);
    expect(await second.json()).toEqual(expected);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('https://date.nager.at/api/v3/NextPublicHolidays/GB', {
      headers: { 'User-Agent': USER_AGENT },
    });
  });

  it('does not cache failures — the next request retries upstream', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('slow down', { status: 429 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(HOLIDAY)));
    vi.stubGlobal('fetch', fetchMock);

    const url = '/api/box-data/holidays?country=GB';
    expect(await (await app.request(url)).json()).toEqual({ data: null });
    expect(await (await app.request(url)).json()).toEqual({
      data: { name: 'Christmas Day', date: '2026-12-25' },
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['/api/box-data/stocks?location=Portland', 'Unknown box type'],
    ['/api/box-data/weather', 'Invalid or missing location'],
    [`/api/box-data/sun?location=${'x'.repeat(201)}`, 'Invalid or missing location'],
    ['/api/box-data/weather?location=Oslo&unit=K', 'Invalid unit'],
    ['/api/box-data/forecast?location=Oslo&hours=99', 'Invalid hours'],
    ['/api/box-data/forecast3d?location=Oslo&days=-1', 'Invalid days'],
    ['/api/box-data/holidays?country=GB%2F..', 'Invalid or missing country'],
  ])('400s %s without calling upstream', async (url, error) => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const res = await app.request(url);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ data: null, error });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rate-limits upstream-bound misses per client, but still serves cache hits', async () => {
    const fetchMock = stubHolidays();
    const get = async (code: string, headers: Record<string, string> = CLIENT): Promise<Response> =>
      app.request(`/api/box-data/holidays?country=${code}`, { headers });

    for (const code of CODES.slice(0, 30)) {
      expect((await get(code)).status).toBe(200);
    }
    const limited = await get(CODES[30] ?? '');
    expect(limited.status).toBe(429);
    expect(limited.headers.get('Retry-After')).toBe('60');
    expect(await limited.json()).toEqual({ data: null, error: 'rate_limited' });

    // A cached key costs no upstream call, so it is not limited.
    expect((await get(CODES[0] ?? '')).status).toBe(200);
    // Another client has its own bucket.
    expect((await get(CODES[30] ?? '', { 'x-forwarded-for': '198.51.100.9' })).status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(31);
  });

  it('503s new misses while the global in-flight cap is full, then recovers', async () => {
    // Upstream calls hang until the gate opens, then answer immediately.
    let open!: () => void;
    const gate = new Promise<void>((resolve) => (open = resolve));
    const fetchMock = vi.fn(async () => {
      await gate;
      return new Response(JSON.stringify(HOLIDAY));
    });
    vi.stubGlobal('fetch', fetchMock);

    // Distinct clients, so the per-client limiter is not what trips.
    const request = async (code: string, i: number): Promise<Response> =>
      app.request(`/api/box-data/holidays?country=${code}`, {
        headers: { 'x-forwarded-for': `203.0.113.${String(i)}` },
      });
    const inflight = CODES.slice(0, 8).map(request);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(8));

    const busy = await request(CODES[8] ?? '', 8);
    expect(busy.status).toBe(503);
    expect(busy.headers.get('Retry-After')).toBe('8');
    expect(await busy.json()).toEqual({ data: null, error: 'busy' });

    // A request for a key already in flight joins it instead of being refused.
    const joined = request(CODES[0] ?? '', 9);

    open();
    for (const res of await Promise.all([...inflight, joined])) expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(8);

    expect((await request(CODES[8] ?? '', 8)).status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(9);
  });
});

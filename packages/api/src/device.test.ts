import { describe, it, expect, beforeEach } from 'vitest';
import { createDb, createDevice, setConfig, type DB } from './db.js';
import {
  effectiveLastModified,
  formatHttpDate,
  getDeviceConfigForPull,
  getDeviceFrameForPull,
  isNotModified,
  parseOrientation,
} from './device.js';
import { InMemoryCache } from '@infobento/data';
import type { HydrateDeps } from './hydrate.js';

/** Hydration deps with a never-succeeds weather fetcher (configs here are text). */
function makeDeps(): HydrateDeps {
  return { cache: new InMemoryCache(), fetchWeather: async () => null };
}

const HOUR_MS = 3_600_000;

const SAMPLE_CONFIG = {
  boxes: [{ id: '1', type: 'text', label: 'Hello', config: { type: 'text', text: 'World' } }],
  refreshesPerDay: 2,
} as const;
const SAMPLE_CONFIG_JSON = JSON.stringify(SAMPLE_CONFIG);

function seedDeviceWithConfig(db: DB): { id: string; lastModifiedMs: number } {
  const d = createDevice(db, { pairCode: 'PAIR-001' });
  setConfig(db, d.id, SAMPLE_CONFIG_JSON);
  // Re-read to pick up the post-setConfig last_modified.
  const fresh = db.prepare('SELECT last_modified FROM devices WHERE id = ?').get(d.id) as {
    last_modified: number;
  };
  return { id: d.id, lastModifiedMs: fresh.last_modified };
}

describe('isNotModified', () => {
  it('returns false when header is missing', () => {
    expect(isNotModified(null, Date.now())).toBe(false);
  });

  it('returns false when header is unparseable', () => {
    expect(isNotModified('not a date', Date.now())).toBe(false);
  });

  it('returns true when stored time is at or before header (second precision)', () => {
    const ms = 1_700_000_000_000; // arbitrary
    const header = new Date(ms).toUTCString();
    expect(isNotModified(header, ms)).toBe(true);
    // 999ms drift inside the same second → still not modified
    expect(isNotModified(header, ms + 999)).toBe(true);
  });

  it('returns false when stored time is strictly after header (next second)', () => {
    const ms = 1_700_000_000_000;
    const header = new Date(ms).toUTCString();
    expect(isNotModified(header, ms + 1000)).toBe(false);
  });
});

describe('parseOrientation', () => {
  it('defaults to landscape when missing or unknown', () => {
    expect(parseOrientation(null)).toBe('landscape');
    expect(parseOrientation(undefined)).toBe('landscape');
    expect(parseOrientation('')).toBe('landscape');
    expect(parseOrientation('weird')).toBe('landscape');
    expect(parseOrientation('LANDSCAPE')).toBe('landscape');
  });

  it('returns portrait only on exact match', () => {
    expect(parseOrientation('portrait')).toBe('portrait');
  });
});

describe('getDeviceConfigForPull', () => {
  let db: DB;
  beforeEach(() => {
    db = createDb(':memory:');
  });

  it('returns 404 for unknown device id', () => {
    expect(getDeviceConfigForPull(db, 'nope', null)).toEqual({ status: 404 });
  });

  it('returns 404 for a device that has no config yet', () => {
    const d = createDevice(db, { pairCode: 'NOCONFIG' });
    expect(getDeviceConfigForPull(db, d.id, null)).toEqual({ status: 404 });
  });

  it('returns 200 with the stored JSON when no If-Modified-Since', () => {
    const { id, lastModifiedMs } = seedDeviceWithConfig(db);
    const r = getDeviceConfigForPull(db, id, null);
    expect(r.status).toBe(200);
    if (r.status !== 200) throw new Error('unreachable');
    expect(r.configJson).toBe(SAMPLE_CONFIG_JSON);
    expect(r.lastModifiedMs).toBe(lastModifiedMs);
  });

  it('returns 304 when If-Modified-Since matches stored last_modified', () => {
    const { id, lastModifiedMs } = seedDeviceWithConfig(db);
    const ims = formatHttpDate(lastModifiedMs);
    const r = getDeviceConfigForPull(db, id, ims);
    expect(r.status).toBe(304);
    if (r.status !== 304) throw new Error('unreachable');
    expect(r.lastModifiedMs).toBe(lastModifiedMs);
  });

  it('returns 200 when If-Modified-Since predates stored last_modified', () => {
    const { id, lastModifiedMs } = seedDeviceWithConfig(db);
    const ims = formatHttpDate(lastModifiedMs - 60_000);
    const r = getDeviceConfigForPull(db, id, ims);
    expect(r.status).toBe(200);
  });
});

describe('getDeviceFrameForPull', () => {
  let db: DB;
  beforeEach(() => {
    db = createDb(':memory:');
    delete process.env['INFOBENTO_DATA_BUCKET_SECONDS'];
  });

  it('returns 404 for unknown device id', async () => {
    expect(await getDeviceFrameForPull(db, 'nope', 'landscape', null, makeDeps())).toEqual({
      status: 404,
    });
  });

  it('returns 404 for a device that has no config', async () => {
    const d = createDevice(db, { pairCode: 'NOCONFIG2' });
    expect(await getDeviceFrameForPull(db, d.id, 'landscape', null, makeDeps())).toEqual({
      status: 404,
    });
  });

  it('renders the landscape frame and returns 200 with bytes', async () => {
    const { id } = seedDeviceWithConfig(db);
    const r = await getDeviceFrameForPull(db, id, 'landscape', null, makeDeps());
    expect(r.status).toBe(200);
    if (r.status !== 200) throw new Error('unreachable');
    expect(r.width).toBeGreaterThan(0);
    expect(r.height).toBeGreaterThan(0);
    // 920 x 680 at 2bpp packs to 156,400 bytes.
    expect(r.data.byteLength).toBe(156_400);
    // Landscape is wider than tall.
    expect(r.width).toBeGreaterThanOrEqual(r.height);
  });

  it('returns a portrait frame with swapped width/height', async () => {
    const { id } = seedDeviceWithConfig(db);
    const r = await getDeviceFrameForPull(db, id, 'portrait', null, makeDeps());
    expect(r.status).toBe(200);
    if (r.status !== 200) throw new Error('unreachable');
    expect(r.height).toBeGreaterThanOrEqual(r.width);
  });

  it('returns 304 within the window when If-Modified-Since matches', async () => {
    const { id, lastModifiedMs } = seedDeviceWithConfig(db);
    // Pin now to the edit time so effectiveLastModified == lastModifiedMs.
    const r = await getDeviceFrameForPull(
      db,
      id,
      'landscape',
      formatHttpDate(lastModifiedMs),
      makeDeps(),
      lastModifiedMs,
    );
    expect(r.status).toBe(304);
  });

  it('redraws (200) at the next data-bucket boundary even when the config is unchanged', async () => {
    const { id, lastModifiedMs } = seedDeviceWithConfig(db); // refreshesPerDay=2 → 12h bucket
    const nextBoundary =
      Math.floor(lastModifiedMs / (12 * HOUR_MS)) * (12 * HOUR_MS) + 12 * HOUR_MS;
    const r = await getDeviceFrameForPull(
      db,
      id,
      'landscape',
      formatHttpDate(lastModifiedMs), // device's cached token (from the last draw)
      makeDeps(),
      nextBoundary + 1000, // a wake just past the boundary
    );
    expect(r.status).toBe(200);
  });

  it('hydrates a weather box via the injected fetcher', async () => {
    const cfg = {
      boxes: [{ id: 'w', type: 'weather', config: { type: 'weather', city: 'Portland' } }],
      refreshesPerDay: 2,
    };
    const d = createDevice(db, { pairCode: 'WX' });
    setConfig(db, d.id, JSON.stringify(cfg));
    let requested = '';
    const deps: HydrateDeps = {
      cache: new InMemoryCache(),
      fetchWeather: async (loc) => {
        requested = loc;
        return { temperature: 70, condition: 'Clear', high: 75, low: 60 };
      },
    };
    const r = await getDeviceFrameForPull(db, d.id, 'landscape', null, deps);
    expect(r.status).toBe(200);
    expect(requested).toBe('Portland');
  });

  it('returns 500 when stored config is corrupt JSON', async () => {
    const d = createDevice(db, { pairCode: 'BADJSON' });
    setConfig(db, d.id, '{ this is not json');
    const r = await getDeviceFrameForPull(db, d.id, 'landscape', null, makeDeps());
    expect(r.status).toBe(500);
  });
});

describe('effectiveLastModified', () => {
  beforeEach(() => {
    delete process.env['INFOBENTO_DATA_BUCKET_SECONDS'];
  });

  it('uses the config edit time when it is newer than the bucket boundary', () => {
    const now = 1_700_000_000_000;
    expect(effectiveLastModified({ last_modified: now, refreshes_per_day: 2 }, now)).toBe(now);
  });

  it('advances to the 12h boundary for an old config (refreshesPerDay=2)', () => {
    const bucket = 12 * HOUR_MS;
    const now = 5 * bucket + 123_456;
    expect(effectiveLastModified({ last_modified: 0, refreshes_per_day: 2 }, now)).toBe(5 * bucket);
  });

  it('uses a 24h bucket for refreshesPerDay=1', () => {
    const bucket = 24 * HOUR_MS;
    const now = 3 * bucket + 999;
    expect(effectiveLastModified({ last_modified: 0, refreshes_per_day: 1 }, now)).toBe(3 * bucket);
  });

  it('honors the INFOBENTO_DATA_BUCKET_SECONDS bench override', () => {
    process.env['INFOBENTO_DATA_BUCKET_SECONDS'] = '60';
    const now = 1000 * 60_000 + 30_000; // 30s into a 60s bucket
    expect(effectiveLastModified({ last_modified: 0, refreshes_per_day: 2 }, now)).toBe(
      1000 * 60_000,
    );
  });
});

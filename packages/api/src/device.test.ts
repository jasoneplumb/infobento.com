import { describe, it, expect, beforeEach } from 'vitest';
import { createDb, createDevice, setConfig, type DB } from './db.js';
import {
  formatHttpDate,
  getDeviceConfigForPull,
  getDeviceFrameForPull,
  isNotModified,
  parseOrientation,
} from './device.js';

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
  });

  it('returns 404 for unknown device id', () => {
    expect(getDeviceFrameForPull(db, 'nope', 'landscape', null)).toEqual({ status: 404 });
  });

  it('returns 404 for a device that has no config', () => {
    const d = createDevice(db, { pairCode: 'NOCONFIG2' });
    expect(getDeviceFrameForPull(db, d.id, 'landscape', null)).toEqual({ status: 404 });
  });

  it('renders the landscape frame and returns 200 with bytes', () => {
    const { id } = seedDeviceWithConfig(db);
    const r = getDeviceFrameForPull(db, id, 'landscape', null);
    expect(r.status).toBe(200);
    if (r.status !== 200) throw new Error('unreachable');
    expect(r.width).toBeGreaterThan(0);
    expect(r.height).toBeGreaterThan(0);
    // 920 x 680 at 2bpp packs to 156,400 bytes.
    expect(r.data.byteLength).toBe(156_400);
    // Landscape is wider than tall.
    expect(r.width).toBeGreaterThanOrEqual(r.height);
  });

  it('returns a portrait frame with swapped width/height', () => {
    const { id } = seedDeviceWithConfig(db);
    const r = getDeviceFrameForPull(db, id, 'portrait', null);
    expect(r.status).toBe(200);
    if (r.status !== 200) throw new Error('unreachable');
    expect(r.height).toBeGreaterThanOrEqual(r.width);
  });

  it('returns 304 when If-Modified-Since matches', () => {
    const { id, lastModifiedMs } = seedDeviceWithConfig(db);
    const r = getDeviceFrameForPull(db, id, 'landscape', formatHttpDate(lastModifiedMs));
    expect(r.status).toBe(304);
  });

  it('returns 500 when stored config is corrupt JSON', () => {
    const d = createDevice(db, { pairCode: 'BADJSON' });
    setConfig(db, d.id, '{ this is not json');
    const r = getDeviceFrameForPull(db, d.id, 'landscape', null);
    expect(r.status).toBe(500);
  });
});

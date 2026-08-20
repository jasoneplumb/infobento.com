import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fetchUvIndex, uvCategory } from './uv.js';
import { __setNominatimQueue } from './geocode.js';
import { RateLimitedQueue } from './nominatim-queue.js';

const GEOCODE = [{ lat: '45.5', lon: '-122.6', display_name: 'Portland' }];

function mockByUrl(provider: unknown): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      const body = url.includes('nominatim') ? GEOCODE : provider;
      return { ok: true, json: async () => body } as unknown as Response;
    }),
  );
}

beforeEach(() => {
  __setNominatimQueue(new RateLimitedQueue(0));
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('uvCategory', () => {
  it('maps each WHO band boundary to its label', () => {
    // Boundaries matter more than midpoints: 2|3, 5|6, 7|8, 10|11.
    expect([0, 2].map(uvCategory)).toEqual(['Low', 'Low']);
    expect([3, 5].map(uvCategory)).toEqual(['Moderate', 'Moderate']);
    expect([6, 7].map(uvCategory)).toEqual(['High', 'High']);
    expect([8, 10].map(uvCategory)).toEqual(['Very High', 'Very High']);
    expect([11, 15].map(uvCategory)).toEqual(['Extreme', 'Extreme']);
  });
});

describe('fetchUvIndex', () => {
  it('rounds the reading and labels its band', async () => {
    mockByUrl({ current: { uv_index: 6.4 } });
    expect(await fetchUvIndex('Portland')).toEqual({ uvIndex: 6, category: 'High' });
  });

  it('categorizes from the rounded value, not the raw one', async () => {
    // 5.6 rounds to 6, which crosses from Moderate into High.
    mockByUrl({ current: { uv_index: 5.6 } });
    expect(await fetchUvIndex('Portland')).toEqual({ uvIndex: 6, category: 'High' });
  });

  it('returns null when the reading is absent', async () => {
    mockByUrl({ current: {} });
    expect(await fetchUvIndex('Portland')).toBeNull();
  });

  it('distinguishes a genuine zero from a missing reading', async () => {
    mockByUrl({ current: { uv_index: 0 } });
    expect(await fetchUvIndex('Portland')).toEqual({ uvIndex: 0, category: 'Low' });
  });

  it('returns null when geocoding fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, json: async () => null }) as unknown as Response),
    );
    expect(await fetchUvIndex('Nowhere')).toBeNull();
  });

  // Open-Meteo answers a bad request with HTTP 200 and an error body, so `ok`
  // is true and there is no `current` key. Dereferencing it threw a TypeError
  // that the outer catch flattened to null — same result, but reached by a
  // crash rather than a check.
  it('returns null on a 200 error payload instead of throwing', async () => {
    mockByUrl({ error: true, reason: "Parameter 'latitude' is invalid." });
    expect(await fetchUvIndex('Portland')).toBeNull();
  });

  it('returns null when the response has no current block at all', async () => {
    mockByUrl({});
    expect(await fetchUvIndex('Portland')).toBeNull();
  });
});

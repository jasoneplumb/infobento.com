import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fetchAirQuality } from './air-quality.js';
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

describe('fetchAirQuality', () => {
  it('maps AQI to a category and picks the dominant pollutant', async () => {
    mockByUrl({
      current: { european_aqi: 42, pm2_5: 8, pm10: 20, nitrogen_dioxide: 5, uv_index: 3 },
    });
    expect(await fetchAirQuality('Portland')).toEqual({
      aqi: 42,
      category: 'Good',
      dominantPollutant: 'PM10',
      uvIndex: 3,
    });
  });

  it('returns null when AQI is absent', async () => {
    mockByUrl({ current: {} });
    expect(await fetchAirQuality('Portland')).toBeNull();
  });

  it('returns null when geocoding fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, json: async () => null }) as unknown as Response),
    );
    expect(await fetchAirQuality('Nowhere')).toBeNull();
  });
});

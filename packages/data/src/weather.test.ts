import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fetchWeather, fetchForecast, fetchForecast3D, fetchSunTimes } from './weather.js';
import { __setNominatimQueue } from './geocode.js';
import { RateLimitedQueue } from './nominatim-queue.js';

const GEOCODE = [{ lat: '45.5', lon: '-122.6', display_name: 'Portland' }];

/** Route mocked fetch by URL: Nominatim geocode vs. Open-Meteo provider. */
function mockByUrl(provider: unknown, geocode: unknown = GEOCODE): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      const body = url.includes('nominatim') ? geocode : provider;
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

describe('fetchWeather', () => {
  it('returns current conditions in the requested unit', async () => {
    mockByUrl({
      current: { temperature_2m: 20, weather_code: 0 },
      daily: { temperature_2m_max: [25], temperature_2m_min: [10] },
    });
    expect(await fetchWeather('Portland', 'C')).toEqual({
      temperature: 20,
      condition: 'Clear',
      high: 25,
      low: 10,
    });
  });

  it('converts to Fahrenheit by default', async () => {
    mockByUrl({
      current: { temperature_2m: 0, weather_code: 61 },
      daily: { temperature_2m_max: [10], temperature_2m_min: [-10] },
    });
    expect(await fetchWeather('Portland')).toEqual({
      temperature: 32,
      condition: 'Rain',
      high: 50,
      low: 14,
    });
  });

  it('returns null when geocoding fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, json: async () => null }) as unknown as Response),
    );
    expect(await fetchWeather('Nowhere')).toBeNull();
  });
});

describe('fetchForecast', () => {
  it('returns the next N hourly entries', async () => {
    mockByUrl({
      hourly: {
        // Far-future timestamps so the "current hour" index resolves to 0.
        time: ['9999-01-01T00:00', '9999-01-01T01:00', '9999-01-01T02:00', '9999-01-01T03:00'],
        temperature_2m: [20, 21, 22, 23],
        weather_code: [0, 0, 1, 95],
      },
    });
    const entries = await fetchForecast('Portland', 3, 'C');
    expect(entries).toEqual([
      { time: '01:00', temperature: 21, condition: 'Clear' },
      { time: '02:00', temperature: 22, condition: 'Partly Cloudy' },
      { time: '03:00', temperature: 23, condition: 'Thunderstorm' },
    ]);
  });
});

describe('fetchForecast3D', () => {
  it('skips today and returns the next N days', async () => {
    mockByUrl({
      daily: {
        time: ['2026-06-21', '2026-06-22', '2026-06-23'],
        temperature_2m_max: [30, 31, 32],
        temperature_2m_min: [15, 16, 17],
        weather_code: [0, 3, 71],
      },
    });
    const entries = await fetchForecast3D('Portland', 2, 'C');
    expect(entries).toEqual([
      { day: 'Mon', high: 31, low: 16, condition: 'Partly Cloudy' },
      { day: 'Tue', high: 32, low: 17, condition: 'Snow' },
    ]);
  });
});

describe('fetchSunTimes', () => {
  it('returns sunrise, sunset, and day length', async () => {
    mockByUrl({
      daily: {
        sunrise: ['2026-06-21T05:22'],
        sunset: ['2026-06-21T21:03'],
      },
    });
    expect(await fetchSunTimes('Portland')).toEqual({
      sunrise: '05:22',
      sunset: '21:03',
      dayLength: '15h 41m',
    });
  });
});

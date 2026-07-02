import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  fetchWeather,
  fetchUtcOffset,
  fetchForecast,
  fetchForecast3D,
  fetchSunTimes,
} from './weather.js';
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
  vi.useRealTimers();
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

  it('surfaces the location UTC offset when the provider returns it', async () => {
    mockByUrl({
      utc_offset_seconds: -7 * 3600,
      current: { temperature_2m: 20, weather_code: 0 },
      daily: { temperature_2m_max: [25], temperature_2m_min: [10] },
    });
    const w = await fetchWeather('Portland', 'C');
    expect(w?.utcOffsetSeconds).toBe(-7 * 3600);
  });
});

describe('fetchUtcOffset', () => {
  it('returns the location offset in seconds', async () => {
    mockByUrl({
      utc_offset_seconds: -7 * 3600,
      current: { temperature_2m: 20, weather_code: 0 },
    });
    expect(await fetchUtcOffset('Portland')).toBe(-7 * 3600);
  });

  it('returns null when geocoding fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, json: async () => null }) as unknown as Response),
    );
    expect(await fetchUtcOffset('Nowhere')).toBeNull();
  });

  it('returns null when the provider omits the offset', async () => {
    mockByUrl({ current: { temperature_2m: 20, weather_code: 0 } });
    expect(await fetchUtcOffset('Portland')).toBeNull();
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

  it('anchors the current hour to the location timezone, not the server clock', async () => {
    vi.useFakeTimers();
    // Server clock at 2026-06-21T00:30Z; a UTC−7 location is then at 17:30 local,
    // so the next two hourly entries should be 18:00 and 19:00 local — not the
    // 01:00/02:00 a naive UTC-server anchor would pick.
    vi.setSystemTime(new Date('2026-06-21T00:30:00Z'));
    mockByUrl({
      utc_offset_seconds: -7 * 3600,
      hourly: {
        time: [
          '2026-06-20T16:00',
          '2026-06-20T17:00',
          '2026-06-20T18:00',
          '2026-06-20T19:00',
          '2026-06-20T20:00',
        ],
        temperature_2m: [10, 11, 12, 13, 14],
        weather_code: [0, 0, 0, 0, 0],
      },
    });
    const entries = await fetchForecast('Portland', 2, 'C');
    expect(entries?.map((e) => e.time)).toEqual(['18:00', '19:00']);
  });

  it("caps forecast_days at Open-Meteo's 16-day max for large spans", async () => {
    mockByUrl({
      hourly: {
        time: ['9999-01-01T00:00', '9999-01-01T01:00'],
        temperature_2m: [20, 21],
        weather_code: [0, 0],
      },
    });
    await fetchForecast('Portland', 400, 'C');
    const forecastUrl = vi
      .mocked(fetch)
      .mock.calls.map((c) => String(c[0]))
      .find((u) => u.includes('api.open-meteo.com'));
    expect(forecastUrl).toContain('forecast_days=16');
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

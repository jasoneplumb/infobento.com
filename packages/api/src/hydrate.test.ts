import { describe, it, expect, vi } from 'vitest';
import { InMemoryCache } from '@infobento/data';
import type { BentoConfig } from '@infobento/core';
import { hydrateConfig, type HydrateDeps } from './hydrate.js';

const FRESH = { temperature: 70, condition: 'Clear', high: 75, low: 60 } as const;

function weatherConfig(city: string, seed?: unknown): BentoConfig {
  return {
    boxes: [{ id: 'w', type: 'weather', config: { type: 'weather', city, data: seed } }],
    refreshesPerDay: 2,
  } as unknown as BentoConfig;
}

function oneBox(box: unknown): BentoConfig {
  return { boxes: [box], refreshesPerDay: 2 } as unknown as BentoConfig;
}

/**
 * Full HydrateDeps with a fresh cache and per-provider stubs. Stubs return `null`
 * (provider failure) by default so a test only wires the fetcher it exercises;
 * weather defaults to a value because most legacy cases assume it.
 */
function deps(overrides: Partial<HydrateDeps> = {}): HydrateDeps {
  return {
    cache: new InMemoryCache(),
    fetchWeather: async () => FRESH,
    fetchForecast: async () => null,
    fetchForecast3D: async () => null,
    fetchSunTimes: async () => null,
    fetchAirQuality: async () => null,
    fetchStocks: async () => null,
    fetchHoroscope: async () => null,
    fetchOnThisDay: async () => null,
    fetchQuote: async () => null,
    fetchJoke: async () => null,
    ...overrides,
  };
}

describe('hydrateConfig — weather', () => {
  it('replaces weather data with the freshly fetched value', async () => {
    const out = await hydrateConfig(
      weatherConfig('Portland'),
      deps({ fetchWeather: async () => FRESH }),
    );
    const box = out.boxes[0];
    if (box?.type !== 'weather') throw new Error('unreachable');
    expect(box.config?.data).toEqual(FRESH);
  });

  it('always replaces a stale baked seed, never keeps it (RFC §2 invariant)', async () => {
    const stale = { temperature: -99, condition: 'Old', high: 0, low: 0 };
    const out = await hydrateConfig(
      weatherConfig('Portland', stale),
      deps({ fetchWeather: async () => FRESH }),
    );
    const box = out.boxes[0];
    if (box?.type !== 'weather') throw new Error('unreachable');
    expect(box.config?.data).toEqual(FRESH);
  });

  it('clears data to undefined when the fetch fails (→ renderer placeholder)', async () => {
    const stale = { temperature: -99, condition: 'Old', high: 0, low: 0 };
    const out = await hydrateConfig(
      weatherConfig('Portland', stale),
      deps({ fetchWeather: async () => null }),
    );
    const box = out.boxes[0];
    if (box?.type !== 'weather') throw new Error('unreachable');
    expect(box.config?.data).toBeUndefined();
  });

  it('does not mutate the input config (immutable transform)', async () => {
    const input = weatherConfig('Portland');
    const out = await hydrateConfig(input, deps({ fetchWeather: async () => FRESH }));
    expect(out).not.toBe(input);
    const inBox = input.boxes[0];
    if (inBox?.type !== 'weather') throw new Error('unreachable');
    expect(inBox.config?.data).toBeUndefined();
  });

  it('dedups concurrent same-city fetches via the cache (single-flight)', async () => {
    let calls = 0;
    const cfg = {
      boxes: [
        { id: 'a', type: 'weather', config: { type: 'weather', city: 'Portland' } },
        { id: 'b', type: 'weather', config: { type: 'weather', city: 'Portland' } },
      ],
      refreshesPerDay: 2,
    } as unknown as BentoConfig;
    await hydrateConfig(
      cfg,
      deps({
        fetchWeather: async () => {
          calls++;
          return FRESH;
        },
      }),
    );
    expect(calls).toBe(1);
  });

  it('times out a hung weather fetch and degrades to placeholder (RFC §6)', async () => {
    vi.useFakeTimers();
    try {
      const hung = hydrateConfig(
        weatherConfig('Portland'),
        deps({ fetchWeather: () => new Promise(() => undefined) }), // never settles
      );
      await vi.advanceTimersByTimeAsync(9000); // past the 8s upstream timeout
      const out = await hung;
      const box = out.boxes[0];
      if (box?.type !== 'weather') throw new Error('unreachable');
      expect(box.config?.data).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it('passes non-live boxes through unchanged', async () => {
    const cfg = oneBox({ id: 't', type: 'text', config: { type: 'text', text: 'hi' } });
    const out = await hydrateConfig(cfg, deps());
    expect(out.boxes[0]).toEqual(cfg.boxes[0]);
  });
});

describe('hydrateConfig — data-bearing providers (replace on success, clear on failure)', () => {
  it('replaces forecast entries and passes hours through to the fetcher', async () => {
    const entries = [{ time: '14:00', temperature: 71, condition: 'Sunny' }];
    let seenHours: number | undefined;
    const out = await hydrateConfig(
      oneBox({ id: 'f', type: 'forecast', config: { type: 'forecast', city: 'Reno', hours: 6 } }),
      deps({
        fetchForecast: async (_city, hours) => {
          seenHours = hours;
          return entries;
        },
      }),
    );
    const box = out.boxes[0];
    if (box?.type !== 'forecast') throw new Error('unreachable');
    expect(box.config?.entries).toEqual(entries);
    expect(seenHours).toBe(6);
  });

  it('clears forecast3d entries to undefined on failure', async () => {
    const out = await hydrateConfig(
      oneBox({
        id: 'f',
        type: 'forecast3d',
        config: {
          type: 'forecast3d',
          city: 'Reno',
          entries: [{ day: 'Mon', high: 1, low: 0, condition: 'x' }],
        },
      }),
      deps({ fetchForecast3D: async () => null }),
    );
    const box = out.boxes[0];
    if (box?.type !== 'forecast3d') throw new Error('unreachable');
    expect(box.config?.entries).toBeUndefined();
  });

  it('replaces sun data', async () => {
    const data = { sunrise: '6:01 AM', sunset: '8:32 PM', dayLength: '14h 31m' };
    const out = await hydrateConfig(
      oneBox({ id: 's', type: 'sun', config: { type: 'sun', city: 'Reno' } }),
      deps({ fetchSunTimes: async () => data }),
    );
    const box = out.boxes[0];
    if (box?.type !== 'sun') throw new Error('unreachable');
    expect(box.config?.data).toEqual(data);
  });

  it('replaces aqi data', async () => {
    const data = { aqi: 42, category: 'Good', dominantPollutant: 'PM2.5' };
    const out = await hydrateConfig(
      oneBox({ id: 'a', type: 'aqi', config: { type: 'aqi', city: 'Reno' } }),
      deps({ fetchAirQuality: async () => data }),
    );
    const box = out.boxes[0];
    if (box?.type !== 'aqi') throw new Error('unreachable');
    expect(box.config?.data).toEqual(data);
  });

  it('replaces stocks data and passes symbol + duration through', async () => {
    const data = { price: 100, change: 1.5, changePercent: 1.5 };
    let seen: [string, string] | undefined;
    const out = await hydrateConfig(
      oneBox({
        id: 'k',
        type: 'stocks',
        config: { type: 'stocks', symbol: 'aapl', duration: '5d' },
      }),
      deps({
        fetchStocks: async (symbol, duration) => {
          seen = [symbol, duration];
          return data;
        },
      }),
    );
    const box = out.boxes[0];
    if (box?.type !== 'stocks') throw new Error('unreachable');
    expect(box.config?.data).toEqual(data);
    expect(seen).toEqual(['aapl', '5d']);
  });
});

describe('hydrateConfig — text-bearing providers (keep baked text on failure)', () => {
  it('replaces horoscope text + date on success', async () => {
    const out = await hydrateConfig(
      oneBox({
        id: 'h',
        type: 'horoscope',
        config: { type: 'horoscope', sign: 'aries', text: 'BAKED', date: 'old' },
      }),
      deps({ fetchHoroscope: async () => ({ sign: 'aries', text: 'NEW', date: '2026-06-24' }) }),
    );
    const box = out.boxes[0];
    if (box?.type !== 'horoscope') throw new Error('unreachable');
    expect(box.config?.text).toBe('NEW');
    expect(box.config?.date).toBe('2026-06-24');
  });

  it('keeps the baked horoscope reading on fetch failure (no blank box)', async () => {
    const out = await hydrateConfig(
      oneBox({
        id: 'h',
        type: 'horoscope',
        config: { type: 'horoscope', sign: 'aries', text: 'BAKED', date: 'old' },
      }),
      deps({ fetchHoroscope: async () => null }),
    );
    const box = out.boxes[0];
    if (box?.type !== 'horoscope') throw new Error('unreachable');
    expect(box.config?.text).toBe('BAKED');
    expect(box.config?.date).toBe('old');
  });

  it('refreshes onthisday text + year but preserves the request category', async () => {
    let seenCategory: string | undefined;
    const out = await hydrateConfig(
      oneBox({
        id: 'o',
        type: 'onthisday',
        config: { type: 'onthisday', text: 'old', year: '1900', category: 'births' },
      }),
      deps({
        fetchOnThisDay: async (category) => {
          seenCategory = category;
          return { text: 'NEW', year: '1990', category: 'events' };
        },
      }),
    );
    const box = out.boxes[0];
    if (box?.type !== 'onthisday') throw new Error('unreachable');
    expect(seenCategory).toBe('births');
    expect(box.config?.text).toBe('NEW');
    expect(box.config?.year).toBe('1990');
    expect(box.config?.category).toBe('births'); // request param preserved, not overwritten
  });

  it('re-fetches a random quote with the persisted tag filter, replacing the seed', async () => {
    let seenTags: string | undefined;
    const out = await hydrateConfig(
      oneBox({
        id: 'q',
        type: 'quote',
        config: { type: 'quote', text: 'SEED', author: 'Old', tags: 'wisdom' },
      }),
      deps({
        fetchQuote: async (tags) => {
          seenTags = tags;
          return { text: 'FRESH', author: 'Sage' };
        },
      }),
    );
    const box = out.boxes[0];
    if (box?.type !== 'quote') throw new Error('unreachable');
    expect(seenTags).toBe('wisdom');
    expect(box.config?.text).toBe('FRESH');
    expect(box.config?.author).toBe('Sage');
    expect(box.config?.tags).toBe('wisdom'); // filter preserved for the next pull
  });

  it('keeps the baked quote on fetch failure (no blank box)', async () => {
    const out = await hydrateConfig(
      oneBox({ id: 'q', type: 'quote', config: { type: 'quote', text: 'SEED', author: 'Old' } }),
      deps({ fetchQuote: async () => null }),
    );
    const box = out.boxes[0];
    if (box?.type !== 'quote') throw new Error('unreachable');
    expect(box.config?.text).toBe('SEED');
  });

  it('re-fetches a random joke with the persisted categories filter', async () => {
    let seenCategories: string | undefined;
    const out = await hydrateConfig(
      oneBox({
        id: 'j',
        type: 'joke',
        config: { type: 'joke', text: 'SEED', categories: 'Programming' },
      }),
      deps({
        fetchJoke: async (categories) => {
          seenCategories = categories;
          return { text: 'FRESH', category: 'Programming' };
        },
      }),
    );
    const box = out.boxes[0];
    if (box?.type !== 'joke') throw new Error('unreachable');
    expect(seenCategories).toBe('Programming');
    expect(box.config?.text).toBe('FRESH');
    expect(box.config?.category).toBe('Programming');
    expect(box.config?.categories).toBe('Programming'); // request filter preserved
  });
});

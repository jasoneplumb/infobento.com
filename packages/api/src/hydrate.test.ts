import { describe, it, expect, vi } from 'vitest';
import { InMemoryCache, type Cache, type CacheGetOptions } from '@infobento/data';
import type { BentoConfig } from '@infobento/core';
import { hydrateConfig, effectiveTtlMs, type HydrateDeps } from './hydrate.js';

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
    fetchUtcOffset: async () => null,
    fetchForecast: async () => null,
    fetchForecast3D: async () => null,
    fetchSunTimes: async () => null,
    fetchAirQuality: async () => null,
    fetchUvIndex: async () => null,
    fetchPollen: async () => null,
    fetchStocks: async () => null,
    fetchHoroscope: async () => null,
    fetchOnThisDay: async () => null,
    fetchQuote: async () => null,
    fetchNextPublicHoliday: async () => null,
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

  it('hydrates a uv box from its city', async () => {
    let seenCity: string | undefined;
    const out = await hydrateConfig(
      oneBox({ id: 'u', type: 'uv', config: { type: 'uv', city: 'Portland' } }),
      deps({
        fetchUvIndex: async (city) => {
          seenCity = city;
          return { uvIndex: 7, category: 'High' };
        },
      }),
    );
    const box = out.boxes[0];
    if (box?.type !== 'uv') throw new Error('unreachable');
    expect(seenCity).toBe('Portland');
    expect(box.config?.data).toEqual({ uvIndex: 7, category: 'High' });
  });

  it('hydrates a pollen box from its city', async () => {
    const out = await hydrateConfig(
      oneBox({ id: 'p', type: 'pollen', config: { type: 'pollen', city: 'Berlin' } }),
      deps({ fetchPollen: async () => ({ allergen: 'Birch', count: 240, level: 'High' }) }),
    );
    const box = out.boxes[0];
    if (box?.type !== 'pollen') throw new Error('unreachable');
    expect(box.config?.data).toEqual({ allergen: 'Birch', count: 240, level: 'High' });
  });

  it('leaves pollen data undefined outside coverage rather than inventing a zero', async () => {
    const out = await hydrateConfig(
      oneBox({ id: 'p', type: 'pollen', config: { type: 'pollen', city: 'Portland' } }),
      deps({ fetchPollen: async () => null }),
    );
    const box = out.boxes[0];
    if (box?.type !== 'pollen') throw new Error('unreachable');
    expect(box.config?.data).toBeUndefined();
  });

  it('skips the fetch entirely when a location box has no city', async () => {
    let called = false;
    await hydrateConfig(
      oneBox({ id: 'u', type: 'uv', config: { type: 'uv', city: '  ' } }),
      deps({
        fetchUvIndex: async () => {
          called = true;
          return { uvIndex: 3, category: 'Moderate' };
        },
      }),
    );
    expect(called).toBe(false);
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
});

describe('hydrateConfig — date box timezone (issue #166)', () => {
  const FRESH_TZ = { ...FRESH, utcOffsetSeconds: -7 * 3600 } as const;

  function withDate(...boxes: unknown[]): BentoConfig {
    return {
      boxes: [...boxes, { id: 'd', type: 'date', config: { type: 'date' } }],
      refreshesPerDay: 2,
    } as unknown as BentoConfig;
  }

  it("reuses a hydrated weather box's offset without an extra fetch", async () => {
    let offsetCalls = 0;
    const out = await hydrateConfig(
      withDate({ id: 'w', type: 'weather', config: { type: 'weather', city: 'Portland' } }),
      deps({
        fetchWeather: async () => FRESH_TZ,
        fetchUtcOffset: async () => {
          offsetCalls++;
          return 0;
        },
      }),
    );
    const date = out.boxes.find((b) => b.type === 'date');
    if (date?.type !== 'date') throw new Error('unreachable');
    expect(date.config?.data).toEqual({ utcOffsetSeconds: -7 * 3600 });
    expect(offsetCalls).toBe(0); // piggybacked — no standalone offset call
  });

  it('fetches the offset from a located box when no weather box exists', async () => {
    let seen: string | undefined;
    const out = await hydrateConfig(
      withDate({ id: 'f', type: 'forecast', config: { type: 'forecast', city: 'Denver' } }),
      deps({
        fetchUtcOffset: async (loc) => {
          seen = loc;
          return -6 * 3600;
        },
      }),
    );
    const date = out.boxes.find((b) => b.type === 'date');
    if (date?.type !== 'date') throw new Error('unreachable');
    expect(seen).toBe('Denver');
    expect(date.config?.data).toEqual({ utcOffsetSeconds: -6 * 3600 });
  });

  it('leaves the date box offset-less when there is no location anywhere', async () => {
    let offsetCalls = 0;
    const out = await hydrateConfig(
      withDate({ id: 't', type: 'text', config: { type: 'text', text: 'hi' } }),
      deps({
        fetchUtcOffset: async () => {
          offsetCalls++;
          return -6 * 3600;
        },
      }),
    );
    const date = out.boxes.find((b) => b.type === 'date');
    if (date?.type !== 'date') throw new Error('unreachable');
    expect(date.config?.data).toBeUndefined(); // renderer falls back to server time
    expect(offsetCalls).toBe(0);
  });

  it('uses the first weather box when several disagree', async () => {
    const out = await hydrateConfig(
      withDate(
        { id: 'w1', type: 'weather', config: { type: 'weather', city: 'Tokyo' } },
        { id: 'w2', type: 'weather', config: { type: 'weather', city: 'Portland' } },
      ),
      deps({
        fetchWeather: async (loc) => ({
          ...FRESH,
          utcOffsetSeconds: loc === 'Tokyo' ? 9 * 3600 : -7 * 3600,
        }),
      }),
    );
    const date = out.boxes.find((b) => b.type === 'date');
    if (date?.type !== 'date') throw new Error('unreachable');
    expect(date.config?.data).toEqual({ utcOffsetSeconds: 9 * 3600 });
  });

  it("uses the date box's own location over a co-located weather box (#168)", async () => {
    const out = await hydrateConfig(
      {
        boxes: [
          { id: 'w', type: 'weather', config: { type: 'weather', city: 'Portland' } },
          { id: 'd', type: 'date', config: { type: 'date', city: 'Tokyo' } },
        ],
        refreshesPerDay: 2,
      } as unknown as BentoConfig,
      deps({
        fetchWeather: async () => FRESH_TZ, // −7h
        fetchUtcOffset: async (loc) => (loc === 'Tokyo' ? 9 * 3600 : -7 * 3600),
      }),
    );
    const date = out.boxes.find((b) => b.type === 'date');
    if (date?.type !== 'date') throw new Error('unreachable');
    expect(date.config?.data).toEqual({ utcOffsetSeconds: 9 * 3600 }); // own city wins
  });

  it("resolves the date box's own location with no other location box (#168)", async () => {
    const out = await hydrateConfig(
      {
        boxes: [{ id: 'd', type: 'date', config: { type: 'date', city: 'Denver' } }],
        refreshesPerDay: 2,
      } as unknown as BentoConfig,
      deps({ fetchUtcOffset: async () => -6 * 3600 }),
    );
    const date = out.boxes.find((b) => b.type === 'date');
    if (date?.type !== 'date') throw new Error('unreachable');
    expect(date.config?.data).toEqual({ utcOffsetSeconds: -6 * 3600 });
  });
});

// --- #193: provider TTLs scale to the device's refresh interval --------------

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

describe('effectiveTtlMs (#193)', () => {
  it('scales the TTL down to the pull interval', () => {
    expect(effectiveTtlMs(6 * HOUR, 96)).toBe(15 * MIN); // "every 15 min"
    expect(effectiveTtlMs(30 * MIN, 96)).toBe(15 * MIN);
    expect(effectiveTtlMs(6 * HOUR, 24)).toBe(1 * HOUR); // "every hour"
  });

  it('never drops below the 5-minute upstream floor (bench cadences)', () => {
    expect(effectiveTtlMs(6 * HOUR, 5760)).toBe(5 * MIN); // 15 s pulls
    expect(effectiveTtlMs(15 * MIN, 1440)).toBe(5 * MIN); // 1 min pulls
  });

  it('keeps the base ceiling for slow cadences and missing/zero values', () => {
    expect(effectiveTtlMs(6 * HOUR, 2)).toBe(6 * HOUR); // 12 h pulls — unchanged
    expect(effectiveTtlMs(30 * MIN, 3)).toBe(30 * MIN);
    expect(effectiveTtlMs(6 * HOUR, undefined)).toBe(6 * HOUR);
    expect(effectiveTtlMs(6 * HOUR, 0)).toBe(6 * HOUR);
    expect(effectiveTtlMs(6 * HOUR, Number.NaN)).toBe(6 * HOUR);
  });
});

/** Cache stub that records the ttlMs each provider key was resolved with. */
function ttlCapturingCache(): { cache: Cache; ttls: Map<string, number> } {
  const ttls = new Map<string, number>();
  const cache: Cache = {
    get<T>(key: string, fetcher: () => Promise<T>, opts: CacheGetOptions): Promise<T> {
      ttls.set(key, opts.ttlMs);
      return fetcher();
    },
  };
  return { cache, ttls };
}

describe('hydrateConfig passes refresh-scaled TTLs to the cache (#193)', () => {
  const boxes = [
    { id: 'q', type: 'quote', config: { type: 'quote', text: 'seed' } },
    { id: 'w', type: 'weather', config: { type: 'weather', city: 'Portland' } },
    { id: 'd', type: 'date', config: { type: 'date', city: 'Portland' } },
  ];

  async function ttlsFor(refreshesPerDay: number): Promise<Map<string, number>> {
    const { cache, ttls } = ttlCapturingCache();
    await hydrateConfig({ boxes, refreshesPerDay } as unknown as BentoConfig, {
      ...deps(),
      cache,
      fetchUtcOffset: async () => -25200,
    });
    return ttls;
  }

  it('at 96/day (15 min) every provider TTL is the pull interval', async () => {
    const ttls = await ttlsFor(96);
    expect(ttls.get('quote:')).toBe(15 * MIN); // base 6 h, scaled down
    expect(ttls.get('weather:portland:F')).toBe(15 * MIN); // base 30 min, scaled down
  });

  it('at 2/day the base TTLs are unchanged', async () => {
    const ttls = await ttlsFor(2);
    expect(ttls.get('quote:')).toBe(6 * HOUR);
    expect(ttls.get('weather:portland:F')).toBe(30 * MIN);
  });

  it('the UTC-offset lookup keeps its base TTL even at bench cadence', async () => {
    const ttls = await ttlsFor(5760);
    expect(ttls.get('quote:')).toBe(5 * MIN); // floor
    expect(ttls.get('utcoffset:portland')).toBe(6 * HOUR); // not scaled
  });
});

describe('sun TTL is not refresh-scaled (#194 review finding)', () => {
  it('keeps the 6 h base TTL even at fast cadences — sun times are stable within a day', async () => {
    const { cache, ttls } = ttlCapturingCache();
    await hydrateConfig(
      {
        boxes: [{ id: 's', type: 'sun', config: { type: 'sun', city: 'Portland' } }],
        refreshesPerDay: 96,
      } as unknown as BentoConfig,
      { ...deps(), cache },
    );
    expect(ttls.get('sun:portland')).toBe(6 * HOUR);
  });
});

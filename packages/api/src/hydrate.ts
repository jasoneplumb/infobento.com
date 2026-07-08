/**
 * Intent: Resolve live box data at device-pull time so a scheduled refresh shows
 *   current values without anyone re-opening the editor (RFC 0001 §2).
 * Context: Called from getDeviceFrameForPull before renderBoth. Box configs are
 *   readonly, so this is an immutable transform — it returns a NEW config with
 *   reconstructed boxes, never mutating in place.
 * Pattern: Injected resolvers (cache + fetchers) keep it unit-testable. A failed
 *   fetch degrades gracefully: data-bearing boxes drop to `undefined` (renderer
 *   placeholder); text-bearing boxes (horoscope/onthisday) keep their last baked
 *   value, since the renderer feeds `config.text` straight into the layout and a
 *   day-old reading beats a blank panel.
 */

import type {
  BentoConfig,
  BentoBox,
  WeatherData,
  DateData,
  ForecastEntry,
  Forecast3DEntry,
  SunData,
  AQIData,
  StockData,
  StockDuration,
} from '@infobento/core';
import {
  InMemoryCache,
  fetchWeather as dataFetchWeather,
  fetchUtcOffset as dataFetchUtcOffset,
  fetchForecast as dataFetchForecast,
  fetchForecast3D as dataFetchForecast3D,
  fetchSunTimes as dataFetchSunTimes,
  fetchAirQuality as dataFetchAirQuality,
  fetchStocks as dataFetchStocks,
  fetchHoroscope as dataFetchHoroscope,
  fetchOnThisDay as dataFetchOnThisDay,
  fetchQuote as dataFetchQuote,
  fetchJoke as dataFetchJoke,
  type Cache,
  type HoroscopeResult,
  type OnThisDayResult,
  type QuoteResult,
  type JokeResult,
} from '@infobento/data';

export interface HydrateDeps {
  readonly cache: Cache;
  readonly fetchWeather: (location: string, unit: 'F' | 'C') => Promise<WeatherData | null>;
  readonly fetchUtcOffset: (location: string) => Promise<number | null>;
  readonly fetchForecast: (
    location: string,
    hours: number,
  ) => Promise<readonly ForecastEntry[] | null>;
  readonly fetchForecast3D: (
    location: string,
    days: number,
  ) => Promise<readonly Forecast3DEntry[] | null>;
  readonly fetchSunTimes: (location: string) => Promise<SunData | null>;
  readonly fetchAirQuality: (location: string) => Promise<AQIData | null>;
  readonly fetchStocks: (symbol: string, duration: StockDuration) => Promise<StockData | null>;
  readonly fetchHoroscope: (sign: string) => Promise<HoroscopeResult | null>;
  readonly fetchOnThisDay: (category: string) => Promise<OnThisDayResult | null>;
  readonly fetchQuote: (tags: string) => Promise<QuoteResult | null>;
  readonly fetchJoke: (categories: string) => Promise<JokeResult | null>;
}

// Per-provider freshness ceilings (RFC 0001 §3). Each is scaled down to the
// device's configured pull interval by effectiveTtlMs (#193) so "Refresh every
// 15 min" actually shows different content every 15 min — while the shared
// single-flight cache still collapses the wake-herd of devices in one
// city/sign/symbol into a single upstream call per window.
const WEATHER_TTL_MS = 30 * 60 * 1000;
const FORECAST_TTL_MS = 30 * 60 * 1000;
const FORECAST3D_TTL_MS = 3 * 60 * 60 * 1000;
const SUN_TTL_MS = 6 * 60 * 60 * 1000;
const AQI_TTL_MS = 30 * 60 * 1000;
const STOCKS_TTL_MS = 15 * 60 * 1000;
const HOROSCOPE_TTL_MS = 6 * 60 * 60 * 1000;
const ONTHISDAY_TTL_MS = 6 * 60 * 60 * 1000;
const QUOTE_TTL_MS = 6 * 60 * 60 * 1000;
const JOKE_TTL_MS = 6 * 60 * 60 * 1000;
// A location's UTC offset is stable across a pull cycle; cache it like sun times.
// Deliberately NOT scaled by the refresh interval: it's location metadata (not
// content the user expects to rotate) and sits on the rate-limited Nominatim path.
const OFFSET_TTL_MS = 6 * 60 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;
// Floor under the scaled TTLs: the bench/testing cadences (down to a 15 s pull
// interval) must not translate into upstream calls at that rate.
const MIN_UPSTREAM_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Scale a provider's base TTL to the device's configured refresh interval
 * (#193): content refetches as often as the user asked to refresh, but never
 * more often than the floor, and never less often than the base ceiling.
 * The cache only fetches on access, so slow cadences (interval > base) keep
 * today's behavior — fresh content at every pull, one upstream call per pull.
 */
export function effectiveTtlMs(baseTtlMs: number, refreshesPerDay: number | undefined): number {
  if (refreshesPerDay === undefined || refreshesPerDay <= 0) return baseTtlMs;
  const pullIntervalMs = DAY_MS / refreshesPerDay;
  return Math.min(baseTtlMs, Math.max(pullIntervalMs, MIN_UPSTREAM_INTERVAL_MS));
}

// Bound each upstream call well under the firmware's HTTP timeout, so a hung
// provider yields a placeholder frame instead of hanging the pull (RFC §6).
const PROVIDER_TIMEOUT_MS = 8000;

/** Reject `work` if it doesn't settle within `ms`. Clears the timer either way. */
function withTimeout<T>(work: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${String(ms)}ms`)), ms);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Resolve a provider value through the shared cache, returning `undefined` on any
 * failure (timeout, null result, or thrown error) so callers can apply the box's
 * own degradation policy. A `null` result throws inside the fetcher so it isn't
 * stored — the next pull retries rather than serving a miss for the whole TTL.
 */
function resolveCached<T>(
  deps: HydrateDeps,
  key: string,
  ttlMs: number,
  label: string,
  fetcher: () => Promise<T | null>,
): Promise<T | undefined> {
  return deps.cache
    .get<T>(
      key,
      async () => {
        try {
          const data = await withTimeout(fetcher(), PROVIDER_TIMEOUT_MS, label);
          if (data === null) throw new Error(`${label}: provider returned no data`);
          return data;
        } catch (err) {
          // Logged here (the single-flight fetcher runs once per key), so a
          // provider outage vs. a fetcher bug stays distinguishable without one
          // line per concurrent waiter. Waiters degrade via the catch below.
          console.warn(`hydrate: fetch failed for ${label}:`, err);
          throw err;
        }
      },
      { ttlMs },
    )
    .catch(() => undefined);
}

/**
 * Walk the config's boxes and replace each live box's data with a freshly
 * resolved value. **Always replace, never fill-absent** — persisted config_json
 * holds params only; any baked data is a discardable seed (RFC 0001 §2).
 */
export async function hydrateConfig(config: BentoConfig, deps: HydrateDeps): Promise<BentoConfig> {
  const ttlOf = (baseTtlMs: number): number => effectiveTtlMs(baseTtlMs, config.refreshesPerDay);
  const boxes = await Promise.all(config.boxes.map((box) => hydrateBox(box, deps, ttlOf)));
  return { ...config, boxes: await resolveDateOffsets(boxes, deps) };
}

/** First non-empty city on a location-bearing box, if any — the source for a
 *  date box's timezone when there's no weather box to piggyback on. */
function firstLocatedCity(boxes: readonly BentoBox[]): string | undefined {
  for (const box of boxes) {
    if (
      box.type === 'weather' ||
      box.type === 'forecast' ||
      box.type === 'forecast3d' ||
      box.type === 'sun' ||
      box.type === 'aqi'
    ) {
      const city = box.config?.city.trim();
      if (city) return city;
    }
  }
  return undefined;
}

/** Resolve a city's UTC offset through the shared cache (undefined on failure). */
function offsetForCity(city: string, deps: HydrateDeps): Promise<number | undefined> {
  return resolveCached<number>(
    deps,
    `utcoffset:${city.toLowerCase()}`,
    OFFSET_TTL_MS,
    `utcoffset "${city}"`,
    () => deps.fetchUtcOffset(city),
  );
}

/**
 * Device-wide fallback offset for date boxes that carry no location of their
 * own: prefer a hydrated weather box's offset (already fetched, zero extra
 * calls), else one lookup from the first located box's city. Undefined when
 * there's no location anywhere.
 */
async function deriveSharedOffset(
  boxes: readonly BentoBox[],
  deps: HydrateDeps,
): Promise<number | undefined> {
  for (const box of boxes) {
    if (box.type === 'weather' && box.config?.data?.utcOffsetSeconds !== undefined) {
      return box.config.data.utcOffsetSeconds;
    }
  }
  const city = firstLocatedCity(boxes);
  return city ? offsetForCity(city, deps) : undefined;
}

/**
 * Give every date box the UTC offset it should render in so it shows the *local*
 * date, not the server's UTC clock (issues #166, #168). Precedence per box:
 * its own configured location → a device-wide fallback (weather box, else first
 * located box) → left untouched, where the renderer falls back to server time.
 */
async function resolveDateOffsets(
  boxes: readonly BentoBox[],
  deps: HydrateDeps,
): Promise<BentoBox[]> {
  if (!boxes.some((box) => box.type === 'date')) return [...boxes];

  // The shared fallback is resolved at most once, and only if some date box
  // actually needs it (i.e. has no location of its own).
  let shared: number | undefined;
  let sharedDone = false;
  const sharedOffset = async (): Promise<number | undefined> => {
    if (!sharedDone) {
      shared = await deriveSharedOffset(boxes, deps);
      sharedDone = true;
    }
    return shared;
  };

  return Promise.all(
    boxes.map(async (box) => {
      if (box.type !== 'date') return box;
      const ownCity = box.config?.city?.trim();
      let offset = ownCity ? await offsetForCity(ownCity, deps) : undefined;
      offset ??= await sharedOffset();
      if (offset === undefined) return box;
      const data: DateData = { utcOffsetSeconds: offset };
      return { ...box, config: { ...(box.config ?? { type: 'date' }), data } };
    }),
  );
}

async function hydrateBox(
  box: BentoBox,
  deps: HydrateDeps,
  ttlOf: (baseTtlMs: number) => number,
): Promise<BentoBox> {
  switch (box.type) {
    case 'weather': {
      if (!box.config) return box; // unconfigured → renderer placeholder
      const city = box.config.city.trim();
      // Config carries no per-box unit (the editor uses a global setting); 'F'
      // matches fetchWeather's default. Per-box unit is an RFC open question.
      const data = city
        ? await resolveCached<WeatherData>(
            deps,
            `weather:${city.toLowerCase()}:F`,
            ttlOf(WEATHER_TTL_MS),
            `weather "${city}"`,
            () => deps.fetchWeather(city, 'F'),
          )
        : undefined;
      return { ...box, config: { ...box.config, data } };
    }
    case 'forecast': {
      if (!box.config) return box;
      const city = box.config.city.trim();
      const hours = box.config.hours ?? 3;
      const entries = city
        ? await resolveCached<readonly ForecastEntry[]>(
            deps,
            `forecast:${city.toLowerCase()}:${String(hours)}`,
            ttlOf(FORECAST_TTL_MS),
            `forecast "${city}"`,
            () => deps.fetchForecast(city, hours),
          )
        : undefined;
      return { ...box, config: { ...box.config, entries } };
    }
    case 'forecast3d': {
      if (!box.config) return box;
      const city = box.config.city.trim();
      const days = box.config.days ?? 3;
      const entries = city
        ? await resolveCached<readonly Forecast3DEntry[]>(
            deps,
            `forecast3d:${city.toLowerCase()}:${String(days)}`,
            ttlOf(FORECAST3D_TTL_MS),
            `forecast3d "${city}"`,
            () => deps.fetchForecast3D(city, days),
          )
        : undefined;
      return { ...box, config: { ...box.config, entries } };
    }
    case 'sun': {
      if (!box.config) return box;
      const city = box.config.city.trim();
      const data = city
        ? await resolveCached<SunData>(
            deps,
            `sun:${city.toLowerCase()}`,
            ttlOf(SUN_TTL_MS),
            `sun "${city}"`,
            () => deps.fetchSunTimes(city),
          )
        : undefined;
      return { ...box, config: { ...box.config, data } };
    }
    case 'aqi': {
      if (!box.config) return box;
      const city = box.config.city.trim();
      const data = city
        ? await resolveCached<AQIData>(
            deps,
            `aqi:${city.toLowerCase()}`,
            ttlOf(AQI_TTL_MS),
            `aqi "${city}"`,
            () => deps.fetchAirQuality(city),
          )
        : undefined;
      return { ...box, config: { ...box.config, data } };
    }
    case 'stocks': {
      if (!box.config) return box;
      const symbol = box.config.symbol.trim();
      const duration = box.config.duration ?? '1d';
      const data = symbol
        ? await resolveCached<StockData>(
            deps,
            `stocks:${symbol.toUpperCase()}:${duration}`,
            ttlOf(STOCKS_TTL_MS),
            `stocks "${symbol}"`,
            () => deps.fetchStocks(symbol, duration),
          )
        : undefined;
      return { ...box, config: { ...box.config, data } };
    }
    case 'horoscope': {
      if (!box.config) return box;
      const sign = box.config.sign.trim().toLowerCase();
      if (!sign) return box;
      const res = await resolveCached<HoroscopeResult>(
        deps,
        `horoscope:${sign}`,
        ttlOf(HOROSCOPE_TTL_MS),
        `horoscope "${sign}"`,
        () => deps.fetchHoroscope(sign),
      );
      // Keep the baked reading on failure — `text` is required and feeds straight
      // into the renderer; a day-old reading beats a blank box.
      if (!res) return box;
      return { ...box, config: { ...box.config, text: res.text, date: res.date } };
    }
    case 'onthisday': {
      if (!box.config) return box;
      // `category` is the user's request param (events/births/.../all); preserve
      // it — only the entry text + year are refreshed, never the request itself.
      const category = box.config.category ?? 'events';
      const res = await resolveCached<OnThisDayResult>(
        deps,
        `onthisday:${category}`,
        ttlOf(ONTHISDAY_TTL_MS),
        `onthisday "${category}"`,
        () => deps.fetchOnThisDay(category),
      );
      if (!res) return box;
      return { ...box, config: { ...box.config, text: res.text, year: res.year } };
    }
    case 'quote': {
      if (!box.config) return box;
      // Always-random (per product decision): the baked text is a discardable
      // seed re-fetched with the persisted tag filter on every pull. Key by tags
      // so the wake-herd collapses to one upstream call per filter per window.
      const tags = box.config.tags ?? '';
      const res = await resolveCached<QuoteResult>(
        deps,
        `quote:${tags.toLowerCase()}`,
        ttlOf(QUOTE_TTL_MS),
        `quote "${tags || 'any'}"`,
        () => deps.fetchQuote(tags),
      );
      // Keep the baked quote on failure — `text` is required by the renderer.
      if (!res) return box;
      return { ...box, config: { ...box.config, text: res.text, author: res.author } };
    }
    case 'joke': {
      if (!box.config) return box;
      const categories = box.config.categories ?? '';
      const res = await resolveCached<JokeResult>(
        deps,
        `joke:${categories.toLowerCase()}`,
        ttlOf(JOKE_TTL_MS),
        `joke "${categories || 'any'}"`,
        () => deps.fetchJoke(categories),
      );
      if (!res) return box;
      return { ...box, config: { ...box.config, text: res.text, category: res.category } };
    }
    default:
      // Non-live boxes (text/qr/date/moon/countdown/progress/calendar/habit)
      // hold user-authored or clock-derived content — nothing to re-fetch.
      return box;
  }
}

let sharedCache: Cache | undefined;

/**
 * Production hydration deps: a process-shared in-memory cache (so 1,000 devices
 * in one city make one upstream call per window) + the real @infobento/data
 * fetchers. The geo/forecast fetchers take a global 'F' unit to match the
 * editor's current single-unit behavior.
 */
export function defaultHydrateDeps(): HydrateDeps {
  sharedCache ??= new InMemoryCache();
  return {
    cache: sharedCache,
    fetchWeather: dataFetchWeather,
    fetchUtcOffset: dataFetchUtcOffset,
    fetchForecast: (location, hours) => dataFetchForecast(location, hours, 'F'),
    fetchForecast3D: (location, days) => dataFetchForecast3D(location, days, 'F'),
    fetchSunTimes: dataFetchSunTimes,
    fetchAirQuality: dataFetchAirQuality,
    fetchStocks: dataFetchStocks,
    fetchHoroscope: dataFetchHoroscope,
    fetchOnThisDay: dataFetchOnThisDay,
    fetchQuote: (tags) => dataFetchQuote({ tags }),
    fetchJoke: dataFetchJoke,
  };
}

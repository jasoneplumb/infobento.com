/**
 * Intent: Validate a `GET /api/box-data/:type` request and bind it to the one
 *         @infobento/data fetcher that answers it, plus its cache key and TTL.
 * Context: Issue #287 — Firefox ETP and content blockers block Open-Meteo (and
 *          can block Nominatim / Nager.Date) when the editor calls them from
 *          the browser, so the editor asks this same-origin route instead. The
 *          data fetchers stay the single implementation; device hydration calls
 *          the same ones (see hydrate.ts, whose base TTLs this reuses).
 * Pattern: Pure: no I/O until the returned `fetch` thunk runs. The route in
 *          server.ts owns caching, admission (rate limits) and the response.
 */

import {
  fetchAirQuality,
  fetchForecast,
  fetchForecast3D,
  fetchNextPublicHoliday,
  fetchPollen,
  fetchSunTimes,
  fetchUvIndex,
  fetchWeather,
  isValidCountryCode,
} from '@infobento/data';
import {
  AQI_TTL_MS,
  FORECAST3D_TTL_MS,
  FORECAST_TTL_MS,
  HOLIDAYS_TTL_MS,
  POLLEN_TTL_MS,
  SUN_TTL_MS,
  UV_TTL_MS,
  WEATHER_TTL_MS,
} from './hydrate.js';

/**
 * Longest accepted location. Generous for a street address, and short enough
 * that the client-chosen part of a cache key stays small.
 */
export const MAX_LOCATION_LENGTH = 200;

/** Same bounds as the core schema's forecast `hours` / forecast3d `days`. */
const HOURS_RANGE = { min: 1, max: 24, fallback: 3 } as const;
const DAYS_RANGE = { min: 1, max: 20, fallback: 3 } as const;

export interface BoxDataRequest {
  /** Provider-namespaced cache key, normalized so equivalent requests share it. */
  readonly key: string;
  readonly ttlMs: number;
  /** The upstream call; resolves to `null` on failure, like every data fetcher. */
  readonly fetch: () => Promise<unknown>;
}

export type BoxDataParseResult =
  | { readonly ok: true; readonly request: BoxDataRequest }
  | { readonly ok: false; readonly error: string };

type Query = (name: string) => string | undefined;

function fail(error: string): BoxDataParseResult {
  return { ok: false, error };
}

/** Trim and collapse whitespace; `undefined` when empty or over the limit. */
function parseLocation(raw: string | undefined): string | undefined {
  const location = (raw ?? '').trim().replace(/\s+/g, ' ');
  if (location === '' || location.length > MAX_LOCATION_LENGTH) return undefined;
  return location;
}

function parseUnit(raw: string | undefined): 'F' | 'C' | undefined {
  const unit = (raw ?? 'F').trim().toUpperCase();
  return unit === 'F' || unit === 'C' ? unit : undefined;
}

/** A base-10 integer within `range`, its fallback when absent, else `undefined`. */
function parseCount(
  raw: string | undefined,
  range: { readonly min: number; readonly max: number; readonly fallback: number },
): number | undefined {
  if (raw === undefined || raw.trim() === '') return range.fallback;
  if (!/^\d+$/.test(raw.trim())) return undefined;
  const n = Number(raw);
  return n >= range.min && n <= range.max ? n : undefined;
}

/**
 * The location + unit every temperature box takes, with the cache-key prefix
 * built from them, or a 400-worthy error message.
 */
function parseTemperatureTarget(
  type: string,
  query: Query,
): { readonly location: string; readonly unit: 'F' | 'C'; readonly key: string } | string {
  const location = parseLocation(query('location'));
  if (!location) return 'Invalid or missing location';
  const unit = parseUnit(query('unit'));
  if (!unit) return 'Invalid unit';
  return { location, unit, key: `${type}:${location.toLowerCase()}:${unit}` };
}

/** Bind a location-only box type (no unit or count parameters). */
function locationOnly(
  type: string,
  ttlMs: number,
  fetcher: (location: string) => Promise<unknown>,
  query: Query,
): BoxDataParseResult {
  const location = parseLocation(query('location'));
  if (!location) return fail('Invalid or missing location');
  return {
    ok: true,
    request: {
      key: `${type}:${location.toLowerCase()}`,
      ttlMs,
      fetch: () => fetcher(location),
    },
  };
}

/**
 * Parse a box-data request. `type` is the route's `:type` segment; `query`
 * reads a single query parameter. Returns a 400-worthy error message for an
 * unknown type or any invalid parameter, so nothing malformed reaches an
 * upstream or a cache key.
 */
export function parseBoxDataRequest(type: string, query: Query): BoxDataParseResult {
  switch (type) {
    case 'weather': {
      const target = parseTemperatureTarget(type, query);
      if (typeof target === 'string') return fail(target);
      const { location, unit, key } = target;
      return {
        ok: true,
        request: { key, ttlMs: WEATHER_TTL_MS, fetch: () => fetchWeather(location, unit) },
      };
    }
    case 'forecast': {
      const target = parseTemperatureTarget(type, query);
      if (typeof target === 'string') return fail(target);
      const hours = parseCount(query('hours'), HOURS_RANGE);
      if (hours === undefined) return fail('Invalid hours');
      const { location, unit, key } = target;
      return {
        ok: true,
        request: {
          key: `${key}:${String(hours)}`,
          ttlMs: FORECAST_TTL_MS,
          fetch: () => fetchForecast(location, hours, unit),
        },
      };
    }
    case 'forecast3d': {
      const target = parseTemperatureTarget(type, query);
      if (typeof target === 'string') return fail(target);
      const days = parseCount(query('days'), DAYS_RANGE);
      if (days === undefined) return fail('Invalid days');
      const { location, unit, key } = target;
      return {
        ok: true,
        request: {
          key: `${key}:${String(days)}`,
          ttlMs: FORECAST3D_TTL_MS,
          fetch: () => fetchForecast3D(location, days, unit),
        },
      };
    }
    case 'sun':
      return locationOnly(type, SUN_TTL_MS, fetchSunTimes, query);
    case 'aqi':
      return locationOnly(type, AQI_TTL_MS, fetchAirQuality, query);
    case 'uv':
      return locationOnly(type, UV_TTL_MS, fetchUvIndex, query);
    case 'pollen':
      return locationOnly(type, POLLEN_TTL_MS, fetchPollen, query);
    case 'holidays': {
      const code = (query('country') ?? '').trim().toUpperCase();
      if (!isValidCountryCode(code)) return fail('Invalid or missing country');
      return {
        ok: true,
        request: {
          key: `holidays:${code}`,
          ttlMs: HOLIDAYS_TTL_MS,
          fetch: () => fetchNextPublicHoliday(code),
        },
      };
    }
    default:
      return fail('Unknown box type');
  }
}

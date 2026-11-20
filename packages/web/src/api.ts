/**
 * Client-side API helpers for the web editor's live previews.
 *
 * Every helper calls a same-origin Hono route, never a third-party host:
 * tracker blocklists (Firefox ETP, content blockers) block providers like
 * Open-Meteo when the browser calls them directly (#183, #287). The routes run
 * the shared @infobento/data fetchers — the same ones device hydration uses —
 * and apply server-side caching plus, for quote/horoscope, bundled fallbacks.
 */

import type {
  AQIData,
  Forecast3DEntry,
  ForecastEntry,
  HolidayData,
  PollenData,
  StockDuration,
  SunData,
  UVData,
  WeatherData,
} from '@infobento/core';
// Proxy-fetcher result shapes are single-sourced in @infobento/data (the API's
// proxy routes return exactly these). Imported for the local annotations below
// and re-exported, so the two packages never drift apart.
import type { QuoteResult, HoroscopeResult, OnThisDayResult, StocksResult } from '@infobento/data';
import { isValidCountryCode } from '@infobento/data';

export type { QuoteResult, HoroscopeResult, OnThisDayResult, StocksResult };

// -- Location-based + holiday box data (via /api/box-data) -------------------

/**
 * GET `/api/box-data/:type` and unwrap its `{ data }` envelope. Returns null on
 * a network error, a non-2xx (bad request, rate limit), or when the upstream
 * had nothing — the editor shows one "not found or fetch failed" state for all.
 */
async function fetchBoxData<T>(type: string, params: Record<string, string>): Promise<T | null> {
  try {
    const res = await fetch(`/api/box-data/${type}?${new URLSearchParams(params).toString()}`);
    if (!res.ok) return null;
    const body = (await res.json()) as { data?: T | null };
    return body.data ?? null;
  } catch {
    return null;
  }
}

/** Fetch a location-parameterized box's data; null without a request when empty. */
function fetchForLocation<T>(
  type: string,
  location: string,
  extra: Record<string, string> = {},
): Promise<T | null> {
  const trimmed = location.trim();
  if (!trimmed) return Promise.resolve(null);
  return fetchBoxData<T>(type, { location: trimmed, ...extra });
}

/** Current conditions + today's high/low. */
export function fetchWeather(location: string, unit: 'F' | 'C' = 'F'): Promise<WeatherData | null> {
  return fetchForLocation<WeatherData>('weather', location, { unit });
}

/** The next `hours` hourly forecast entries. */
export function fetchForecast(
  location: string,
  hours = 3,
  unit: 'F' | 'C' = 'F',
): Promise<ForecastEntry[] | null> {
  return fetchForLocation<ForecastEntry[]>('forecast', location, { hours: String(hours), unit });
}

/** The next `days` daily forecast entries (today excluded). */
export function fetchForecast3D(
  location: string,
  days = 3,
  unit: 'F' | 'C' = 'F',
): Promise<Forecast3DEntry[] | null> {
  return fetchForLocation<Forecast3DEntry[]>('forecast3d', location, { days: String(days), unit });
}

/** Today's sunrise, sunset and day length. */
export function fetchSunTimes(location: string): Promise<SunData | null> {
  return fetchForLocation<SunData>('sun', location);
}

/** Current air quality. */
export function fetchAirQuality(location: string): Promise<AQIData | null> {
  return fetchForLocation<AQIData>('aqi', location);
}

/** Current UV index. */
export function fetchUvIndex(location: string): Promise<UVData | null> {
  return fetchForLocation<UVData>('uv', location);
}

/** Current pollen load; null also when the location is outside coverage. */
export function fetchPollen(location: string): Promise<PollenData | null> {
  return fetchForLocation<PollenData>('pollen', location);
}

/** Next public holiday for an ISO 3166-1 alpha-2 country code. */
export function fetchNextPublicHoliday(countryCode: string): Promise<HolidayData | null> {
  const code = countryCode.trim().toUpperCase();
  // Same check the route applies, so a malformed code costs no round trip.
  if (!isValidCountryCode(code)) return Promise.resolve(null);
  return fetchBoxData<HolidayData>('holidays', { country: code });
}

// -- Quote (via Hono API proxy) ---------------------------------------------

/** Max quote length that fits in the box without truncation.
 *  ~3 lines × ~37 chars/line at any scale factor (both scale
 *  proportionally, so the character budget is roughly constant). */
const MAX_QUOTE_LENGTH = 120;

/**
 * Fetch a stock quote via the /api/stocks proxy. Symbol is uppercased
 * server-side. Returns null on network/API failure or no quote data.
 */
export async function fetchStocks(
  symbol: string,
  duration?: StockDuration,
): Promise<StocksResult | null> {
  const trimmed = symbol.trim().toUpperCase();
  if (!trimmed) return null;
  try {
    const params = new URLSearchParams({ symbol: trimmed });
    if (duration) params.set('duration', duration);
    const res = await fetch(`/api/stocks?${params.toString()}`);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      price?: number;
      change?: number;
      changePercent?: number;
    };
    if (data.price == null || data.change == null || data.changePercent == null) return null;
    return {
      price: data.price,
      change: data.change,
      changePercent: data.changePercent,
    };
  } catch {
    return null;
  }
}

/**
 * Fetch a random "On This Day" entry for today's UTC date via the
 * /api/onthisday proxy. `category` is one of events/births/deaths/holidays/all.
 * Returns null on network/API failure or empty pool.
 */
export async function fetchOnThisDay(category?: string): Promise<OnThisDayResult | null> {
  try {
    const params = new URLSearchParams();
    if (category && category.trim()) params.set('category', category.trim());
    const qs = params.toString();
    const res = await fetch(`/api/onthisday${qs ? `?${qs}` : ''}`);
    if (!res.ok) return null;
    const data = (await res.json()) as { text?: string; year?: string; category?: string };
    if (!data.text) return null;
    return { text: data.text, year: data.year ?? '', category: data.category ?? '' };
  } catch {
    return null;
  }
}

/**
 * Fetch a daily horoscope reading for the given zodiac sign via the
 * /api/horoscope proxy. Returns null on network/API failure.
 */
export async function fetchHoroscope(sign: string): Promise<HoroscopeResult | null> {
  const trimmed = sign.trim().toLowerCase();
  if (!trimmed) return null;
  try {
    const res = await fetch(`/api/horoscope?sign=${encodeURIComponent(trimmed)}`);
    if (!res.ok) return null;
    const data = (await res.json()) as { sign?: string; text?: string; date?: string };
    if (!data.text) return null;
    return { sign: data.sign ?? trimmed, text: data.text, date: data.date ?? '' };
  } catch {
    return null;
  }
}

/**
 * Fetch a random quote from the /api/quote proxy endpoint.
 * Optional `tags` (comma-separated) steers selection to topics like
 * "wisdom, happiness". Server enforces maxLength so retry-for-length
 * is unnecessary. Returns null on network/API failure or no match.
 */
export async function fetchQuote(tags?: string): Promise<QuoteResult | null> {
  try {
    const params = new URLSearchParams();
    params.set('maxLength', String(MAX_QUOTE_LENGTH));
    if (tags && tags.trim()) params.set('tags', tags.trim());
    const res = await fetch(`/api/quote?${params.toString()}`);
    if (!res.ok) return null;
    const data = (await res.json()) as { q?: string; a?: string };
    if (!data.q) return null;
    return { text: data.q, author: data.a ?? '' };
  } catch {
    return null;
  }
}

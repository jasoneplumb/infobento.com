/**
 * Client-side API helpers for the web editor's live previews.
 *
 * The location-based fetchers (weather, forecast, forecast3d, sun, air quality)
 * now live in @infobento/data and are re-exported here, so the editor preview
 * and the API's pull-time hydration share one implementation (RFC 0001 Phase 1).
 * The helpers below proxy through the Hono API, whose routes apply the
 * server-side provider logic + bundled quota fallbacks.
 */

import type { StockDuration } from '@infobento/core';
// Proxy-fetcher result shapes are single-sourced in @infobento/data (the API's
// proxy routes return exactly these). Imported for the local annotations below
// and re-exported, so the two packages never drift apart.
import type { QuoteResult, HoroscopeResult, OnThisDayResult, StocksResult } from '@infobento/data';

// Location-based fetchers — re-exported from the shared data package. Geocoding
// (Nominatim) + weather/AQI (Open-Meteo) are keyless and browser-safe.
export {
  fetchWeather,
  fetchForecast,
  fetchForecast3D,
  fetchSunTimes,
  fetchAirQuality,
} from '@infobento/data';

export type { QuoteResult, HoroscopeResult, OnThisDayResult, StocksResult };

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

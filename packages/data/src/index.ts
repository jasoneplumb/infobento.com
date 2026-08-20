/**
 * @infobento/data — shared, pure box-data provider package (RFC 0001).
 *
 * All resolvers are `fetch`-only (no DOM/window), so the web editor (previews)
 * and the api (pull-time hydration + thin proxy routes) share one
 * implementation. Every resolver returns its result or `null` on failure — the
 * resilience primitive callers build on.
 */

// Caching + rate-limiting primitives
export { type Cache, type CacheGetOptions, InMemoryCache } from './cache.js';
export { RateLimitedQueue } from './nominatim-queue.js';

// Geocoding (the `__setNominatimQueue` test seam is intentionally not re-exported)
export { geocode, NOMINATIM_MIN_INTERVAL_MS, type GeocodeResult } from './geocode.js';

// Direct fetchers (Open-Meteo)
export {
  fetchWeather,
  fetchUtcOffset,
  fetchForecast,
  fetchForecast3D,
  fetchSunTimes,
} from './weather.js';
export { fetchAirQuality } from './air-quality.js';
export { fetchUvIndex, uvCategory } from './uv.js';
export { fetchPollen } from './pollen.js';
export { fetchIpLocation, type IpLocationResult } from './ip-location.js';

// Proxy-provider fetchers (logic formerly inside api/src/server.ts handlers)
export {
  fetchQuote,
  normalizeQuoteTags,
  type QuoteResult,
  type FetchQuoteOptions,
} from './quote.js';
export { fetchHoroscope, VALID_ZODIAC_SIGNS, type HoroscopeResult } from './horoscope.js';
export { fetchOnThisDay, VALID_ONTHISDAY_CATEGORIES, type OnThisDayResult } from './onthisday.js';
export { fetchStocks, isValidStockSymbol, STOCK_RANGE_MAP, type StocksResult } from './stocks.js';
export { fetchNextPublicHoliday } from './holidays.js';

// SSRF-safe fetch guard (Node-only — uses dns resolution; see safe-fetch.ts header)
export { safeFetch, SsrfError, type SafeFetchOptions, type SafeFetchResult } from './safe-fetch.js';

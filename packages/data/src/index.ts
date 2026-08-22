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

// The SSRF fetch guard is deliberately NOT re-exported here. It imports
// `node:dns/promises`, and this barrel is consumed by `web` — re-exporting it
// pulls a Node-only module into the browser graph, where Vite externalizes
// `node:dns/promises` and rollup then fails on the named `resolve4` import.
// Import it from '@infobento/data/safe-fetch' instead; that subpath is the
// package's one Node-only entry point and the rest of this barrel stays
// browser- and edge-safe. See #231.

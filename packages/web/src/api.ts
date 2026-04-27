/**
 * Client-side API helpers for fetching weather and quote data.
 * Geocoding via Nominatim (OpenStreetMap). Weather data via Open-Meteo
 * (no API key). Quotes proxy through the Hono API.
 */

import type {
  WeatherData,
  ForecastEntry,
  Forecast3DEntry,
  SunData,
  AQIData,
  StockDuration,
} from '@infobento/core';

// -- Geocoding (Nominatim / OpenStreetMap) ----------------------------------

interface GeocodeResult {
  latitude: number;
  longitude: number;
  displayName: string;
}

interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
}

/**
 * Resolve a free-form location string to lat/lon using Nominatim.
 * Handles cities ("Portland"), city + region ("Portland, OR"), landmarks
 * ("Mt. St. Helens"), addresses, etc. Returns null on failure.
 *
 * Nominatim usage policy: 1 req/sec; user-agent and language headers help.
 */
async function geocode(query: string): Promise<GeocodeResult | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;

  try {
    const url =
      `https://nominatim.openstreetmap.org/search` +
      `?q=${encodeURIComponent(trimmed)}` +
      `&format=json&limit=1`;
    const res = await fetch(url, {
      headers: { 'Accept-Language': 'en' },
    });
    if (!res.ok) return null;

    const data = (await res.json()) as NominatimResult[];
    const first = data[0];
    if (!first) return null;

    const latitude = Number(first.lat);
    const longitude = Number(first.lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

    return { latitude, longitude, displayName: first.display_name };
  } catch {
    return null;
  }
}

// -- Weather (Open-Meteo) ---------------------------------------------------

/** Map WMO weather_code to a human-readable condition string */
function weatherCondition(code: number): string {
  if (code === 0) return 'Clear';
  if (code >= 1 && code <= 3) return 'Partly Cloudy';
  if (code >= 45 && code <= 48) return 'Foggy';
  if (code >= 51 && code <= 67) return 'Rain';
  if (code >= 71 && code <= 77) return 'Snow';
  if (code >= 80 && code <= 82) return 'Showers';
  if (code >= 95 && code <= 99) return 'Thunderstorm';
  return 'Unknown';
}

/** Convert Celsius to Fahrenheit, rounded to nearest integer */
function cToF(c: number): number {
  return Math.round((c * 9) / 5 + 32);
}

interface OpenMeteoForecast {
  current: {
    temperature_2m: number;
    weather_code: number;
  };
  daily: {
    temperature_2m_max: number[];
    temperature_2m_min: number[];
  };
}

/**
 * Geocode a location and fetch current weather from Open-Meteo.
 * Returns null if the location cannot be found or the request fails.
 */
export async function fetchWeather(location: string): Promise<WeatherData | null> {
  const place = await geocode(location);
  if (!place) return null;

  try {
    const weatherUrl =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${String(place.latitude)}` +
      `&longitude=${String(place.longitude)}` +
      `&current=temperature_2m,weather_code` +
      `&daily=temperature_2m_max,temperature_2m_min` +
      `&timezone=auto&forecast_days=1`;
    const weatherRes = await fetch(weatherUrl);
    if (!weatherRes.ok) return null;

    const forecast = (await weatherRes.json()) as OpenMeteoForecast;
    const highC = forecast.daily.temperature_2m_max[0];
    const lowC = forecast.daily.temperature_2m_min[0];
    if (highC === undefined || lowC === undefined) return null;

    return {
      temperature: cToF(forecast.current.temperature_2m),
      condition: weatherCondition(forecast.current.weather_code),
      high: cToF(highC),
      low: cToF(lowC),
    };
  } catch {
    return null;
  }
}

// -- 8-hour forecast (Open-Meteo) -------------------------------------------

interface OpenMeteoHourly {
  hourly: {
    time: string[];
    temperature_2m: number[];
    weather_code: number[];
  };
}

/**
 * Geocode a location and fetch the next 8 hourly forecast entries
 * from Open-Meteo. Returns null on failure.
 */
export async function fetchForecast(location: string): Promise<ForecastEntry[] | null> {
  const place = await geocode(location);
  if (!place) return null;

  try {
    const url =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${String(place.latitude)}` +
      `&longitude=${String(place.longitude)}` +
      `&hourly=temperature_2m,weather_code` +
      `&timezone=auto&forecast_days=2`;
    const res = await fetch(url);
    if (!res.ok) return null;

    const data = (await res.json()) as OpenMeteoHourly;
    const { time, temperature_2m, weather_code } = data.hourly;

    // Find the index of the current hour, then take the next 8 entries
    const now = new Date();
    const currentHourIso = `${String(now.getFullYear())}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}T${String(now.getHours()).padStart(2, '0')}:00`;
    let startIdx = time.findIndex((t) => t >= currentHourIso);
    if (startIdx < 0) startIdx = 0;

    const entries: ForecastEntry[] = [];
    for (let offset = 1; offset <= 8; offset++) {
      const i = startIdx + offset;
      const t = time[i];
      const temp = temperature_2m[i];
      const code = weather_code[i];
      if (t === undefined || temp === undefined || code === undefined) break;
      // t is like '2026-04-22T15:00' — slice the HH:MM part
      const hhmm = t.length >= 16 ? t.slice(11, 16) : t;
      entries.push({
        time: hhmm,
        temperature: cToF(temp),
        condition: weatherCondition(code),
      });
    }

    return entries.length > 0 ? entries : null;
  } catch {
    return null;
  }
}

// -- 8-day daily forecast (Open-Meteo) --------------------------------------

interface OpenMeteoDaily3D {
  daily: {
    time: string[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    weather_code: number[];
  };
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/**
 * Geocode a location and fetch the next 8 days of daily forecast data
 * from Open-Meteo. Returns null on failure.
 */
export async function fetchForecast3D(location: string): Promise<Forecast3DEntry[] | null> {
  const place = await geocode(location);
  if (!place) return null;

  try {
    const url =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${String(place.latitude)}` +
      `&longitude=${String(place.longitude)}` +
      `&daily=temperature_2m_max,temperature_2m_min,weather_code` +
      `&timezone=auto&forecast_days=9`;
    const res = await fetch(url);
    if (!res.ok) return null;

    const data = (await res.json()) as OpenMeteoDaily3D;
    const { time, temperature_2m_max, temperature_2m_min, weather_code } = data.daily;

    // Skip today (index 0), take next 8 days
    const entries: Forecast3DEntry[] = [];
    for (let i = 1; i <= 8; i++) {
      const t = time[i];
      const high = temperature_2m_max[i];
      const low = temperature_2m_min[i];
      const code = weather_code[i];
      if (t === undefined || high === undefined || low === undefined || code === undefined) break;

      const dayOfWeek = DAY_NAMES[new Date(t + 'T00:00').getDay()];
      entries.push({
        day: dayOfWeek ?? t.slice(5, 10),
        high: cToF(high),
        low: cToF(low),
        condition: weatherCondition(code),
      });
    }

    return entries.length > 0 ? entries : null;
  } catch {
    return null;
  }
}

// -- Sunrise/Sunset (Open-Meteo daily) -------------------------------------

interface OpenMeteoDailySun {
  daily: {
    sunrise: string[];
    sunset: string[];
  };
}

/**
 * Format minutes duration into "Xh Ym" string
 */
function formatDayLength(sunriseIso: string, sunsetIso: string): string {
  const rise = new Date(sunriseIso);
  const set = new Date(sunsetIso);
  const totalMinutes = Math.round((set.getTime() - rise.getTime()) / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours)}h ${String(minutes)}m`;
}

/**
 * Geocode a location and fetch today's sunrise/sunset from Open-Meteo daily forecast.
 * Returns null if the location cannot be found or the request fails.
 */
export async function fetchSunTimes(location: string): Promise<SunData | null> {
  const place = await geocode(location);
  if (!place) return null;

  try {
    const url =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${String(place.latitude)}` +
      `&longitude=${String(place.longitude)}` +
      `&daily=sunrise,sunset` +
      `&timezone=auto&forecast_days=1`;
    const res = await fetch(url);
    if (!res.ok) return null;

    const data = (await res.json()) as OpenMeteoDailySun;
    const sunriseIso = data.daily.sunrise[0];
    const sunsetIso = data.daily.sunset[0];
    if (!sunriseIso || !sunsetIso) return null;

    // Extract HH:MM from ISO datetime like '2026-04-23T06:12'
    const sunrise = sunriseIso.length >= 16 ? sunriseIso.slice(11, 16) : sunriseIso;
    const sunset = sunsetIso.length >= 16 ? sunsetIso.slice(11, 16) : sunsetIso;
    const dayLength = formatDayLength(sunriseIso, sunsetIso);

    return { sunrise, sunset, dayLength };
  } catch {
    return null;
  }
}

// -- Air Quality (Open-Meteo Air Quality API) --------------------------------

interface OpenMeteoAirQuality {
  current: {
    european_aqi: number;
    pm2_5?: number;
    pm10?: number;
    nitrogen_dioxide?: number;
    ozone?: number;
    sulphur_dioxide?: number;
    uv_index?: number;
  };
}

/**
 * Map European AQI value to US EPA category string
 */
function aqiCategory(aqi: number): string {
  if (aqi <= 50) return 'Good';
  if (aqi <= 100) return 'Moderate';
  if (aqi <= 150) return 'Unhealthy for Sensitive';
  if (aqi <= 200) return 'Unhealthy';
  if (aqi <= 300) return 'Very Unhealthy';
  return 'Hazardous';
}

/**
 * Determine dominant pollutant from Open-Meteo current data
 */
function dominantPollutant(current: OpenMeteoAirQuality['current']): string {
  const candidates: Array<[string, number | undefined]> = [
    ['PM2.5', current.pm2_5],
    ['PM10', current.pm10],
    ['NO2', current.nitrogen_dioxide],
    ['O3', current.ozone],
    ['SO2', current.sulphur_dioxide],
  ];

  let maxName = 'PM2.5';
  let maxValue = -1;
  for (const [name, value] of candidates) {
    if (value != null && value > maxValue) {
      maxValue = value;
      maxName = name;
    }
  }
  return maxName;
}

/**
 * Geocode a location and fetch current air quality from Open-Meteo Air Quality API.
 * Returns null if the location cannot be found or the request fails.
 */
export async function fetchAirQuality(location: string): Promise<AQIData | null> {
  const place = await geocode(location);
  if (!place) return null;

  try {
    const url =
      `https://air-quality-api.open-meteo.com/v1/air-quality` +
      `?latitude=${String(place.latitude)}` +
      `&longitude=${String(place.longitude)}` +
      `&current=european_aqi,pm2_5,pm10,nitrogen_dioxide,ozone,sulphur_dioxide,uv_index`;
    const res = await fetch(url);
    if (!res.ok) return null;

    const data = (await res.json()) as OpenMeteoAirQuality;
    const { current } = data;
    const aqi = current.european_aqi;
    if (aqi == null) return null;

    return {
      aqi: Math.round(aqi),
      category: aqiCategory(aqi),
      dominantPollutant: dominantPollutant(current),
      uvIndex: current.uv_index,
    };
  } catch {
    return null;
  }
}

// -- Quote (via Hono API proxy) ---------------------------------------------

export interface QuoteResult {
  text: string;
  author: string;
}

/** Max quote length that fits in the box without truncation.
 *  ~3 lines × ~37 chars/line at any scale factor (both scale
 *  proportionally, so the character budget is roughly constant). */
const MAX_QUOTE_LENGTH = 120;

export interface HoroscopeResult {
  sign: string;
  text: string;
  date: string;
}

export interface StocksResult {
  price: number;
  change: number;
  changePercent: number;
}

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

export interface OnThisDayResult {
  text: string;
  year: string;
  category: string;
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

export interface JokeResult {
  text: string;
  category: string;
}

/**
 * Fetch a fresh joke from the /api/joke proxy. Optional `categories`
 * (comma-separated) filters by JokeAPI category. Returns null on
 * network/API failure or no match.
 */
export async function fetchJoke(categories?: string): Promise<JokeResult | null> {
  try {
    const params = new URLSearchParams();
    if (categories && categories.trim()) params.set('categories', categories.trim());
    const qs = params.toString();
    const res = await fetch(`/api/joke${qs ? `?${qs}` : ''}`);
    if (!res.ok) return null;
    const data = (await res.json()) as { text?: string; category?: string };
    if (!data.text) return null;
    return { text: data.text, category: data.category ?? '' };
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

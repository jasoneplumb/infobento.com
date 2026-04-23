/**
 * Client-side API helpers for fetching weather and quote data.
 * Geocoding via Nominatim (OpenStreetMap). Weather data via Open-Meteo
 * (no API key). Quotes proxy through the Hono API.
 */

import type { WeatherData, ForecastEntry } from '@infobento/core';

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

// -- 3-hour forecast (Open-Meteo) -------------------------------------------

interface OpenMeteoHourly {
  hourly: {
    time: string[];
    temperature_2m: number[];
    weather_code: number[];
  };
}

/**
 * Geocode a location and fetch the next 3 hourly forecast entries (h+1, h+2, h+3)
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

    // Find the index of the current hour, then take the next 3 entries
    const now = new Date();
    const currentHourIso = `${String(now.getFullYear())}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}T${String(now.getHours()).padStart(2, '0')}:00`;
    let startIdx = time.findIndex((t) => t >= currentHourIso);
    if (startIdx < 0) startIdx = 0;

    const entries: ForecastEntry[] = [];
    for (let offset = 1; offset <= 3; offset++) {
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

// -- Quote (via Hono API proxy) ---------------------------------------------

export interface QuoteResult {
  text: string;
  author: string;
}

/**
 * Fetch a random quote from the /api/quote proxy endpoint.
 * Returns null if the API is unavailable (e.g. dev mode without API running).
 */
export async function fetchQuote(): Promise<QuoteResult | null> {
  try {
    const res = await fetch('/api/quote');
    if (!res.ok) return null;

    const data = (await res.json()) as { q?: string; a?: string };
    if (!data.q) return null;

    return { text: data.q, author: data.a ?? '' };
  } catch {
    return null;
  }
}

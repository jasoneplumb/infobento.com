/**
 * Client-side API helpers for fetching weather and quote data.
 * Weather uses Open-Meteo (no API key). Quotes proxy through the Hono API.
 */

import type { WeatherData } from '@infobento/core';

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

interface GeoResult {
  latitude: number;
  longitude: number;
  name: string;
}

interface GeoResponse {
  results?: GeoResult[];
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
 * Geocode a city name and fetch current weather from Open-Meteo.
 * Returns null if the city cannot be found or the request fails.
 */
export async function fetchWeather(city: string): Promise<WeatherData | null> {
  if (!city.trim()) return null;

  try {
    // Step 1: Geocode
    const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city.trim())}&count=1`;
    const geoRes = await fetch(geoUrl);
    if (!geoRes.ok) return null;

    const geoData = (await geoRes.json()) as GeoResponse;
    const location = geoData.results?.[0];
    if (!location) return null;

    // Step 2: Fetch weather
    const weatherUrl =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${location.latitude}` +
      `&longitude=${location.longitude}` +
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

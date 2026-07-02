/**
 * Intent: Current weather, hourly/daily forecasts, and sunrise/sunset from
 *         Open-Meteo (keyless), geocoding the location first.
 * Context: Lifted verbatim from web/src/api.ts (RFC 0001 Phase 1) so the editor
 *          preview and pull-time hydration share one implementation.
 * Pattern: Pure `fetch`; returns null on any failure.
 */

import type { WeatherData, ForecastEntry, Forecast3DEntry, SunData } from '@infobento/core';
import { geocode } from './geocode.js';

/** Map WMO weather_code to a human-readable condition string. */
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

/** Convert Celsius to Fahrenheit, rounded to nearest integer. */
function cToF(c: number): number {
  return Math.round((c * 9) / 5 + 32);
}

/** Convert an Open-Meteo Celsius value to the requested display unit, rounded. */
function toTemp(celsius: number, unit: 'F' | 'C'): number {
  return unit === 'C' ? Math.round(celsius) : cToF(celsius);
}

interface OpenMeteoForecast {
  /** Location's offset from UTC in seconds — present when timezone=auto. */
  utc_offset_seconds?: number;
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
export async function fetchWeather(
  location: string,
  unit: 'F' | 'C' = 'F',
): Promise<WeatherData | null> {
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
      temperature: toTemp(forecast.current.temperature_2m, unit),
      condition: weatherCondition(forecast.current.weather_code),
      high: toTemp(highC, unit),
      low: toTemp(lowC, unit),
      // Only include when the provider returned it, so callers that omit
      // timezone=auto don't get an undefined-valued key.
      ...(forecast.utc_offset_seconds !== undefined
        ? { utcOffsetSeconds: forecast.utc_offset_seconds }
        : {}),
    };
  } catch {
    return null;
  }
}

/**
 * Geocode a location and return only its current offset from UTC in seconds
 * (Open-Meteo `timezone=auto`). Used to give a date box the device's local date
 * when no weather box is present to piggyback on (issue #166). Returns null if
 * the location can't be found or the request fails.
 */
export async function fetchUtcOffset(location: string): Promise<number | null> {
  const place = await geocode(location);
  if (!place) return null;

  try {
    const url =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${String(place.latitude)}` +
      `&longitude=${String(place.longitude)}` +
      `&current=temperature_2m&timezone=auto&forecast_days=1`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as { utc_offset_seconds?: number };
    return data.utc_offset_seconds ?? null;
  } catch {
    return null;
  }
}

interface OpenMeteoHourly {
  /** Location's offset from UTC, in seconds (present when timezone=auto). */
  utc_offset_seconds?: number;
  hourly: {
    time: string[];
    temperature_2m: number[];
    weather_code: number[];
  };
}

/**
 * Geocode a location and fetch the next `hours` hourly forecast entries
 * (default 3) from Open-Meteo. Returns null on failure.
 */
export async function fetchForecast(
  location: string,
  hours = 3,
  unit: 'F' | 'C' = 'F',
): Promise<ForecastEntry[] | null> {
  const place = await geocode(location);
  if (!place) return null;

  try {
    // Source enough days to cover the current hour offset + requested span,
    // capped at Open-Meteo's 16-day max (matches fetchForecast3D).
    const forecastDays = Math.min(16, Math.ceil((hours + 24) / 24));
    const url =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${String(place.latitude)}` +
      `&longitude=${String(place.longitude)}` +
      `&hourly=temperature_2m,weather_code` +
      `&timezone=auto&forecast_days=${String(forecastDays)}`;
    const res = await fetch(url);
    if (!res.ok) return null;

    const data = (await res.json()) as OpenMeteoHourly;
    const { time, temperature_2m, weather_code } = data.hourly;

    // Open-Meteo returns hourly timestamps in the *location's* timezone
    // (timezone=auto). Anchor "now" to that same timezone via the response's UTC
    // offset and read UTC fields off the shifted instant, so a server in any
    // timezone (e.g. a UTC host at pull-time hydration) still picks the correct
    // current hour rather than one offset by the server↔location difference.
    const offsetMs = (data.utc_offset_seconds ?? 0) * 1000;
    const nowAtLocation = new Date(Date.now() + offsetMs);
    const currentHourIso =
      `${String(nowAtLocation.getUTCFullYear())}-` +
      `${String(nowAtLocation.getUTCMonth() + 1).padStart(2, '0')}-` +
      `${String(nowAtLocation.getUTCDate()).padStart(2, '0')}T` +
      `${String(nowAtLocation.getUTCHours()).padStart(2, '0')}:00`;
    let startIdx = time.findIndex((t) => t >= currentHourIso);
    if (startIdx < 0) startIdx = 0;

    const entries: ForecastEntry[] = [];
    for (let offset = 1; offset <= hours; offset++) {
      const i = startIdx + offset;
      const t = time[i];
      const temp = temperature_2m[i];
      const code = weather_code[i];
      if (t === undefined || temp === undefined || code === undefined) break;
      // t is like '2026-04-22T15:00' — slice the HH:MM part
      const hhmm = t.length >= 16 ? t.slice(11, 16) : t;
      entries.push({
        time: hhmm,
        temperature: toTemp(temp, unit),
        condition: weatherCondition(code),
      });
    }

    return entries.length > 0 ? entries : null;
  } catch {
    return null;
  }
}

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
 * Geocode a location and fetch the next `days` of daily forecast data
 * (default 3) from Open-Meteo. Returns null on failure.
 */
export async function fetchForecast3D(
  location: string,
  days = 3,
  unit: 'F' | 'C' = 'F',
): Promise<Forecast3DEntry[] | null> {
  const place = await geocode(location);
  if (!place) return null;

  try {
    // Source one extra day because index 0 (today) is skipped below; Open-Meteo
    // caps daily forecasts at 16 days, so longer spans yield up to ~15 entries.
    const forecastDays = Math.min(16, days + 1);
    const url =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${String(place.latitude)}` +
      `&longitude=${String(place.longitude)}` +
      `&daily=temperature_2m_max,temperature_2m_min,weather_code` +
      `&timezone=auto&forecast_days=${String(forecastDays)}`;
    const res = await fetch(url);
    if (!res.ok) return null;

    const data = (await res.json()) as OpenMeteoDaily3D;
    const { time, temperature_2m_max, temperature_2m_min, weather_code } = data.daily;

    // Skip today (index 0), take next `days` days
    const entries: Forecast3DEntry[] = [];
    for (let i = 1; i <= days; i++) {
      const t = time[i];
      const high = temperature_2m_max[i];
      const low = temperature_2m_min[i];
      const code = weather_code[i];
      if (t === undefined || high === undefined || low === undefined || code === undefined) break;

      const dayOfWeek = DAY_NAMES[new Date(t + 'T00:00').getDay()];
      entries.push({
        day: dayOfWeek ?? t.slice(5, 10),
        high: toTemp(high, unit),
        low: toTemp(low, unit),
        condition: weatherCondition(code),
      });
    }

    return entries.length > 0 ? entries : null;
  } catch {
    return null;
  }
}

interface OpenMeteoDailySun {
  daily: {
    sunrise: string[];
    sunset: string[];
  };
}

/** Format the span between two ISO datetimes into an "Xh Ym" string. */
function formatDayLength(sunriseIso: string, sunsetIso: string): string {
  const rise = new Date(sunriseIso);
  const set = new Date(sunsetIso);
  const totalMinutes = Math.round((set.getTime() - rise.getTime()) / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours)}h ${String(minutes)}m`;
}

/**
 * Geocode a location and fetch today's sunrise/sunset from Open-Meteo daily
 * forecast. Returns null if the location cannot be found or the request fails.
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

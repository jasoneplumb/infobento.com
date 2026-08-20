/**
 * Intent: Current UV index from the Open-Meteo Air Quality API, geocoding the
 *         location first.
 * Context: Same upstream endpoint as air-quality.ts, but requests only
 *          `uv_index` — a UV box shouldn't pay for the pollutant fields it
 *          never renders.
 * Pattern: Pure `fetch`; returns null on any failure.
 */

import type { UVData } from '@infobento/core';
import { geocode } from './geocode.js';
import { readCurrent } from './open-meteo.js';

interface OpenMeteoUV {
  current: {
    uv_index?: number | null;
  };
}

/**
 * Map a UV index value to its WHO Global Solar UV Index band.
 * Bands are inclusive upper bounds: 0-2 Low, 3-5 Moderate, 6-7 High,
 * 8-10 Very High, 11+ Extreme.
 */
export function uvCategory(uvIndex: number): string {
  if (uvIndex < 3) return 'Low';
  if (uvIndex < 6) return 'Moderate';
  if (uvIndex < 8) return 'High';
  if (uvIndex < 11) return 'Very High';
  return 'Extreme';
}

/**
 * Geocode a location and fetch its current UV index. Returns null if the
 * location cannot be found, the request fails, or the upstream omits the
 * reading.
 */
export async function fetchUvIndex(location: string): Promise<UVData | null> {
  const place = await geocode(location);
  if (!place) return null;

  try {
    const url =
      `https://air-quality-api.open-meteo.com/v1/air-quality` +
      `?latitude=${String(place.latitude)}` +
      `&longitude=${String(place.longitude)}` +
      `&current=uv_index`;
    const res = await fetch(url);
    if (!res.ok) return null;

    const current = readCurrent<OpenMeteoUV['current']>(await res.json());
    if (!current) return null;

    const uv = current.uv_index;
    if (uv == null) return null;

    const rounded = Math.round(uv);
    return { uvIndex: rounded, category: uvCategory(rounded) };
  } catch {
    return null;
  }
}

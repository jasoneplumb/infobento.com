/**
 * Intent: Current air quality (European AQI + dominant pollutant + UV) from the
 *         Open-Meteo Air Quality API, geocoding the location first.
 * Context: Lifted verbatim from web/src/api.ts (RFC 0001 Phase 1).
 * Pattern: Pure `fetch`; returns null on any failure.
 */

import type { AQIData } from '@infobento/core';
import { geocode } from './geocode.js';

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

/** Map European AQI value to US EPA category string. */
function aqiCategory(aqi: number): string {
  if (aqi <= 50) return 'Good';
  if (aqi <= 100) return 'Moderate';
  if (aqi <= 150) return 'Unhealthy for Sensitive';
  if (aqi <= 200) return 'Unhealthy';
  if (aqi <= 300) return 'Very Unhealthy';
  return 'Hazardous';
}

/** Determine the dominant pollutant from Open-Meteo current data. */
function dominantPollutant(current: OpenMeteoAirQuality['current']): string {
  const candidates: Array<[string, number | undefined]> = [
    ['PM2.5', current.pm2_5],
    ['PM10', current.pm10],
    ['NO2', current.nitrogen_dioxide],
    ['O3', current.ozone],
    ['SO2', current.sulphur_dioxide],
  ];

  let maxName: string | undefined;
  let maxValue = -1;
  for (const [name, value] of candidates) {
    if (value != null && value > maxValue) {
      maxValue = value;
      maxName = name;
    }
  }
  // Genuine default only when no pollutant data is present at all.
  return maxName ?? 'PM2.5';
}

/**
 * Geocode a location and fetch current air quality from the Open-Meteo Air
 * Quality API. Returns null if the location cannot be found or the request
 * fails.
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

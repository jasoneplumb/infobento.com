/**
 * Location detection for InfoBento.
 *
 * Uses IP-based geolocation (ipapi.co) — no browser permission prompt — to
 * default location-dependent rows to the user's city. This is the same source
 * as the manual "Use my location" button, so rows work out of the box without
 * the user knowing to press anything.
 */

import { setState, getKnownLocation, noteLocation } from './state';

/** Fill any location-dependent row that still has an empty city. */
export function propagateLocationToEmptyBoxes(city: string): void {
  setState((s) => {
    for (const box of s.boxes) {
      if (
        box.type === 'weather' ||
        box.type === 'forecast' ||
        box.type === 'forecast3d' ||
        box.type === 'sun' ||
        box.type === 'aqi'
      ) {
        const cfg = box.config as { city: string };
        if (cfg.city.trim() === '') {
          cfg.city = city;
        }
      }
    }
  });
}

/**
 * IP-based city lookup via ipapi.co — no browser permission prompt.
 * Returns "City, Region" (or "City"), or null on failure.
 */
export async function detectLocationByIP(): Promise<string | null> {
  try {
    const res = await fetch('https://ipapi.co/json/');
    if (!res.ok) return null;
    const data = (await res.json()) as { city?: string; region?: string; error?: boolean };
    if (data.error || !data.city) return null;
    return data.region ? `${data.city}, ${data.region}` : data.city;
  } catch {
    return null;
  }
}

/**
 * If no location is known yet, detect one (IP-based) and fill every empty
 * location row — as if the user had pressed "Use my location". No-op when a
 * location is already set. The config forms auto-fetch data on render.
 */
export async function ensureLocationDefault(): Promise<void> {
  if (getKnownLocation().trim() !== '') return;
  const city = await detectLocationByIP();
  if (!city) return;
  noteLocation(city);
  propagateLocationToEmptyBoxes(city);
}

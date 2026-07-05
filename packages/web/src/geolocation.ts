/**
 * Location detection for InfoBento.
 *
 * Detection order (issue #183):
 *   1. GET /api/geolocate — server-side ipapi.co lookup. Same-origin, so
 *      tracker blocklists (Firefox ETP, adblockers) that block ipapi.co in
 *      the browser cannot block it.
 *   2. Direct ipapi.co from the browser — keeps detection working when the
 *      editor runs without the api server (Vite dev without the proxy target).
 *   3. FALLBACK_LOCATION (London, UK — UTC+0) fills empty location rows so
 *      every location-parameterized box renders data. Marked as a guess via
 *      the persisted fallback flag: never recorded with noteLocation, retried
 *      on the next visit, and replaced by any later successful detection.
 */

import { fetchIpLocation } from '@infobento/data';
import {
  setState,
  getKnownLocation,
  noteLocation,
  setTempUnit,
  isLocationFallback,
  setLocationFallback,
  LOCATION_PARAM_TYPES,
  FALLBACK_LOCATION,
} from './state';

/**
 * Countries that use Fahrenheit (US + a handful of territories); everyone else
 * defaults to Celsius. Used to pick the temperature unit from the IP locale.
 */
const FAHRENHEIT_COUNTRIES = new Set(['US', 'BS', 'BZ', 'KY', 'PW', 'FM', 'MH', 'LR']);

function unitForCountry(code: string | null): 'F' | 'C' {
  return code && FAHRENHEIT_COUNTRIES.has(code.toUpperCase()) ? 'F' : 'C';
}

/** Fill any location-parameterized row that still has an empty city. */
export function propagateLocationToEmptyBoxes(city: string): void {
  setState((s) => {
    for (const box of s.boxes) {
      if (LOCATION_PARAM_TYPES.has(box.type)) {
        // The date box's city is optional (may be undefined); the rest require it.
        const cfg = box.config as { city?: string };
        if ((cfg.city ?? '').trim() === '') {
          cfg.city = city;
        }
      }
    }
  });
}

/** Replace rows still holding the fallback guess with the detected city. */
function replaceFallbackRows(city: string): void {
  setState((s) => {
    for (const box of s.boxes) {
      if (LOCATION_PARAM_TYPES.has(box.type)) {
        const cfg = box.config as { city?: string };
        if (cfg.city === FALLBACK_LOCATION) {
          cfg.city = city;
        }
      }
    }
  });
}

/** Same-origin server-side lookup — the path tracker blocklists can't block. */
async function fetchServerGeolocation(): Promise<{
  city: string;
  countryCode: string | null;
} | null> {
  try {
    const res = await fetch('/api/geolocate');
    if (!res.ok) return null;
    const data = (await res.json()) as { city?: string | null; countryCode?: string | null };
    if (!data.city) return null;
    return { city: data.city, countryCode: data.countryCode ?? null };
  } catch {
    return null;
  }
}

/**
 * IP-based city lookup: server route first, then direct ipapi.co.
 * Returns "City, Region" (or "City"), or null when neither path works.
 * On success, also picks the temperature unit from the detected locale.
 */
export async function detectLocationByIP(): Promise<string | null> {
  const loc = (await fetchServerGeolocation()) ?? (await fetchIpLocation());
  if (!loc) return null;
  setTempUnit(unitForCountry(loc.countryCode));
  return loc.city;
}

/**
 * If no confirmed location is known yet, detect one and fill every empty
 * location row — as if the user had pressed "Use my location". When detection
 * fails entirely, default the rows to FALLBACK_LOCATION (UTC+0) instead of
 * leaving them empty (#183); the flag makes the next visit retry for real.
 */
export async function ensureLocationDefault(): Promise<void> {
  const known = getKnownLocation().trim();
  if (known !== '' && !isLocationFallback()) return;

  const city = await detectLocationByIP();
  if (city) {
    noteLocation(city); // also clears the fallback flag
    replaceFallbackRows(city);
    propagateLocationToEmptyBoxes(city);
  } else if (known === '') {
    // Not noteLocation'd: the guess must never become the "known" location.
    setLocationFallback(true);
    setTempUnit('C');
    propagateLocationToEmptyBoxes(FALLBACK_LOCATION);
  }
}

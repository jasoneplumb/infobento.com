/**
 * Intent: Resolve a free-form location string to coordinates via Nominatim.
 * Context: Five box fetchers (weather, forecast, forecast3d, sun, aqi) geocode
 *          first. All share one process-global rate-limit queue so the union of
 *          callers stays within Nominatim's 1 req/sec policy (RFC 0001 §3).
 * Pattern: Pure `fetch`; returns null on any failure (the resilience primitive).
 */

import { RateLimitedQueue } from './nominatim-queue.js';

export interface GeocodeResult {
  readonly latitude: number;
  readonly longitude: number;
  readonly displayName: string;
}

interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
}

/** Nominatim's usage policy caps callers at 1 request per second. */
export const NOMINATIM_MIN_INTERVAL_MS = 1000;

let queue = new RateLimitedQueue(NOMINATIM_MIN_INTERVAL_MS);

/**
 * Test seam: replace the shared Nominatim queue (e.g. with a zero-interval one
 * so unit tests don't wait a real second between geocodes). Not part of the
 * public package surface — import from this module directly in tests.
 */
export function __setNominatimQueue(replacement: RateLimitedQueue): void {
  queue = replacement;
}

/**
 * Resolve a location ("Portland", "Portland, OR", "Mt. St. Helens", an address)
 * to lat/lon. Returns null if empty, not found, or the request fails. Every
 * call is paced through the shared 1 req/sec Nominatim queue.
 */
export async function geocode(query: string): Promise<GeocodeResult | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;
  return queue.run(() => requestGeocode(trimmed));
}

async function requestGeocode(query: string): Promise<GeocodeResult | null> {
  try {
    const url =
      `https://nominatim.openstreetmap.org/search` +
      `?q=${encodeURIComponent(query)}` +
      `&format=json&limit=1`;
    // Nominatim's usage policy requires an identifying User-Agent. It's a
    // forbidden request header in browser `fetch` (silently dropped there), but
    // it's sent server-side, where geocode runs at pull-time hydration.
    const res = await fetch(url, {
      headers: {
        'Accept-Language': 'en',
        'User-Agent': 'InfoBento/1.0 (https://github.com/jasoneplumb/infobento.com)',
      },
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

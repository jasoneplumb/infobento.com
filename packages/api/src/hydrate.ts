/**
 * Intent: Resolve live box data at device-pull time so a scheduled refresh shows
 *   current values without anyone re-opening the editor (RFC 0001 §2).
 * Context: Called from getDeviceFrameForPull before renderBoth. Box configs are
 *   readonly, so this is an immutable transform — it returns a NEW config with
 *   reconstructed boxes, never mutating in place.
 * Pattern: Injected resolver (cache + fetchers) keeps it unit-testable. A failed
 *   fetch leaves data undefined so the renderer's placeholder path draws
 *   gracefully (no synthetic data needed — Phase 2 already covers weather).
 */

import type { BentoConfig, BentoBox, WeatherData } from '@infobento/core';
import { InMemoryCache, fetchWeather as dataFetchWeather, type Cache } from '@infobento/data';

export interface HydrateDeps {
  readonly cache: Cache;
  readonly fetchWeather: (location: string, unit: 'F' | 'C') => Promise<WeatherData | null>;
}

// Per-provider freshness — weather changes slowly, so one upstream call per city
// per window is plenty (RFC 0001 §3). Independent of the device's 304 cadence.
const WEATHER_TTL_MS = 30 * 60 * 1000;

// Bound the upstream call well under the firmware's HTTP timeout, so a hung
// provider yields a placeholder frame instead of hanging the pull (RFC §6).
const WEATHER_TIMEOUT_MS = 8000;

/** Reject `work` if it doesn't settle within `ms`. Clears the timer either way. */
function withTimeout<T>(work: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${String(ms)}ms`)), ms);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Walk the config's boxes and replace each live box's data with a freshly
 * resolved value. **Always replace, never fill-absent** — persisted config_json
 * holds params only; any baked data is a discardable seed (RFC 0001 §2).
 */
export async function hydrateConfig(config: BentoConfig, deps: HydrateDeps): Promise<BentoConfig> {
  const boxes = await Promise.all(config.boxes.map((box) => hydrateBox(box, deps)));
  return { ...config, boxes };
}

async function hydrateBox(box: BentoBox, deps: HydrateDeps): Promise<BentoBox> {
  switch (box.type) {
    case 'weather': {
      if (!box.config) return box; // unconfigured → renderer placeholder
      const city = box.config.city.trim();
      // Config carries no per-box unit (the editor uses a global setting); 'F'
      // matches fetchWeather's default. Per-box unit is an RFC open question.
      const data = city ? await resolveWeather(city, deps) : undefined;
      return { ...box, config: { ...box.config, data } };
    }
    default:
      // Non-live boxes (and live types not yet hydrated) pass through unchanged.
      return box;
  }
}

async function resolveWeather(city: string, deps: HydrateDeps): Promise<WeatherData | undefined> {
  const key = `weather:${city.toLowerCase()}:F`;
  return deps.cache
    .get(
      key,
      async () => {
        try {
          const data = await withTimeout(
            deps.fetchWeather(city, 'F'),
            WEATHER_TIMEOUT_MS,
            `weather "${city}"`,
          );
          // Throw so a failed fetch isn't stored as a value — the next pull
          // retries rather than serving null for the whole TTL window.
          if (data === null) throw new Error(`weather fetch returned no data for "${city}"`);
          return data;
        } catch (err) {
          // Logged here (the single-flight fetcher runs once per key), so a
          // provider outage vs. a fetcher bug stays distinguishable without one
          // line per concurrent waiter. Waiters degrade via the catch below.
          console.warn(`hydrate: weather fetch failed for "${city}":`, err);
          throw err;
        }
      },
      { ttlMs: WEATHER_TTL_MS },
    )
    .catch(() => undefined);
}

let sharedCache: Cache | undefined;

/**
 * Production hydration deps: a process-shared in-memory cache (so 1,000 devices
 * in one city make one upstream call per window) + the real @infobento/data
 * fetchers.
 */
export function defaultHydrateDeps(): HydrateDeps {
  sharedCache ??= new InMemoryCache();
  return { cache: sharedCache, fetchWeather: dataFetchWeather };
}

/**
 * Intent: cover the #183 detection-order and UTC+0-fallback invariants:
 *   the fallback fills every location-parameterized row, is flagged as a
 *   guess (not a known location), and a later successful detection wins.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ensureLocationDefault, detectLocationByIP } from './geolocation.js';
import {
  addBox,
  getBoxes,
  getTempUnit,
  setTempUnit,
  isLocationFallback,
  setLocationFallback,
  noteLocation,
  setState,
  FALLBACK_LOCATION,
  LOCATION_PARAM_TYPES,
  _resetPersistenceForTesting,
  type EditorBoxType,
} from './state.js';

// The web tests run in a bare Node environment (no DOM). Provide a minimal
// in-memory localStorage so the persistence paths are exercised for real.
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (k: string) => (store.has(k) ? (store.get(k) as string) : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size;
    },
  } as Storage;
}

function cityOf(type: EditorBoxType): string | undefined {
  const box = getBoxes().find((b) => b.type === type);
  return (box?.config as { city?: string } | undefined)?.city;
}

/** Stub fetch so both the /api/geolocate and direct ipapi.co paths fail. */
function stubAllDetectionFailing(): void {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network blocked')));
}

/** Stub fetch so /api/geolocate succeeds with the given payload. */
function stubServerDetection(city: string, countryCode: string | null): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn().mockImplementation((input: unknown) => {
    if (String(input) === '/api/geolocate') {
      return Promise.resolve(new Response(JSON.stringify({ city, countryCode })));
    }
    return Promise.reject(new Error(`unexpected fetch: ${String(input)}`));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  _resetPersistenceForTesting();
  localStorage.clear();
  setLocationFallback(false);
  setTempUnit('F');
  setState((s) => {
    s.boxes = [];
  });
  // One row of every location-parameterized type, all cities empty.
  for (const type of LOCATION_PARAM_TYPES) addBox(type);
  setState((s) => {
    for (const box of s.boxes) (box.config as { city?: string }).city = '';
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ensureLocationDefault — UTC+0 fallback (#183)', () => {
  it('fills every location-parameterized row with London, UK when detection fails', async () => {
    stubAllDetectionFailing();
    await ensureLocationDefault();

    for (const type of LOCATION_PARAM_TYPES) {
      expect(cityOf(type), type).toBe(FALLBACK_LOCATION);
    }
    expect(isLocationFallback()).toBe(true);
    expect(getTempUnit()).toBe('C');
  });

  it('never applies the fallback when any row already has a user-entered city', async () => {
    setState((s) => {
      const weather = s.boxes.find((b) => b.type === 'weather');
      if (weather) (weather.config as { city?: string }).city = 'Osaka, Japan';
    });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await ensureLocationDefault();

    // A populated row means a location IS known — no detection, no fallback.
    expect(fetchMock).not.toHaveBeenCalled();
    expect(cityOf('weather')).toBe('Osaka, Japan');
    expect(cityOf('sun')).toBe('');
    expect(isLocationFallback()).toBe(false);
  });

  it('retries detection on the next visit and replaces the fallback in untouched rows', async () => {
    stubAllDetectionFailing();
    await ensureLocationDefault();
    expect(cityOf('weather')).toBe(FALLBACK_LOCATION);

    // The user manually corrected one row; it must survive the replacement.
    setState((s) => {
      const sun = s.boxes.find((b) => b.type === 'sun');
      if (sun) (sun.config as { city?: string }).city = 'Osaka, Japan';
    });

    stubServerDetection('Detroit, Michigan', 'US');
    await ensureLocationDefault();

    expect(cityOf('weather')).toBe('Detroit, Michigan');
    expect(cityOf('date')).toBe('Detroit, Michigan');
    expect(cityOf('sun')).toBe('Osaka, Japan');
    expect(isLocationFallback()).toBe(false);
    expect(getTempUnit()).toBe('F');
  });

  it('does nothing when a confirmed (non-fallback) location is already known', async () => {
    noteLocation('Osaka, Japan');
    setState((s) => {
      const weather = s.boxes.find((b) => b.type === 'weather');
      if (weather) (weather.config as { city?: string }).city = 'Osaka, Japan';
    });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await ensureLocationDefault();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('detectLocationByIP — server route first (#183)', () => {
  it('uses /api/geolocate and sets the temperature unit from the locale', async () => {
    const fetchMock = stubServerDetection('London', 'GB');
    setTempUnit('F');

    expect(await detectLocationByIP()).toBe('London');
    expect(getTempUnit()).toBe('C');
    expect(fetchMock).toHaveBeenCalledWith('/api/geolocate');
  });

  it('falls back to direct ipapi.co when the server route is unavailable', async () => {
    const fetchMock = vi.fn().mockImplementation((input: unknown) => {
      if (String(input) === '/api/geolocate') {
        return Promise.resolve(new Response('proxy error', { status: 500 }));
      }
      return Promise.resolve(
        new Response(JSON.stringify({ city: 'Detroit', region: 'Michigan', country_code: 'us' })),
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    expect(await detectLocationByIP()).toBe('Detroit, Michigan');
    expect(getTempUnit()).toBe('F');
    expect(fetchMock).toHaveBeenCalledWith('https://ipapi.co/json/');
  });

  it('returns null when both paths fail', async () => {
    stubAllDetectionFailing();
    expect(await detectLocationByIP()).toBeNull();
  });
});

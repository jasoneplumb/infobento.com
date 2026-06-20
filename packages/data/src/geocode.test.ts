import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { geocode, __setNominatimQueue } from './geocode.js';
import { RateLimitedQueue } from './nominatim-queue.js';

function mockFetchOnce(ok: boolean, body: unknown): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok, json: async () => body }) as unknown as Response),
  );
}

beforeEach(() => {
  // Zero-interval queue so tests don't wait a real second between calls.
  __setNominatimQueue(new RateLimitedQueue(0));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('geocode', () => {
  it('resolves a location to coordinates', async () => {
    mockFetchOnce(true, [{ lat: '45.52', lon: '-122.68', display_name: 'Portland, OR' }]);
    const result = await geocode('Portland');
    expect(result).toEqual({
      latitude: 45.52,
      longitude: -122.68,
      displayName: 'Portland, OR',
    });
  });

  it('returns null for an empty query without fetching', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    expect(await geocode('   ')).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns null on a non-ok response', async () => {
    mockFetchOnce(false, null);
    expect(await geocode('Portland')).toBeNull();
  });

  it('returns null when no result is found', async () => {
    mockFetchOnce(true, []);
    expect(await geocode('Nowheresville')).toBeNull();
  });

  it('returns null when coordinates are not finite', async () => {
    mockFetchOnce(true, [{ lat: 'abc', lon: 'def', display_name: 'x' }]);
    expect(await geocode('x')).toBeNull();
  });
});

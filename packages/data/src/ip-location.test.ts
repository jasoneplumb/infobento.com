import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchIpLocation } from './ip-location.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchIpLocation', () => {
  it('resolves "City, Region" and uppercased country code', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ city: 'Detroit', region: 'Michigan', country_code: 'us' }));
    vi.stubGlobal('fetch', fetchMock);

    expect(await fetchIpLocation()).toEqual({ city: 'Detroit, Michigan', countryCode: 'US' });
    expect(fetchMock).toHaveBeenCalledWith('https://ipapi.co/json/');
  });

  it('targets the given IP and falls back to city-only when region is absent', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ city: 'London' }));
    vi.stubGlobal('fetch', fetchMock);

    expect(await fetchIpLocation('8.8.8.8')).toEqual({ city: 'London', countryCode: null });
    expect(fetchMock).toHaveBeenCalledWith('https://ipapi.co/8.8.8.8/json/');
  });

  it('returns null on API error flag, missing city, non-OK status, and network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: true })));
    expect(await fetchIpLocation()).toBeNull();

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ region: 'Nowhere' })));
    expect(await fetchIpLocation()).toBeNull();

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, 429)));
    expect(await fetchIpLocation()).toBeNull();

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('blocked')));
    expect(await fetchIpLocation()).toBeNull();
  });
});

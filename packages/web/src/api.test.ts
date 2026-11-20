import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchAirQuality,
  fetchForecast,
  fetchForecast3D,
  fetchNextPublicHoliday,
  fetchPollen,
  fetchSunTimes,
  fetchUvIndex,
  fetchWeather,
} from './api';

function stubFetch(body: unknown, init: ResponseInit = {}): ReturnType<typeof vi.fn> {
  const mock = vi.fn(async () => new Response(JSON.stringify(body), init));
  vi.stubGlobal('fetch', mock);
  return mock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('editor box-data helpers (#287)', () => {
  it('request only the same-origin /api/box-data route, never a third-party host', async () => {
    const mock = stubFetch({ data: null });
    await fetchWeather('Portland, OR', 'C');
    await fetchForecast('Portland', 6, 'F');
    await fetchForecast3D('Portland', 5, 'C');
    await fetchSunTimes('Portland');
    await fetchAirQuality('Portland');
    await fetchUvIndex('Portland');
    await fetchPollen('Berlin');
    await fetchNextPublicHoliday(' gb ');

    const urls = mock.mock.calls.map((call: unknown[]) => String(call[0]));
    expect(urls).toEqual([
      '/api/box-data/weather?location=Portland%2C+OR&unit=C',
      '/api/box-data/forecast?location=Portland&hours=6&unit=F',
      '/api/box-data/forecast3d?location=Portland&days=5&unit=C',
      '/api/box-data/sun?location=Portland',
      '/api/box-data/aqi?location=Portland',
      '/api/box-data/uv?location=Portland',
      '/api/box-data/pollen?location=Berlin',
      '/api/box-data/holidays?country=GB',
    ]);
  });

  it('unwraps the { data } envelope', async () => {
    const sun = { sunrise: '06:12', sunset: '20:01', dayLength: '13h 49m' };
    stubFetch({ data: sun });
    expect(await fetchSunTimes('Portland')).toEqual(sun);
  });

  it('returns null on a non-2xx response or a network error', async () => {
    stubFetch({ data: null, error: 'rate_limited' }, { status: 429 });
    expect(await fetchUvIndex('Portland')).toBeNull();

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('NetworkError')));
    expect(await fetchUvIndex('Portland')).toBeNull();
  });

  it('skips the request entirely for an empty location or a malformed country', async () => {
    const mock = stubFetch({ data: null });
    expect(await fetchWeather('   ')).toBeNull();
    expect(await fetchNextPublicHoliday('')).toBeNull();
    expect(await fetchNextPublicHoliday('GBR')).toBeNull();
    expect(mock).not.toHaveBeenCalled();
  });
});

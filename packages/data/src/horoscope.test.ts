import { describe, it, expect, afterEach, vi } from 'vitest';
import { fetchHoroscope } from './horoscope.js';

function mockFetch(ok: boolean, body: unknown): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok, json: async () => body }) as unknown as Response),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchHoroscope', () => {
  it('returns the reading stamped with the normalized sign', async () => {
    mockFetch(true, { horoscope: 'Today is yours.', date: '2026-06-19' });
    expect(await fetchHoroscope(' Leo ')).toEqual({
      sign: 'leo',
      text: 'Today is yours.',
      date: '2026-06-19',
    });
  });

  it('returns null for an invalid sign without fetching', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    expect(await fetchHoroscope('ophiuchus')).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns null on a non-ok response', async () => {
    mockFetch(false, null);
    expect(await fetchHoroscope('aries')).toBeNull();
  });
});

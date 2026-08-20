import { describe, it, expect, afterEach, vi } from 'vitest';
import { fetchNextPublicHoliday } from './holidays.js';

function mockFetch(body: unknown, ok = true): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok, json: async () => body }) as unknown as Response),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchNextPublicHoliday', () => {
  it('returns the name and date of the first upcoming holiday', async () => {
    mockFetch([
      {
        date: '2026-08-31',
        localName: 'Summer Bank Holiday',
        name: 'Summer Bank Holiday',
        countryCode: 'GB',
      },
    ]);
    expect(await fetchNextPublicHoliday('GB')).toEqual({
      name: 'Summer Bank Holiday',
      date: '2026-08-31',
    });
  });

  it('uses localName, not name, so country-specific labels are preserved', async () => {
    mockFetch([
      { date: '2026-12-25', localName: 'Weihnachtstag', name: 'Christmas Day', countryCode: 'DE' },
    ]);
    expect(await fetchNextPublicHoliday('DE')).toMatchObject({ name: 'Weihnachtstag' });
  });

  it('uppercases the country code before fetching', async () => {
    const spy = vi.fn(
      async () =>
        ({
          ok: true,
          json: async () => [
            { date: '2026-12-25', localName: 'Christmas Day', name: 'Christmas Day' },
          ],
        }) as unknown as Response,
    );
    vi.stubGlobal('fetch', spy);
    await fetchNextPublicHoliday('gb');
    expect((spy.mock.calls[0] as string[])[0]).toContain('/GB');
  });

  // The provider responds with a 200 and an empty array when the country code is
  // valid but has no upcoming holidays in the window (rare but possible). The box
  // should degrade to null, not throw.
  it('returns null for a 200-with-empty-array payload', async () => {
    mockFetch([]);
    expect(await fetchNextPublicHoliday('GB')).toBeNull();
  });

  it('returns null on an HTTP error response', async () => {
    mockFetch(null, false);
    expect(await fetchNextPublicHoliday('XX')).toBeNull();
  });

  it('returns null when the payload is not an array', async () => {
    mockFetch({ error: 'Country not found' });
    expect(await fetchNextPublicHoliday('ZZ')).toBeNull();
  });

  it('returns null when the first entry lacks a date', async () => {
    mockFetch([{ localName: 'Mystery Holiday', name: 'Mystery Holiday' }]);
    expect(await fetchNextPublicHoliday('GB')).toBeNull();
  });

  it('returns null for an empty country code', async () => {
    expect(await fetchNextPublicHoliday('')).toBeNull();
    expect(await fetchNextPublicHoliday('  ')).toBeNull();
  });
});

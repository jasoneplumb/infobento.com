import { describe, it, expect, afterEach, vi } from 'vitest';
import { fetchOnThisDay } from './onthisday.js';

function mockFetch(ok: boolean, body: unknown): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok, json: async () => body }) as unknown as Response),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchOnThisDay', () => {
  it('samples from the requested category', async () => {
    mockFetch(true, {
      events: [{ text: 'Something happened', year: 1969 }],
      births: [{ text: 'Someone born', year: 1900 }],
    });
    expect(await fetchOnThisDay('events')).toEqual({
      text: 'Something happened',
      year: '1969',
      category: 'events',
    });
  });

  it('defaults an unknown category to events', async () => {
    mockFetch(true, { events: [{ text: 'E', year: 2000 }] });
    const result = await fetchOnThisDay('bogus');
    expect(result?.category).toBe('events');
  });

  it('returns null when the pool is empty', async () => {
    mockFetch(true, { events: [] });
    expect(await fetchOnThisDay('events')).toBeNull();
  });

  it('returns null on a non-ok response', async () => {
    mockFetch(false, null);
    expect(await fetchOnThisDay()).toBeNull();
  });
});

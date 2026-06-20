import { describe, it, expect, afterEach, vi } from 'vitest';
import { fetchJoke, resolveJokeCategories } from './joke.js';

function mockFetch(ok: boolean, body: unknown): ReturnType<typeof vi.fn> {
  const fn = vi.fn(async () => ({ ok, json: async () => body }) as unknown as Response);
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('resolveJokeCategories', () => {
  it('defaults to "Any" when empty', () => {
    expect(resolveJokeCategories('')).toBe('Any');
  });
  it('title-cases and keeps only valid categories', () => {
    expect(resolveJokeCategories('programming, pun, bogus')).toBe('Programming,Pun');
  });
  it('falls back to "Any" when nothing is valid', () => {
    expect(resolveJokeCategories('bogus')).toBe('Any');
  });
});

describe('fetchJoke', () => {
  it('returns a normalized single joke', async () => {
    mockFetch(true, { error: false, joke: 'Why   did\nthe   dev cross?', category: 'Programming' });
    expect(await fetchJoke('Programming')).toEqual({
      text: 'Why did the dev cross?',
      category: 'Programming',
    });
  });

  it('requests the resolved category path', async () => {
    const fn = mockFetch(true, { error: false, joke: 'ha', category: 'Pun' });
    await fetchJoke('pun');
    expect(String(fn.mock.calls[0]?.[0])).toContain('/joke/Pun?');
  });

  it('returns null when the API flags an error', async () => {
    mockFetch(true, { error: true });
    expect(await fetchJoke()).toBeNull();
  });

  it('returns null on a non-ok response', async () => {
    mockFetch(false, null);
    expect(await fetchJoke()).toBeNull();
  });
});

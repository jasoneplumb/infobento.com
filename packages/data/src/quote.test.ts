import { describe, it, expect, afterEach, vi } from 'vitest';
import { fetchQuote, normalizeQuoteTags } from './quote.js';

function mockFetch(ok: boolean, body: unknown): ReturnType<typeof vi.fn> {
  const fn = vi.fn(async () => ({ ok, json: async () => body }) as unknown as Response);
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('normalizeQuoteTags', () => {
  it('title-cases each comma-separated tag', () => {
    expect(normalizeQuoteTags('wisdom, famous quotes')).toBe('Wisdom,Famous Quotes');
  });
  it('drops empty tags', () => {
    expect(normalizeQuoteTags(' , wisdom , ')).toBe('Wisdom');
  });
});

describe('fetchQuote', () => {
  it('returns the quote content and author', async () => {
    mockFetch(true, { quote: { content: 'Be water.', author: { name: 'Bruce Lee' } } });
    expect(await fetchQuote()).toEqual({ text: 'Be water.', author: 'Bruce Lee' });
  });

  it('passes tags and maxLength as query params', async () => {
    const fn = mockFetch(true, { quote: { content: 'x', author: { name: 'y' } } });
    await fetchQuote({ tags: 'wisdom', maxLength: 120 });
    const url = String(fn.mock.calls[0]?.[0]);
    expect(url).toContain('tags=Wisdom');
    expect(url).toContain('maxLength=120');
  });

  it('returns null on a non-ok response', async () => {
    mockFetch(false, null);
    expect(await fetchQuote()).toBeNull();
  });

  it('returns null when the payload has no content', async () => {
    mockFetch(true, { quote: { author: { name: 'y' } } });
    expect(await fetchQuote()).toBeNull();
  });
});

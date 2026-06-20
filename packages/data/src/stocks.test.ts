import { describe, it, expect, afterEach, vi } from 'vitest';
import { fetchStocks, isValidStockSymbol } from './stocks.js';

function mockFetch(ok: boolean, body: unknown): ReturnType<typeof vi.fn> {
  const fn = vi.fn(async () => ({ ok, json: async () => body }) as unknown as Response);
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('isValidStockSymbol', () => {
  it('accepts common ticker shapes', () => {
    expect(isValidStockSymbol('AAPL')).toBe(true);
    expect(isValidStockSymbol('BRK.A')).toBe(true);
    expect(isValidStockSymbol('BTC-USD')).toBe(true);
  });
  it('rejects malformed symbols', () => {
    expect(isValidStockSymbol('')).toBe(false);
    expect(isValidStockSymbol('1ABC')).toBe(false);
    expect(isValidStockSymbol('toolongticker')).toBe(false);
  });
});

describe('fetchStocks', () => {
  it('computes change vs. previous close for a 1d duration', async () => {
    mockFetch(true, {
      chart: { result: [{ meta: { regularMarketPrice: 110, chartPreviousClose: 100 } }] },
    });
    expect(await fetchStocks('AAPL', '1d')).toEqual({
      price: 110,
      change: 10,
      changePercent: 10,
    });
  });

  it('uses the first non-null close as baseline for longer durations', async () => {
    mockFetch(true, {
      chart: {
        result: [
          {
            meta: { regularMarketPrice: 120 },
            indicators: { quote: [{ close: [null, 100, 110] }] },
          },
        ],
      },
    });
    expect(await fetchStocks('AAPL', '1mo')).toEqual({
      price: 120,
      change: 20,
      changePercent: 20,
    });
  });

  it('returns null for an invalid symbol without fetching', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    expect(await fetchStocks('', '1d')).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns null for an unrecognized duration without fetching', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    expect(await fetchStocks('AAPL', 'bogus')).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns null when no price is available', async () => {
    mockFetch(true, { chart: { result: [{ meta: {} }] } });
    expect(await fetchStocks('AAPL', '1d')).toBeNull();
  });

  it('returns null on a non-ok response', async () => {
    mockFetch(false, null);
    expect(await fetchStocks('AAPL', '1d')).toBeNull();
  });
});

/**
 * Integration coverage for the box-data proxy routes after they became thin
 * wrappers over @infobento/data (RFC 0001 Phase 1). Drives the live route table
 * with app.request() and a mocked global fetch, exercising route → data layer →
 * upstream and the fallback / validation behavior the routes own.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { app } from './server.js';

function mockFetch(handler: (url: string) => { ok: boolean; body: unknown }): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      const { ok, body } = handler(url);
      return { ok, json: async () => body } as unknown as Response;
    }),
  );
}

/** A fetch that always fails — forces the data layer to return null. */
function mockFetchDown(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: false, json: async () => null }) as unknown as Response),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('GET /api/quote', () => {
  it('maps the upstream quote into the q/a shape', async () => {
    mockFetch(() => ({
      ok: true,
      body: { quote: { content: 'Be water.', author: { name: 'Bruce Lee' } } },
    }));
    const res = await app.request('/api/quote?maxLength=120');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ q: 'Be water.', a: 'Bruce Lee' });
  });

  it('falls back when upstream is down', async () => {
    mockFetchDown();
    const res = await app.request('/api/quote');
    const body = (await res.json()) as { q: string; fallback?: boolean };
    expect(body.fallback).toBe(true);
    expect(body.q.length).toBeGreaterThan(0);
  });
});

describe('GET /api/horoscope', () => {
  it('rejects an invalid sign with 400 before any fetch', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const res = await app.request('/api/horoscope?sign=ophiuchus');
    expect(res.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('falls back to a bundled reading when upstream is down', async () => {
    mockFetchDown();
    const res = await app.request('/api/horoscope?sign=leo');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { sign: string; fallback?: boolean };
    expect(body.sign).toBe('leo');
    expect(body.fallback).toBe(true);
  });
});

describe('GET /api/stocks', () => {
  it('rejects an invalid symbol with 400 before any fetch', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const res = await app.request('/api/stocks?symbol=1bad');
    expect(res.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects an unrecognized duration with 400, not 502', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const res = await app.request('/api/stocks?symbol=AAPL&duration=bogus');
    expect(res.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns a quote on success', async () => {
    mockFetch(() => ({
      ok: true,
      body: { chart: { result: [{ meta: { regularMarketPrice: 110, chartPreviousClose: 100 } }] } },
    }));
    const res = await app.request('/api/stocks?symbol=AAPL&duration=1d');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ price: 110, change: 10, changePercent: 10 });
  });

  it('returns 502 (no fallback bundle) when upstream is down', async () => {
    mockFetchDown();
    const res = await app.request('/api/stocks?symbol=AAPL');
    expect(res.status).toBe(502);
  });
});

describe('GET /api/onthisday', () => {
  it('returns an entry on success', async () => {
    mockFetch(() => ({ ok: true, body: { events: [{ text: 'A thing', year: 1969 }] } }));
    const res = await app.request('/api/onthisday?category=events');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ text: 'A thing', year: '1969', category: 'events' });
  });

  it('returns 502 (no fallback bundle) when upstream is down', async () => {
    mockFetchDown();
    const res = await app.request('/api/onthisday');
    expect(res.status).toBe(502);
  });
});

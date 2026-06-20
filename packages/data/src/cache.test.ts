import { describe, it, expect, vi } from 'vitest';
import { InMemoryCache } from './cache.js';

/** Resolve pending microtasks so a background SWR refresh can settle. */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('InMemoryCache', () => {
  it('serves a fresh entry without refetching', async () => {
    let now = 0;
    const cache = new InMemoryCache(() => now);
    const fetcher = vi.fn(async () => 'v');

    expect(await cache.get('k', fetcher, { ttlMs: 100 })).toBe('v');
    now = 50; // still within TTL
    expect(await cache.get('k', fetcher, { ttlMs: 100 })).toBe('v');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('refetches once the entry expires', async () => {
    let now = 0;
    const cache = new InMemoryCache(() => now);
    let n = 0;
    const fetcher = vi.fn(async () => `v${String(++n)}`);

    expect(await cache.get('k', fetcher, { ttlMs: 100 })).toBe('v1');
    now = 150; // past TTL, no stale window
    expect(await cache.get('k', fetcher, { ttlMs: 100 })).toBe('v2');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('deduplicates concurrent fetches for the same key (single-flight)', async () => {
    const cache = new InMemoryCache(() => 0);
    let calls = 0;
    let release!: (v: string) => void;
    const fetcher = () => {
      calls++;
      return new Promise<string>((resolve) => {
        release = resolve;
      });
    };

    const p1 = cache.get('k', fetcher, { ttlMs: 100 });
    const p2 = cache.get('k', fetcher, { ttlMs: 100 });
    release('shared');

    expect(await p1).toBe('shared');
    expect(await p2).toBe('shared');
    expect(calls).toBe(1);
  });

  it('serves stale-while-revalidate and refreshes in the background', async () => {
    let now = 0;
    const cache = new InMemoryCache(() => now);

    await cache.get('k', async () => 'old', { ttlMs: 100, staleMs: 1000 });

    now = 200; // stale (> ttlMs) but within staleMs
    let release!: (v: string) => void;
    const refresh = () =>
      new Promise<string>((resolve) => {
        release = resolve;
      });

    // Returns the stale value immediately while a refresh runs.
    expect(await cache.get('k', refresh, { ttlMs: 100, staleMs: 1000 })).toBe('old');

    release('new');
    await flush();

    now = 250; // fresh relative to the just-stored 'new' (stored at now=200)
    expect(await cache.get('k', async () => 'unused', { ttlMs: 100, staleMs: 1000 })).toBe('new');
  });

  it('blocks on refresh once past the stale window', async () => {
    let now = 0;
    const cache = new InMemoryCache(() => now);
    let n = 0;
    const fetcher = vi.fn(async () => `v${String(++n)}`);

    expect(await cache.get('k', fetcher, { ttlMs: 100, staleMs: 1000 })).toBe('v1');
    now = 2000; // beyond staleMs → blocking refetch
    expect(await cache.get('k', fetcher, { ttlMs: 100, staleMs: 1000 })).toBe('v2');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('keeps the last-good value when a background revalidation fails', async () => {
    let now = 0;
    const cache = new InMemoryCache(() => now);

    await cache.get('k', async () => 'old', { ttlMs: 100, staleMs: 1000 });
    now = 200;
    expect(
      await cache.get(
        'k',
        async () => {
          throw new Error('upstream down');
        },
        { ttlMs: 100, staleMs: 1000 },
      ),
    ).toBe('old');
    await flush();
    // Background refresh threw and was swallowed; stale value is still served.
    now = 250;
    expect(await cache.get('k', async () => 'old', { ttlMs: 100, staleMs: 1000 })).toBe('old');
  });
});

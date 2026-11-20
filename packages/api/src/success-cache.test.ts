import { describe, expect, it, vi } from 'vitest';
import { SuccessCache } from './success-cache.js';

describe('SuccessCache', () => {
  it('misses until filled, then serves the stored value within the TTL', async () => {
    let now = 0;
    const cache = new SuccessCache<string>(10, () => now);
    expect(cache.peek('k', 100)).toBeUndefined();

    expect(await cache.fill('k', async () => 'v')).toBe('v');
    expect(await cache.peek('k', 100)).toBe('v');

    now = 100;
    expect(cache.peek('k', 100)).toBeUndefined();
  });

  it('returns but never stores a null result', async () => {
    const cache = new SuccessCache<string>(10);
    expect(await cache.fill('k', async () => null)).toBeNull();
    expect(cache.peek('k', 1000)).toBeUndefined();
  });

  it('turns a rejecting fetcher into null and stores nothing', async () => {
    const cache = new SuccessCache<string>(10);
    expect(await cache.fill('k', () => Promise.reject(new Error('down')))).toBeNull();
    expect(cache.peek('k', 1000)).toBeUndefined();
    expect(cache.inflightCount).toBe(0);
  });

  it('shares one in-flight fetch between concurrent callers, visible to peek', async () => {
    const cache = new SuccessCache<string>(10);
    let release!: (v: string) => void;
    const fetcher = vi.fn(() => new Promise<string>((r) => (release = r)));

    const a = cache.fill('k', fetcher);
    const b = cache.fill('k', fetcher);
    const c = cache.peek('k', 1000);
    expect(cache.inflightCount).toBe(1);
    release('v');

    expect(await Promise.all([a, b, c])).toEqual(['v', 'v', 'v']);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(cache.inflightCount).toBe(0);
  });

  it('evicts the least recently used entry at the cap', async () => {
    const cache = new SuccessCache<string>(2);
    await cache.fill('a', async () => 'A');
    await cache.fill('b', async () => 'B');
    // Touch `a` so `b` becomes the least recently used.
    await cache.peek('a', 1000);
    await cache.fill('c', async () => 'C');

    expect(cache.peek('b', 1000)).toBeUndefined();
    expect(await cache.peek('a', 1000)).toBe('A');
    expect(await cache.peek('c', 1000)).toBe('C');
  });
});

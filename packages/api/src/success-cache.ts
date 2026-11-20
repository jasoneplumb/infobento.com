/**
 * Intent: Bounded, success-only, single-flight cache for the API's public proxy
 *         routes (/api/geolocate, /api/box-data).
 * Context: Those routes take client-chosen keys (an IP, a free-form location),
 *          so the cache must not grow without limit, and a transient upstream
 *          failure must not be served back for a whole TTL. `InMemoryCache`
 *          from @infobento/data does neither: it is unbounded and stores
 *          whatever the fetcher returns, nulls included.
 * Pattern: LRU over Map insertion order. `null` (the data layer's "failed")
 *          is returned to the caller but never stored. Concurrent misses for
 *          one key share a single fetch.
 */

interface Entry<T> {
  readonly value: T;
  readonly storedAtMs: number;
}

export class SuccessCache<T> {
  private readonly store = new Map<string, Entry<T>>();
  private readonly inflight = new Map<string, Promise<T | null>>();
  /** Bumped by `clear()`, so a fetch started before it cannot touch state after it. */
  private generation = 0;

  /**
   * @param maxEntries Cap on stored entries; the least recently used is evicted.
   * @param now        Clock source (injectable for tests).
   */
  constructor(
    private readonly maxEntries: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** Number of distinct keys with a fetch currently in flight. */
  get inflightCount(): number {
    return this.inflight.size;
  }

  /**
   * A fresh stored value or the in-flight fetch for `key`, as a promise; or
   * `undefined` on a miss, meaning the caller decides whether to `fill`. Split
   * from `fill` so a route can admit (rate-limit) only the calls that will
   * actually reach the upstream.
   */
  peek(key: string, ttlMs: number): Promise<T | null> | undefined {
    const entry = this.store.get(key);
    if (entry) {
      if (this.now() - entry.storedAtMs < ttlMs) {
        // Re-insert so Map order tracks recency of use, not of storage.
        this.store.delete(key);
        this.store.set(key, entry);
        return Promise.resolve(entry.value);
      }
      this.store.delete(key);
    }
    return this.inflight.get(key);
  }

  /**
   * Fetch `key` (joining a fetch already in flight for it) and store a non-null
   * result. A rejecting fetcher resolves to `null`, so callers handle one
   * failure shape.
   */
  fill(key: string, fetcher: () => Promise<T | null>): Promise<T | null> {
    const existing = this.inflight.get(key);
    if (existing) return existing;

    const generation = this.generation;
    const pending = (async (): Promise<T | null> => {
      try {
        const value = await fetcher();
        // `!= null`: with T = unknown, `undefined` is as much a non-answer as `null`.
        if (value != null && generation === this.generation) this.set(key, value);
        return value;
      } catch {
        return null;
      } finally {
        // Within one generation `fill` joins rather than replaces, so the slot
        // is still ours. After a `clear()` a newer fetch may own it — leave it.
        if (generation === this.generation) this.inflight.delete(key);
      }
    })();
    this.inflight.set(key, pending);
    return pending;
  }

  /**
   * Drop every stored entry and forget in-flight fetches. Those still settle
   * for their own callers, but neither store their result nor count toward
   * `inflightCount`.
   */
  clear(): void {
    this.store.clear();
    this.inflight.clear();
    this.generation += 1;
  }

  private set(key: string, value: T): void {
    this.store.delete(key);
    if (this.store.size >= this.maxEntries) {
      const oldest = this.store.keys().next();
      if (!oldest.done) this.store.delete(oldest.value);
    }
    this.store.set(key, { value, storedAtMs: this.now() });
  }
}

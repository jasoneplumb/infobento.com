/**
 * Intent: Shared cache contract for box-data resolution so upstream providers
 *         are hit at most once per cache window regardless of device count.
 * Context: Devices on the same cadence wake nearly simultaneously (RFC 0001 §3).
 * Pattern: TTL + stale-while-revalidate + per-key single-flight. The interface
 *          stays small so a durable backend (Workers KV / Redis) can replace the
 *          in-process map later without touching call sites.
 */

export interface CacheGetOptions {
  /** Age (ms) below which a stored entry is served without refetching. */
  readonly ttlMs: number;
  /**
   * Age (ms) below which a *stale* entry (older than `ttlMs`) is served
   * immediately while a refresh runs in the background. Must exceed `ttlMs`
   * to have any effect. Omit for a blocking refresh on every expiry.
   */
  readonly staleMs?: number;
}

export interface Cache {
  /**
   * Resolve a value for `key`, invoking `fetcher` only on a miss or expiry.
   * Concurrent callers for the same key share one in-flight fetch
   * (single-flight); a herd thus makes one upstream call per key, not per
   * caller.
   */
  get<T>(key: string, fetcher: () => Promise<T>, opts: CacheGetOptions): Promise<T>;
}

interface Entry<T> {
  readonly value: T;
  readonly storedAtMs: number;
}

/**
 * In-process `Cache`. Correct for a single Node host; a durable shared cache is
 * a later RFC phase for horizontal/edge scale. Single-flight is included from
 * day one because it's the part that's hard to retrofit safely.
 */
export class InMemoryCache implements Cache {
  private readonly store = new Map<string, Entry<unknown>>();
  private readonly inflight = new Map<string, Promise<unknown>>();

  /** @param now Clock source (injectable for tests). */
  constructor(private readonly now: () => number = Date.now) {}

  async get<T>(key: string, fetcher: () => Promise<T>, opts: CacheGetOptions): Promise<T> {
    const entry = this.store.get(key) as Entry<T> | undefined;
    const ageMs = entry ? this.now() - entry.storedAtMs : Number.POSITIVE_INFINITY;

    if (entry && ageMs < opts.ttlMs) {
      return entry.value; // fresh
    }

    if (entry && opts.staleMs !== undefined && ageMs < opts.staleMs) {
      // Serve stale now; revalidate in the background. Swallow refresh errors
      // so a transient upstream failure keeps the last-good value.
      void this.refresh(key, fetcher).catch(() => undefined);
      return entry.value;
    }

    // Miss or fully expired: await a single-flight refresh.
    return this.refresh(key, fetcher);
  }

  private refresh<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
    const existing = this.inflight.get(key) as Promise<T> | undefined;
    if (existing) return existing;

    const pending = (async () => {
      try {
        const value = await fetcher();
        this.store.set(key, { value, storedAtMs: this.now() });
        return value;
      } finally {
        this.inflight.delete(key);
      }
    })();

    this.inflight.set(key, pending);
    return pending;
  }
}

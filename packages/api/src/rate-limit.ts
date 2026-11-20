/**
 * Intent: Per-key token-bucket rate limiting.
 * Context: Issue #75 — the device-pull endpoints are keyed by device id;
 *   firmware refreshes 1-3x/day (default 3) in normal operation, so that
 *   limiter guards against a misbehaving device hammering the server, not a
 *   fairness mechanism. Issue #287 — /api/box-data limits upstream-bound cache
 *   misses per client so one editor cannot monopolize the shared Nominatim
 *   queue. In-memory only — restarts reset all buckets, which is acceptable for
 *   both threat models.
 */

interface Bucket {
  tokens: number;
  lastRefillMs: number;
}

export interface RateLimiter {
  /**
   * Try to consume one token for `key`. Returns true if allowed, false if the
   * bucket is empty. `nowMs` is injectable for deterministic tests.
   */
  consume(key: string, nowMs?: number): boolean;
  /** Drop every bucket. */
  reset(): void;
}

/** Distinct keys tracked before the buckets are dropped wholesale. */
const DEFAULT_MAX_KEYS = 10_000;

/**
 * @param rate     Tokens per window, which is also the maximum burst.
 * @param windowMs Window over which `rate` tokens refill.
 * @param maxKeys  Bound on tracked keys: keys are caller-supplied (a device id,
 *                 a client IP), so a flood of distinct ones must not grow the
 *                 map without limit. Reaching it resets every bucket — the same
 *                 effect as a restart.
 */
export function createRateLimiter(
  rate: number,
  windowMs: number,
  maxKeys: number = DEFAULT_MAX_KEYS,
): RateLimiter {
  const refillMsPerToken = windowMs / rate;
  const buckets = new Map<string, Bucket>();

  return {
    consume(key: string, nowMs: number = Date.now()): boolean {
      let b = buckets.get(key);
      if (!b) {
        if (buckets.size >= maxKeys) buckets.clear();
        b = { tokens: rate, lastRefillMs: nowMs };
        buckets.set(key, b);
      } else {
        const elapsed = nowMs - b.lastRefillMs;
        if (elapsed >= refillMsPerToken) {
          const add = Math.floor(elapsed / refillMsPerToken);
          b.tokens = Math.min(rate, b.tokens + add);
          b.lastRefillMs += add * refillMsPerToken;
        }
      }
      if (b.tokens < 1) return false;
      b.tokens -= 1;
      return true;
    },
    reset(): void {
      buckets.clear();
    },
  };
}

const RATE = 10; // tokens (== max burst)
const WINDOW_MS = 60_000; // refill window

const deviceLimiter = createRateLimiter(RATE, WINDOW_MS);

/** Device-pull limiter: `RATE` requests per `WINDOW_MS` per device id. */
export function consumeToken(key: string, nowMs: number = Date.now()): boolean {
  return deviceLimiter.consume(key, nowMs);
}

/** Test-only helper to drop all device-pull buckets between cases. */
export function _resetForTesting(): void {
  deviceLimiter.reset();
}

export const RATE_LIMIT_RATE = RATE;
export const RATE_LIMIT_WINDOW_MS = WINDOW_MS;

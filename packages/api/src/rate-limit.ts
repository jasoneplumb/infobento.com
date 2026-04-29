/**
 * Intent: Per-device-id token-bucket rate limiter for the device-pull endpoints.
 * Context: Issue #75 — firmware refreshes 1-2x/day in normal operation; the
 *   limiter is a guard against a misbehaving device hammering the server, not
 *   a fairness mechanism. In-memory only — restarts reset all buckets, which
 *   is acceptable for the threat model.
 */

const RATE = 10; // tokens (== max burst)
const WINDOW_MS = 60_000; // refill window
const REFILL_MS_PER_TOKEN = WINDOW_MS / RATE;

interface Bucket {
  tokens: number;
  lastRefillMs: number;
}

const buckets = new Map<string, Bucket>();

/**
 * Try to consume one token for `key`. Returns true if allowed, false if the
 * bucket is empty. `nowMs` is injectable for deterministic tests.
 */
export function consumeToken(key: string, nowMs: number = Date.now()): boolean {
  let b = buckets.get(key);
  if (!b) {
    b = { tokens: RATE, lastRefillMs: nowMs };
    buckets.set(key, b);
  } else {
    const elapsed = nowMs - b.lastRefillMs;
    if (elapsed >= REFILL_MS_PER_TOKEN) {
      const add = Math.floor(elapsed / REFILL_MS_PER_TOKEN);
      b.tokens = Math.min(RATE, b.tokens + add);
      b.lastRefillMs += add * REFILL_MS_PER_TOKEN;
    }
  }
  if (b.tokens < 1) return false;
  b.tokens -= 1;
  return true;
}

/** Test-only helper to drop all buckets between cases. */
export function _resetForTesting(): void {
  buckets.clear();
}

export const RATE_LIMIT_RATE = RATE;
export const RATE_LIMIT_WINDOW_MS = WINDOW_MS;

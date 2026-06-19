/**
 * Intent: Pace task dispatch to honor an upstream rate limit (Nominatim's
 *         1 req/sec policy), process-globally, across every caller.
 * Context: At a device-wake boundary many box fetchers can fire at once. Per-key
 *          cache dedup (see cache.ts) handles the same-city herd, but devices in
 *          N different cities produce N distinct geocode keys that all miss — so
 *          a cross-key global throttle is also needed (RFC 0001 §3).
 * Pattern: A single promise chain serializes tasks; minimum spacing is enforced
 *          between the *starts* of consecutive tasks. A rejecting task never
 *          wedges the queue.
 */

/** Default sleep — real wall-clock timer. Injectable for deterministic tests. */
function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class RateLimitedQueue {
  private chain: Promise<unknown> = Promise.resolve();
  private lastStartMs = Number.NEGATIVE_INFINITY;

  /**
   * @param minIntervalMs Minimum gap between the starts of consecutive tasks.
   *                      `0` (or less) disables spacing entirely.
   * @param now           Clock source (injectable for tests).
   * @param sleep         Delay primitive (injectable for tests).
   */
  constructor(
    private readonly minIntervalMs: number,
    private readonly now: () => number = Date.now,
    private readonly sleep: (ms: number) => Promise<void> = defaultSleep,
  ) {}

  /**
   * Enqueue `task`. Resolves (or rejects) with its result once it has waited
   * its turn and the minimum interval since the previous task's start.
   */
  run<T>(task: () => Promise<T>): Promise<T> {
    const result = this.chain.then(async () => {
      const waitMs = this.minIntervalMs - (this.now() - this.lastStartMs);
      if (waitMs > 0) await this.sleep(waitMs);
      this.lastStartMs = this.now();
      return task();
    });
    // Advance the chain regardless of this task's outcome so one rejection
    // doesn't stall every task queued behind it.
    this.chain = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}

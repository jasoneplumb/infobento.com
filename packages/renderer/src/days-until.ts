/**
 * Intent: Whole-day distance between two local midnights, shared by the
 *   countdown and holidays boxes
 * Context: Both boxes derive a day count at render time from a stored ISO date
 * Pattern: Pure function — no frame buffer, no config
 * Design: Extracted from two structurally identical copies that had already
 *   drifted (one rounded with ceil, one with round). A single implementation
 *   keeps the DST and NaN handling below from having to be fixed twice.
 */

/**
 * Whole days from today's local midnight until `isoDate`'s local midnight.
 * Returns 0 when the date is today, in the past, or unparseable.
 *
 * Two subtleties, both load-bearing:
 *
 * - `Math.round`, not `Math.ceil`. Both operands are local-midnight timestamps,
 *   so their distance is a whole number of days *except* across a DST
 *   transition, where consecutive local midnights are 23 h or 25 h apart.
 *   `Math.ceil(25 / 24)` is 2 for a date one day away; `Math.round` is correct
 *   in both directions.
 * - The NaN guard. `Math.max(0, NaN)` is `NaN`, not 0 — NaN propagates through
 *   `Math.max` rather than comparing as less-than-zero — so without it a
 *   malformed date reaches the caller and renders as the string "NaN".
 *
 * Note: both midnights are *server*-local. Rendering is server-side, so the
 * countdown rolls over at the render host's midnight, not the device's. See
 * the timezone note in the holidays box.
 */
export function daysUntilLocalMidnight(isoDate: string, now: Date = new Date()): number {
  const target = new Date(isoDate + 'T00:00:00');
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffMs = target.getTime() - today.getTime();
  if (Number.isNaN(diffMs)) return 0;
  return Math.max(0, Math.round(diffMs / (1000 * 60 * 60 * 24)));
}

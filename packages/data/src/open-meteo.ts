/**
 * Intent: Guard Open-Meteo responses that arrive HTTP 200 but carry an error
 *         payload instead of readings.
 * Context: Shared by air-quality.ts, uv.ts, and pollen.ts — all three call the
 *          same air-quality endpoint and all three used to dereference
 *          `data.current` unchecked.
 * Pattern: Pure; returns the `current` block, or null when the response is an
 *   error payload or otherwise malformed.
 *
 * Why this exists: Open-Meteo signals a bad request with
 * `{"error":true,"reason":"..."}` and no `current` key. Dereferencing
 * `data.current.<field>` on that throws a TypeError, which the callers' outer
 * `catch` converts to `null` — making a transient rate-limit or a bad
 * coordinate indistinguishable from "no reading available", and caching that
 * false negative for the full TTL.
 */

/** Open-Meteo's 200-with-error shape. */
interface OpenMeteoError {
  error?: boolean;
  reason?: string;
}

/**
 * intent: Extract the `current` block from an Open-Meteo response
 * method: Reject error payloads and anything without an object `current`
 * effect: Callers can dereference the result without risking a TypeError
 */
export function readCurrent<T>(data: unknown): T | null {
  if (typeof data !== 'object' || data === null) return null;
  if ((data as OpenMeteoError).error === true) return null;

  const current = (data as { current?: unknown }).current;
  if (typeof current !== 'object' || current === null) return null;

  return current as T;
}

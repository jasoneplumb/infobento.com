/**
 * Intent: device-pairing claim endpoint (issue #74) — a signed-in user binds a
 *   device to their account via its printed pair code.
 * Context: epic #77 SaaS hosting / Round 12 Q5. The pair code is the user-facing
 *   secret printed on the QR sticker; the session cookie proves account identity.
 * Design: the handler is built by a factory so server.ts wires the production
 *   `getDb` singleton while tests inject an in-memory DB. The route resolves the
 *   account from the session cookie (mirrors the passkey/oauth routes), then
 *   disambiguates claimDevice's null return — which collapses the "no such code"
 *   and "owned by someone else" cases — into distinct 404 / 409 responses.
 */

import type { Context } from 'hono';
import type { DB } from './db.js';
import { claimDevice, getDeviceByPairCode } from './db.js';
import { readSession } from './auth/session.js';
import { consumeToken } from './rate-limit.js';

/** Parse a stored config_json blob; null (newly-paired) or malformed → null. */
function parseConfig(configJson: string | null): unknown {
  if (configJson == null) return null;
  try {
    return JSON.parse(configJson);
  } catch {
    return null;
  }
}

/**
 * Build the `POST /api/pair` handler. `getDb` is injected so production passes
 * the singleton and tests pass an in-memory database.
 *
 * Responses:
 *   401 — no valid session.
 *   429 — too many claim attempts for this account (pair-code enumeration guard).
 *   400 — malformed body / missing code.
 *   404 — no device with that pair code.
 *   409 — device exists but is owned by a different account.
 *   200 — claimed (or re-claimed by the same account); returns `{ deviceId, config }`.
 */
export function createPairHandler(getDb: () => DB) {
  return async (c: Context): Promise<Response> => {
    const session = readSession(c);
    if (!session) return c.json({ error: 'unauthenticated' }, 401);

    // Throttle per account: the pair code is a short, guessable secret, so an
    // authenticated caller must not be able to enumerate codes at full speed.
    // Keyed under a `pair:` namespace to stay disjoint from the device-id
    // buckets the device-pull endpoints use.
    if (!consumeToken(`pair:${session.accountId}`)) {
      return c.json({ error: 'rate_limited' }, 429, { 'Retry-After': '60' });
    }

    let body: { code?: unknown };
    try {
      body = (await c.req.json()) as { code?: unknown };
    } catch {
      return c.json({ error: 'invalid_json' }, 400);
    }
    const code = typeof body.code === 'string' ? body.code.trim() : '';
    if (!code) return c.json({ error: 'invalid_request' }, 400);

    const db = getDb();
    // Disambiguate claimDevice's overloaded null: distinguish "unknown code"
    // (404) from "already owned by another account" (409). claimDevice returns
    // null for both, so the lookup is the only way to tell them apart. Run both
    // in a transaction so a concurrent claim can't slip between them and turn a
    // would-be 404/200 into a misreported status.
    type Outcome =
      | { status: 404 }
      | { status: 409 }
      | { status: 200; deviceId: string; config: unknown };
    const outcome = db.transaction((): Outcome => {
      const existing = getDeviceByPairCode(db, code);
      if (!existing) return { status: 404 };
      const claimed = claimDevice(db, code, session.accountId);
      if (!claimed) return { status: 409 };
      return { status: 200, deviceId: claimed.id, config: parseConfig(claimed.config_json) };
    })();

    if (outcome.status === 404) return c.json({ error: 'not_found' }, 404);
    if (outcome.status === 409) return c.json({ error: 'already_claimed' }, 409);
    return c.json({ deviceId: outcome.deviceId, config: outcome.config });
  };
}

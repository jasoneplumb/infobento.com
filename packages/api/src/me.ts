/**
 * Intent: user-facing device-management endpoints (issue #76) — the signed-in
 *   editor reads/writes its paired device's config server-side, lists its
 *   devices, and can unpair them.
 * Context: epic #77 SaaS hosting / Round 12 Q5. Distinct from the firmware-facing
 *   device-pull endpoints (#75): those treat the device id as a bearer secret and
 *   carry no session. These endpoints authenticate via the session cookie and
 *   then verify the signed-in account OWNS the device before touching it.
 * Design: handlers are built by factories so server.ts wires the production
 *   `getDb` singleton while tests inject an in-memory DB (mirrors pair.ts).
 */

import type { Context } from 'hono';
import { validateBentoConfig, BentoConfigSchema } from '@infobento/core';
import type { DB } from './db.js';
import { getDevice, getDevicesForAccount, requestForget, setConfig, unclaimDevice } from './db.js';
import { readSession } from './auth/session.js';
import { consumeToken } from './rate-limit.js';

/** A device summary safe to expose to its owner — never leaks the config blob. */
interface DeviceSummary {
  readonly id: string;
  readonly pairCode: string;
  readonly hasConfig: boolean;
}

/**
 * Build the `PUT /api/device/:id/config` handler. The signed-in user overwrites
 * the config of a device they own; the firmware later pulls it via #75.
 *
 * Responses:
 *   401 — no valid session.
 *   404 — no such device the caller owns. Deliberately opaque: a device that is
 *         missing, unclaimed, or owned by another account all return 404 so the
 *         endpoint can't be used to probe for other accounts' device ids.
 *   429 — too many writes for this account.
 *   400 — malformed JSON, or a body that fails BentoConfig validation.
 *   200 — persisted.
 */
export function createPutDeviceConfigHandler(getDb: () => DB) {
  return async (c: Context): Promise<Response> => {
    const session = readSession(c);
    if (!session) return c.json({ error: 'unauthenticated' }, 401);

    // Throttle per account, namespaced disjoint from the `pair:` and device-id
    // buckets so a chatty editor can't starve the pairing or pull limiters.
    if (!consumeToken(`cfg:${session.accountId}`)) {
      return c.json({ error: 'rate_limited' }, 429, { 'Retry-After': '60' });
    }

    // c.req.param('id') is typed string | undefined here, so this guard is
    // required for type-safety (Hono provides it at runtime, but TS can't know).
    const id = c.req.param('id');
    if (!id) return c.json({ error: 'not_found' }, 404);
    const db = getDb();
    const device = getDevice(db, id);
    // Opaque 404 for missing, unclaimed, and other-owner alike — don't reveal
    // that a device id exists to a caller who doesn't own it.
    if (!device || device.owner_account_id !== session.accountId) {
      return c.json({ error: 'not_found' }, 404);
    }

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'invalid_json' }, 400);
    }

    const validation = validateBentoConfig(body);
    if (!validation.valid) {
      return c.json({ error: 'invalid_config', details: validation.errors }, 400);
    }

    // Store the schema-stripped config, not the raw request body, so unknown
    // client-supplied fields aren't persisted and later served to firmware.
    // Safe to parse: validateBentoConfig just succeeded on the same input.
    setConfig(db, id, JSON.stringify(BentoConfigSchema.parse(body)));
    return c.json({ ok: true });
  };
}

/**
 * Build the `GET /api/me/devices` handler — lists the caller's paired devices
 * as `{ id, pairCode, hasConfig }`. The raw config_json is deliberately omitted
 * so the list endpoint can't be used to bulk-exfiltrate configs.
 *
 * Responses:
 *   401 — no valid session.
 *   200 — `{ devices: DeviceSummary[] }`.
 */
export function createListDevicesHandler(getDb: () => DB) {
  return (c: Context): Response => {
    const session = readSession(c);
    if (!session) return c.json({ error: 'unauthenticated' }, 401);

    const devices = getDevicesForAccount(getDb(), session.accountId).map((d): DeviceSummary => ({
      id: d.id,
      pairCode: d.pair_code,
      hasConfig: d.config_json != null,
    }));
    return c.json({ devices });
  };
}

/**
 * Build the `DELETE /api/device/:id/owner` handler — the owner unpairs a device,
 * releasing their claim. Idempotent-ish: a missing/already-unowned device for
 * this account returns 404 (same opaque response as a non-owner, to avoid
 * leaking other accounts' device existence).
 *
 * Responses:
 *   401 — no valid session.
 *   404 — no such device owned by the caller.
 *   200 — unpaired.
 */
export function createUnpairDeviceHandler(getDb: () => DB) {
  return (c: Context): Response => {
    const session = readSession(c);
    if (!session) return c.json({ error: 'unauthenticated' }, 401);

    const id = c.req.param('id');
    if (!id) return c.json({ error: 'not_found' }, 404);
    const ok = unclaimDevice(getDb(), id, session.accountId);
    if (!ok) return c.json({ error: 'not_found' }, 404);
    return c.json({ ok: true });
  };
}

/**
 * Build the `POST /api/device/:id/forget` handler — the editor's "forget Wi-Fi"
 * button (issue #39). Flags the device so its next firmware pull is told to
 * clear NVS Wi-Fi credentials and re-enter captive-portal AP mode (the same
 * effect as the physical pinhole reset). Owner-gated like the unpair handler;
 * not throttled, matching its sibling and because the write is idempotent
 * (re-setting an already-set flag is a no-op).
 *
 * Responses:
 *   401 — no valid session.
 *   404 — no such device owned by the caller (opaque, as elsewhere in this file).
 *   200 — forget queued.
 */
export function createForgetWifiHandler(getDb: () => DB) {
  return (c: Context): Response => {
    const session = readSession(c);
    if (!session) return c.json({ error: 'unauthenticated' }, 401);

    const id = c.req.param('id');
    if (!id) return c.json({ error: 'not_found' }, 404);
    const ok = requestForget(getDb(), id, session.accountId);
    if (!ok) return c.json({ error: 'not_found' }, 404);
    return c.json({ ok: true });
  };
}

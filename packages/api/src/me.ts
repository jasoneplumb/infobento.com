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
import type { Device } from './db.js';
import { readSession } from './auth/session.js';
import { consumeToken } from './rate-limit.js';

/** A device summary safe to expose to its owner — never leaks the config blob. */
interface DeviceSummary {
  readonly id: string;
  readonly pairCode: string;
  readonly hasConfig: boolean;
}

/**
 * Shared gate for every owner-scoped device route: session -> rate limit ->
 * ownership. Returns the device on success, or the Response to send back.
 *
 * Extracted because four handlers repeated this preamble verbatim, so any change
 * to it — a new status code, a rate-limit namespace, a Hono typing workaround —
 * had to be made in four places and could silently diverge in one.
 *
 * Order matters and is deliberate: the rate limit is consumed BEFORE the
 * ownership check, so probing ids you don't own costs tokens. Checking ownership
 * first would let an authenticated caller enumerate device ids for free.
 *
 * `bucket` namespaces the limiter. Reads use their own bucket so that opening
 * devices in the editor cannot exhaust the allowance for writes.
 */
function requireOwnedDevice(
  c: Context,
  getDb: () => DB,
  bucket: 'cfg' | 'cfgread',
): { device: Device } | { response: Response } {
  const session = readSession(c);
  if (!session) return { response: c.json({ error: 'unauthenticated' }, 401) };

  if (!consumeToken(`${bucket}:${session.accountId}`)) {
    return { response: c.json({ error: 'rate_limited' }, 429, { 'Retry-After': '60' }) };
  }

  // Unreachable at runtime — Hono always populates :id for these routes — but
  // c.req.param('id') is typed `string | undefined`, so the guard is required
  // for type-safety, not defensiveness. Deleting it fails the build (TS2345).
  const id = c.req.param('id');
  if (!id) return { response: c.json({ error: 'not_found' }, 404) };

  const device = getDevice(getDb(), id);
  // Opaque 404 for missing, unclaimed, and other-owner alike — never confirm
  // that a device id exists to a caller who doesn't own it.
  if (!device || device.owner_account_id !== session.accountId) {
    return { response: c.json({ error: 'not_found' }, 404) };
  }
  return { device };
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
    const gate = requireOwnedDevice(c, getDb, 'cfg');
    if ('response' in gate) return gate.response;
    const id = gate.device.id;
    const db = getDb();

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
 * Build the `GET /api/me/device/:id/config` handler — the SESSION-gated read of
 * a device's stored config, for the web editor.
 *
 * Why this exists (#116): the editor previously read config through the
 * firmware-facing `GET /api/device/:id/config`, where the device id alone is
 * the bearer secret. That worked only because the id came from the
 * ownership-gated `/api/me/devices` list, which mixed two auth models in one
 * flow and made the editor's safety depend on where it happened to get the id.
 * This handler mirrors `createPutDeviceConfigHandler` exactly, so read and
 * write share one ownership check.
 *
 * Responses:
 *   401 — no valid session.
 *   429 — too many reads for this account.
 *   404 — missing, unclaimed, or owned by someone else (opaque, deliberately).
 *   200 — `{ config }`, where config is null when nothing is stored yet.
 */
export function createGetDeviceConfigHandler(getDb: () => DB) {
  return (c: Context): Response => {
    // Read-scoped bucket: opening devices in the editor must not eat into the
    // write allowance, and selecting a fresh device costs a read AND a write.
    const gate = requireOwnedDevice(c, getDb, 'cfgread');
    if ('response' in gate) return gate.response;
    const { device } = gate;

    // A claimed device with no config yet is a 200 with null, NOT a 404. The
    // caller must be able to tell "you don't own this" from "nothing stored
    // yet" — conflating them is what made #191 hard to reason about.
    if (!device.config_json) return c.json({ config: null });

    try {
      return c.json({ config: JSON.parse(device.config_json) as unknown });
    } catch {
      // Stored config is corrupt; report it as absent rather than 500ing, so
      // the editor can overwrite it on the next save.
      return c.json({ config: null });
    }
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

/**
 * Intent: HTTP-level coverage for the user-facing device-management endpoints
 *   (issue #76): PUT /api/device/:id/config, GET /api/me/devices,
 *   DELETE /api/device/:id/owner.
 * Context: auth-sensitive. These authenticate via the session cookie and gate on
 *   account ownership — the tests forge sessions with the same signSession helper
 *   the real auth routes use and assert the 401/404/400 boundaries (404 is opaque
 *   for non-owner/unclaimed) plus the no-config-leak invariant.
 * Setup: a throwaway Hono app mounts the real handlers over an in-memory DB.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import { createDb, createAccount, createDevice, setConfig, claimDevice, getDevice } from './db.js';
import type { DB } from './db.js';
import { signSession } from './auth/session.js';
import {
  createForgetWifiHandler,
  createGetDeviceConfigHandler,
  createListDevicesHandler,
  createPutDeviceConfigHandler,
  createUnpairDeviceHandler,
} from './me.js';
import { _resetForTesting as resetRateLimit } from './rate-limit.js';

const TEST_SECRET = 'test-secret-sixteen-chars-long';

/** A minimal config that satisfies BentoConfigSchema (core validation). */
const VALID_CONFIG = {
  boxes: [{ id: '1', label: 'Hi', type: 'text', config: { type: 'text', text: 'yo' } }],
  refreshesPerDay: 1 as const,
};

function makeApp(db: DB): Hono {
  const app = new Hono();
  app.put(
    '/api/device/:id/config',
    createPutDeviceConfigHandler(() => db),
  );
  app.get(
    '/api/me/devices',
    createListDevicesHandler(() => db),
  );
  app.delete(
    '/api/device/:id/owner',
    createUnpairDeviceHandler(() => db),
  );
  app.post(
    '/api/device/:id/forget',
    createForgetWifiHandler(() => db),
  );
  app.get(
    '/api/me/device/:id/config',
    createGetDeviceConfigHandler(() => db),
  );
  return app;
}

function cookie(accountId: string): Record<string, string> {
  return { cookie: `ib_session=${signSession({ accountId })}` };
}

async function putConfig(
  app: Hono,
  id: string,
  body: unknown,
  accountId?: string,
): Promise<Response> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (accountId) Object.assign(headers, cookie(accountId));
  return app.request(`/api/device/${id}/config`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(body),
  });
}

describe('PUT /api/device/:id/config', () => {
  let db: DB;
  let app: Hono;

  beforeEach(() => {
    process.env['SESSION_SECRET'] = TEST_SECRET;
    resetRateLimit();
    db = createDb(':memory:');
    app = makeApp(db);
  });

  afterEach(() => {
    delete process.env['SESSION_SECRET'];
    db.close();
  });

  it('returns 401 when unauthenticated', async () => {
    const device = createDevice(db, { pairCode: 'ABC123' });
    const res = await putConfig(app, device.id, VALID_CONFIG);
    expect(res.status).toBe(401);
    // Config must not be written without a session.
    expect(getDevice(db, device.id)?.config_json).toBeNull();
  });

  it('returns 404 for a missing device', async () => {
    const account = createAccount(db);
    const res = await putConfig(app, 'no-such-device', VALID_CONFIG, account.id);
    expect(res.status).toBe(404);
  });

  it('returns opaque 404 when the caller does not own the device', async () => {
    const owner = createAccount(db);
    const intruder = createAccount(db);
    const device = createDevice(db, { pairCode: 'OWNED1' });
    claimDevice(db, 'OWNED1', owner.id);

    // Opaque 404 (not 403) so a non-owner can't confirm the device id exists.
    const res = await putConfig(app, device.id, VALID_CONFIG, intruder.id);
    expect(res.status).toBe(404);
    expect(getDevice(db, device.id)?.config_json).toBeNull();
  });

  it('returns opaque 404 for an existing but unclaimed device', async () => {
    const account = createAccount(db);
    const device = createDevice(db, { pairCode: 'UNOWN1' }); // never claimed
    const res = await putConfig(app, device.id, VALID_CONFIG, account.id);
    expect(res.status).toBe(404);
    expect(getDevice(db, device.id)?.config_json).toBeNull();
  });

  it('returns 400 with field errors for an invalid config', async () => {
    const account = createAccount(db);
    const device = createDevice(db, { pairCode: 'CFG400' });
    claimDevice(db, 'CFG400', account.id);

    const res = await putConfig(app, device.id, { boxes: [] }, account.id);
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string; details: unknown[] };
    expect(json.error).toBe('invalid_config');
    expect(json.details.length).toBeGreaterThan(0);
    expect(getDevice(db, device.id)?.config_json).toBeNull();
  });

  it('returns 400 for a malformed JSON body', async () => {
    const account = createAccount(db);
    const device = createDevice(db, { pairCode: 'BADJSN' });
    claimDevice(db, 'BADJSN', account.id);

    const res = await app.request(`/api/device/${device.id}/config`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', ...cookie(account.id) },
      body: '{ not json',
    });
    expect(res.status).toBe(400);
  });

  it('persists a valid config for the owner (200) and the firmware can read it back', async () => {
    const account = createAccount(db);
    const device = createDevice(db, { pairCode: 'HAPPY1' });
    claimDevice(db, 'HAPPY1', account.id);

    const res = await putConfig(app, device.id, VALID_CONFIG, account.id);
    expect(res.status).toBe(200);
    expect(getDevice(db, device.id)?.config_json).toBe(JSON.stringify(VALID_CONFIG));
  });

  it('rate-limits an account hammering writes (429 after the burst)', async () => {
    const account = createAccount(db);
    const device = createDevice(db, { pairCode: 'RL0001' });
    claimDevice(db, 'RL0001', account.id);

    // The token bucket allows a burst of 10; the 11th write is throttled.
    for (let i = 0; i < 10; i++) {
      expect((await putConfig(app, device.id, VALID_CONFIG, account.id)).status).toBe(200);
    }
    const res = await putConfig(app, device.id, VALID_CONFIG, account.id);
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('60');
  });
});

describe('GET /api/me/devices', () => {
  let db: DB;
  let app: Hono;

  beforeEach(() => {
    process.env['SESSION_SECRET'] = TEST_SECRET;
    resetRateLimit();
    db = createDb(':memory:');
    app = makeApp(db);
  });

  afterEach(() => {
    delete process.env['SESSION_SECRET'];
    db.close();
  });

  it('returns 401 when unauthenticated', async () => {
    const res = await app.request('/api/me/devices');
    expect(res.status).toBe(401);
  });

  it('returns only the caller’s devices and never leaks the config blob', async () => {
    const me = createAccount(db);
    const other = createAccount(db);
    const mine = createDevice(db, { pairCode: 'MINE01' });
    claimDevice(db, 'MINE01', me.id);
    setConfig(db, mine.id, JSON.stringify(VALID_CONFIG));
    const theirs = createDevice(db, { pairCode: 'THEIR1' });
    claimDevice(db, 'THEIR1', other.id);
    createDevice(db, { pairCode: 'UNOWNED' }); // unclaimed — belongs to nobody

    const res = await app.request('/api/me/devices', { headers: cookie(me.id) });
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      devices: Array<{ id: string; pairCode: string; hasConfig: boolean }>;
    };
    expect(json.devices).toHaveLength(1);
    expect(json.devices[0]).toEqual({ id: mine.id, pairCode: 'MINE01', hasConfig: true });
    // The other account's device must not appear, and no row carries config_json.
    expect(json.devices.some((d) => d.id === theirs.id)).toBe(false);
    expect(JSON.stringify(json)).not.toContain('config_json');
    expect(JSON.stringify(json)).not.toContain('yo');
  });

  it('reports hasConfig=false for a paired device with no config yet', async () => {
    const me = createAccount(db);
    const fresh = createDevice(db, { pairCode: 'FRESH9' });
    claimDevice(db, 'FRESH9', me.id);

    const res = await app.request('/api/me/devices', { headers: cookie(me.id) });
    const json = (await res.json()) as { devices: Array<{ id: string; hasConfig: boolean }> };
    expect(json.devices).toEqual([expect.objectContaining({ id: fresh.id, hasConfig: false })]);
  });
});

describe('DELETE /api/device/:id/owner', () => {
  let db: DB;
  let app: Hono;

  beforeEach(() => {
    process.env['SESSION_SECRET'] = TEST_SECRET;
    resetRateLimit();
    db = createDb(':memory:');
    app = makeApp(db);
  });

  afterEach(() => {
    delete process.env['SESSION_SECRET'];
    db.close();
  });

  it('returns 401 when unauthenticated', async () => {
    const device = createDevice(db, { pairCode: 'UNP401' });
    const res = await app.request(`/api/device/${device.id}/owner`, { method: 'DELETE' });
    expect(res.status).toBe(401);
  });

  it('unpairs a device the caller owns (200) and drops it from the list', async () => {
    const me = createAccount(db);
    const device = createDevice(db, { pairCode: 'UNP200' });
    claimDevice(db, 'UNP200', me.id);

    const res = await app.request(`/api/device/${device.id}/owner`, {
      method: 'DELETE',
      headers: cookie(me.id),
    });
    expect(res.status).toBe(200);
    expect(getDevice(db, device.id)?.owner_account_id).toBeNull();

    const list = await app.request('/api/me/devices', { headers: cookie(me.id) });
    const json = (await list.json()) as { devices: unknown[] };
    expect(json.devices).toHaveLength(0);
  });

  it('returns 404 when unpairing a device owned by someone else', async () => {
    const owner = createAccount(db);
    const intruder = createAccount(db);
    const device = createDevice(db, { pairCode: 'UNP404' });
    claimDevice(db, 'UNP404', owner.id);

    const res = await app.request(`/api/device/${device.id}/owner`, {
      method: 'DELETE',
      headers: cookie(intruder.id),
    });
    expect(res.status).toBe(404);
    // Ownership is unchanged — the intruder could not unbind it.
    expect(getDevice(db, device.id)?.owner_account_id).toBe(owner.id);
  });
});

describe('POST /api/device/:id/forget', () => {
  let db: DB;
  let app: Hono;

  beforeEach(() => {
    process.env['SESSION_SECRET'] = TEST_SECRET;
    resetRateLimit();
    db = createDb(':memory:');
    app = makeApp(db);
  });

  afterEach(() => {
    delete process.env['SESSION_SECRET'];
    db.close();
  });

  it('returns 401 when unauthenticated', async () => {
    const device = createDevice(db, { pairCode: 'FGT401' });
    const res = await app.request(`/api/device/${device.id}/forget`, { method: 'POST' });
    expect(res.status).toBe(401);
    expect(getDevice(db, device.id)?.forget_pending).toBe(0);
  });

  it('queues a forget for a device the caller owns (200)', async () => {
    const me = createAccount(db);
    const device = createDevice(db, { pairCode: 'FGT200' });
    claimDevice(db, 'FGT200', me.id);

    const res = await app.request(`/api/device/${device.id}/forget`, {
      method: 'POST',
      headers: cookie(me.id),
    });
    expect(res.status).toBe(200);
    expect(getDevice(db, device.id)?.forget_pending).toBe(1);
  });

  it('returns opaque 404 for a device owned by someone else', async () => {
    const owner = createAccount(db);
    const intruder = createAccount(db);
    const device = createDevice(db, { pairCode: 'FGT404' });
    claimDevice(db, 'FGT404', owner.id);

    const res = await app.request(`/api/device/${device.id}/forget`, {
      method: 'POST',
      headers: cookie(intruder.id),
    });
    expect(res.status).toBe(404);
    // The intruder could not flag a device they don't own.
    expect(getDevice(db, device.id)?.forget_pending).toBe(0);
  });
});

describe('GET /api/me/device/:id/config (session-gated read, #116)', () => {
  let db: DB;
  let app: Hono;

  beforeEach(() => {
    process.env['SESSION_SECRET'] = TEST_SECRET;
    resetRateLimit();
    db = createDb(':memory:');
    app = makeApp(db);
  });

  afterEach(() => {
    delete process.env['SESSION_SECRET'];
    db.close();
  });

  it('401s without a session', async () => {
    const device = createDevice(db, { pairCode: 'GET401' });
    const res = await app.request(`/api/me/device/${device.id}/config`);
    expect(res.status).toBe(401);
  });

  it('returns the stored config to the owner', async () => {
    const owner = createAccount(db);
    const device = createDevice(db, { pairCode: 'GET200' });
    claimDevice(db, 'GET200', owner.id);
    setConfig(db, device.id, JSON.stringify(VALID_CONFIG));

    const res = await app.request(`/api/me/device/${device.id}/config`, {
      headers: cookie(owner.id),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ config: VALID_CONFIG });
  });

  it('distinguishes "claimed but unconfigured" (200 + null) from "not yours" (404)', async () => {
    // This distinction is the point of the endpoint: the old firmware-facing
    // GET returned 404 for both, which is what made #191 ambiguous.
    const owner = createAccount(db);
    const device = createDevice(db, { pairCode: 'GETNUL' });
    claimDevice(db, 'GETNUL', owner.id);

    const res = await app.request(`/api/me/device/${device.id}/config`, {
      headers: cookie(owner.id),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ config: null });
  });

  it('returns opaque 404 for another account, an unclaimed device, and an unknown id alike', async () => {
    const owner = createAccount(db);
    const intruder = createAccount(db);
    const claimed = createDevice(db, { pairCode: 'GETOTH' });
    claimDevice(db, 'GETOTH', owner.id);
    setConfig(db, claimed.id, JSON.stringify(VALID_CONFIG));
    const unclaimed = createDevice(db, { pairCode: 'GETUNC' });

    const other = await app.request(`/api/me/device/${claimed.id}/config`, {
      headers: cookie(intruder.id),
    });
    const orphan = await app.request(`/api/me/device/${unclaimed.id}/config`, {
      headers: cookie(intruder.id),
    });
    const missing = await app.request(`/api/me/device/does-not-exist/config`, {
      headers: cookie(intruder.id),
    });

    expect(other.status).toBe(404);
    expect(orphan.status).toBe(404);
    expect(missing.status).toBe(404);
    // Indistinguishable bodies — a non-owner learns nothing about which ids exist.
    expect(await other.json()).toEqual(await missing.json());
  });

  it('reads draw from their own bucket and cannot exhaust the write allowance', async () => {
    // Selecting a device costs a read AND a write (#191 seeds a fresh device),
    // so sharing one bucket let a few device switches drain the write quota.
    const owner = createAccount(db);
    const device = createDevice(db, { pairCode: 'GETBKT' });
    claimDevice(db, 'GETBKT', owner.id);

    // Burn the entire read allowance.
    for (let i = 0; i < 10; i++) {
      const r = await app.request(`/api/me/device/${device.id}/config`, {
        headers: cookie(owner.id),
      });
      expect(r.status).toBe(200);
    }
    expect(
      (await app.request(`/api/me/device/${device.id}/config`, { headers: cookie(owner.id) }))
        .status,
    ).toBe(429);

    // Writes must still be available — different namespace.
    const write = await putConfig(app, device.id, VALID_CONFIG, owner.id);
    expect(write.status).toBe(200);
  });

  it('does not leak the config of a device owned by someone else', async () => {
    const owner = createAccount(db);
    const intruder = createAccount(db);
    const device = createDevice(db, { pairCode: 'GETLEK' });
    claimDevice(db, 'GETLEK', owner.id);
    setConfig(db, device.id, JSON.stringify(VALID_CONFIG));

    const res = await app.request(`/api/me/device/${device.id}/config`, {
      headers: cookie(intruder.id),
    });
    expect(JSON.stringify(await res.json())).not.toContain('yo');
  });
});

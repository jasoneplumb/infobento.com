/**
 * Intent: HTTP-level coverage for POST /api/pair (issue #74).
 * Context: auth-sensitive. Verifies the 401/404/409 disambiguation, the happy
 *   path (claims + returns config), and idempotent re-claim by the same account.
 * Setup: a throwaway Hono app mounts the real handler over an in-memory DB; we
 *   forge session cookies with the same signSession helper the auth routes use.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import { createDb, createAccount, createDevice, setConfig, getDeviceByPairCode } from './db.js';
import type { DB } from './db.js';
import { signSession } from './auth/session.js';
import { createPairHandler } from './pair.js';
import { _resetForTesting as resetRateLimit } from './rate-limit.js';

const TEST_SECRET = 'test-secret-sixteen-chars-long';

function makeApp(db: DB): Hono {
  const app = new Hono();
  app.post(
    '/api/pair',
    createPairHandler(() => db),
  );
  return app;
}

/** POST /api/pair with an optional session cookie for `accountId`. */
async function postPair(app: Hono, body: unknown, accountId?: string): Promise<Response> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (accountId) {
    headers['cookie'] = `ib_session=${signSession({ accountId })}`;
  }
  return app.request('/api/pair', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

describe('POST /api/pair', () => {
  let db: DB;
  let app: Hono;

  beforeEach(() => {
    process.env['SESSION_SECRET'] = TEST_SECRET;
    resetRateLimit(); // isolate the per-account token buckets between tests
    db = createDb(':memory:');
    app = makeApp(db);
  });

  afterEach(() => {
    delete process.env['SESSION_SECRET'];
    db.close();
  });

  it('returns 401 when unauthenticated', async () => {
    createDevice(db, { pairCode: 'ABC123' });
    const res = await postPair(app, { code: 'ABC123' });
    expect(res.status).toBe(401);
    // Device must remain unclaimed when there is no session.
    expect(getDeviceByPairCode(db, 'ABC123')?.owner_account_id).toBeNull();
  });

  it('returns 400 for a missing/blank code', async () => {
    const account = createAccount(db);
    const res = await postPair(app, { code: '   ' }, account.id);
    expect(res.status).toBe(400);
  });

  it('returns 404 for an unknown pair code', async () => {
    const account = createAccount(db);
    const res = await postPair(app, { code: 'NOPE99' }, account.id);
    expect(res.status).toBe(404);
  });

  it('returns 409 when the device is owned by another account', async () => {
    const owner = createAccount(db);
    const intruder = createAccount(db);
    createDevice(db, { pairCode: 'OWNED1' });
    // First account claims it.
    expect((await postPair(app, { code: 'OWNED1' }, owner.id)).status).toBe(200);
    // Second account is rejected.
    const res = await postPair(app, { code: 'OWNED1' }, intruder.id);
    expect(res.status).toBe(409);
    expect(getDeviceByPairCode(db, 'OWNED1')?.owner_account_id).toBe(owner.id);
  });

  it('claims an unowned device and returns its config', async () => {
    const account = createAccount(db);
    const device = createDevice(db, { pairCode: 'CLAIM1' });
    const config = {
      version: 2,
      boxes: [{ type: 'text', label: 'Hi', config: { content: 'yo' } }],
    };
    setConfig(db, device.id, JSON.stringify(config));

    const res = await postPair(app, { code: 'CLAIM1' }, account.id);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { deviceId: string; config: unknown };
    expect(json.deviceId).toBe(device.id);
    expect(json.config).toEqual(config);
    expect(getDeviceByPairCode(db, 'CLAIM1')?.owner_account_id).toBe(account.id);
  });

  it('returns null config for a newly-paired device with no config', async () => {
    const account = createAccount(db);
    createDevice(db, { pairCode: 'FRESH1' });
    const res = await postPair(app, { code: 'FRESH1' }, account.id);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { config: unknown };
    expect(json.config).toBeNull();
  });

  it('is idempotent: the same account can re-claim its own device', async () => {
    const account = createAccount(db);
    createDevice(db, { pairCode: 'AGAIN1' });
    expect((await postPair(app, { code: 'AGAIN1' }, account.id)).status).toBe(200);
    const res = await postPair(app, { code: 'AGAIN1' }, account.id);
    expect(res.status).toBe(200);
    expect(getDeviceByPairCode(db, 'AGAIN1')?.owner_account_id).toBe(account.id);
  });

  it('rate-limits an account enumerating pair codes (429 after the burst)', async () => {
    const account = createAccount(db);
    // The token bucket allows a burst of 10; the 11th attempt is throttled.
    for (let i = 0; i < 10; i++) {
      expect((await postPair(app, { code: 'NOPE99' }, account.id)).status).toBe(404);
    }
    const res = await postPair(app, { code: 'NOPE99' }, account.id);
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('60');
  });
});

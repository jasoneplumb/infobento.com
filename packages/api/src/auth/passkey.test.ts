/**
 * Intent: Verify the passkey ceremonies' surface that does NOT require a
 *   real authenticator: option generation, challenge round-tripping, and the
 *   sign-counter rollback rule on the DB layer.
 * Caveat: Full ceremony tests would need a WebAuthn fixture or a real
 *   authenticator; we exercise the parts we own and rely on
 *   @simplewebauthn/server's own test suite for cryptographic correctness.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createDb,
  createAccount,
  insertPasskey,
  updatePasskeySignCount,
  getPasskey,
  type DB,
} from '../db.js';
import {
  createAuthenticationOptions,
  createRegistrationOptions,
  getPasskeyConfig,
} from './passkey.js';
import { decodeChallenge } from './challenge.js';

const TEST_SECRET = 'test-secret-at-least-sixteen-chars';

describe('passkey ceremonies', () => {
  let db: DB;
  beforeEach(() => {
    db = createDb(':memory:');
    process.env['SESSION_SECRET'] = TEST_SECRET;
    process.env['RP_ID'] = 'localhost';
    process.env['RP_ORIGIN'] = 'http://localhost:5173';
  });
  afterEach(() => {
    delete process.env['SESSION_SECRET'];
    delete process.env['RP_ID'];
    delete process.env['RP_ORIGIN'];
  });

  it('reads RP config from env vars with sensible defaults', () => {
    const config = getPasskeyConfig();
    expect(config.rpID).toBe('localhost');
    expect(config.origins).toEqual(['http://localhost:5173']);
  });

  it('supports a comma-separated RP_ORIGIN list', () => {
    process.env['RP_ORIGIN'] = 'http://localhost:5173, https://www.infobento.com';
    const config = getPasskeyConfig();
    expect(config.origins).toEqual(['http://localhost:5173', 'https://www.infobento.com']);
  });

  it('issues registration options with a typed challenge token', async () => {
    const account = createAccount(db, { email: 'reg@example.com' });
    const result = await createRegistrationOptions(db, account.id);
    expect(result.options.rp.id).toBe('localhost');
    expect(typeof result.options.challenge).toBe('string');
    const decoded = decodeChallenge<{ challenge: string; accountId: string }>(
      'webauthn-reg',
      result.challengeToken,
    );
    expect(decoded?.accountId).toBe(account.id);
    expect(decoded?.challenge).toBe(result.options.challenge);
  });

  it('throws when registering against a missing account', async () => {
    await expect(createRegistrationOptions(db, 'no-such-account')).rejects.toThrow(/not found/);
  });

  it('issues authentication options with an empty allow-list', async () => {
    const result = await createAuthenticationOptions(db);
    expect(result.options.rpId).toBe('localhost');
    expect(result.options.allowCredentials ?? []).toEqual([]);
    const decoded = decodeChallenge<{ challenge: string }>('webauthn-auth', result.challengeToken);
    expect(decoded?.challenge).toBe(result.options.challenge);
  });
});

describe('passkey sign-count rollback (replay defense)', () => {
  let db: DB;
  beforeEach(() => {
    db = createDb(':memory:');
  });

  it('accepts a strictly increasing counter', () => {
    const a = createAccount(db);
    insertPasskey(db, {
      credentialId: 'cred-1',
      accountId: a.id,
      publicKey: new Uint8Array([1, 2, 3]),
      signCount: 5,
    });
    expect(updatePasskeySignCount(db, 'cred-1', 6)).toBe(true);
    expect(getPasskey(db, 'cred-1')?.sign_count).toBe(6);
  });

  it('rejects a non-increasing counter when the previous value was non-zero', () => {
    const a = createAccount(db);
    insertPasskey(db, {
      credentialId: 'cred-2',
      accountId: a.id,
      publicKey: new Uint8Array([1, 2, 3]),
      signCount: 5,
    });
    expect(updatePasskeySignCount(db, 'cred-2', 5)).toBe(false);
    expect(updatePasskeySignCount(db, 'cred-2', 4)).toBe(false);
    expect(getPasskey(db, 'cred-2')?.sign_count).toBe(5);
  });

  it('permits 0 → 0 transitions for authenticators that never bump the counter', () => {
    const a = createAccount(db);
    insertPasskey(db, {
      credentialId: 'cred-3',
      accountId: a.id,
      publicKey: new Uint8Array([9]),
      signCount: 0,
    });
    expect(updatePasskeySignCount(db, 'cred-3', 0)).toBe(true);
    expect(getPasskey(db, 'cred-3')?.last_used_at).not.toBeNull();
  });

  it('returns false for an unknown credential id', () => {
    expect(updatePasskeySignCount(db, 'no-such-credential', 1)).toBe(false);
  });
});

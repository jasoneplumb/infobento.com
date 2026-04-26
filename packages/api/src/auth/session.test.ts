import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { signSession, verifySession } from './session.js';

const TEST_SECRET = 'test-secret-at-least-sixteen-chars';

describe('session token', () => {
  beforeEach(() => {
    process.env['SESSION_SECRET'] = TEST_SECRET;
  });
  afterEach(() => {
    delete process.env['SESSION_SECRET'];
  });

  it('round-trips an account id', () => {
    const token = signSession({ accountId: 'acct-1' });
    const payload = verifySession(token);
    expect(payload?.accountId).toBe('acct-1');
    expect(payload?.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it('rejects a tampered signature', () => {
    const token = signSession({ accountId: 'acct-1' });
    const parts = token.split('.');
    parts[2] = parts[2]!.replace(/.$/, parts[2]!.endsWith('A') ? 'B' : 'A');
    expect(verifySession(parts.join('.'))).toBeNull();
  });

  it('rejects a tampered account id (signature mismatch)', () => {
    const token = signSession({ accountId: 'acct-1' });
    const parts = token.split('.');
    const tamperedAcct = Buffer.from('acct-2', 'utf8').toString('base64url');
    parts[0] = tamperedAcct;
    expect(verifySession(parts.join('.'))).toBeNull();
  });

  it('rejects an expired token', () => {
    const now = 1_000_000;
    const token = signSession(
      { accountId: 'acct-1', ttlSeconds: 60 },
      { secret: TEST_SECRET, now },
    );
    expect(verifySession(token, { secret: TEST_SECRET, now: now + 100 })).toBeNull();
  });

  it('rejects a malformed token', () => {
    expect(verifySession('not.a.token')).toBeNull();
    expect(verifySession('only-two.parts')).toBeNull();
    expect(verifySession('a.b.c.d')).toBeNull();
  });

  it('rejects a token signed with a different secret', () => {
    const token = signSession({ accountId: 'acct-1' }, { secret: 'other-secret-sixteen-chars-x' });
    expect(verifySession(token)).toBeNull();
  });

  it('signSession throws when SESSION_SECRET is missing', () => {
    delete process.env['SESSION_SECRET'];
    expect(() => signSession({ accountId: 'acct-1' })).toThrow(/SESSION_SECRET/);
  });

  it('signSession throws when SESSION_SECRET is too short', () => {
    process.env['SESSION_SECRET'] = 'short';
    expect(() => signSession({ accountId: 'acct-1' })).toThrow(/SESSION_SECRET/);
  });
});

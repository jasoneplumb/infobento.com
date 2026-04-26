import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { encodeChallenge, decodeChallenge } from './challenge.js';

const TEST_SECRET = 'test-secret-at-least-sixteen-chars';

describe('typed signed challenge tokens', () => {
  beforeEach(() => {
    process.env['SESSION_SECRET'] = TEST_SECRET;
  });
  afterEach(() => {
    delete process.env['SESSION_SECRET'];
  });

  it('round-trips a payload with the matching type', () => {
    const token = encodeChallenge('test-type', { foo: 'bar', n: 42 });
    const decoded = decodeChallenge<{ foo: string; n: number }>('test-type', token);
    expect(decoded).toEqual({ foo: 'bar', n: 42 });
  });

  it('rejects when the type tag does not match', () => {
    const token = encodeChallenge('type-a', { x: 1 });
    expect(decodeChallenge('type-b', token)).toBeNull();
  });

  it('rejects an expired token', () => {
    const now = 1_000_000;
    const token = encodeChallenge('t', { x: 1 }, { ttlSeconds: 60, secret: TEST_SECRET, now });
    expect(decodeChallenge('t', token, { secret: TEST_SECRET, now: now + 1000 })).toBeNull();
  });

  it('rejects tampered payload (signature fails)', () => {
    const token = encodeChallenge('t', { x: 1 });
    const parts = token.split('.');
    const tampered = Buffer.from(JSON.stringify({ x: 999 }), 'utf8').toString('base64url');
    parts[1] = tampered;
    expect(decodeChallenge('t', parts.join('.'))).toBeNull();
  });

  it('rejects malformed tokens', () => {
    expect(decodeChallenge('t', 'a.b.c')).toBeNull();
    expect(decodeChallenge('t', 'a.b.c.d.e')).toBeNull();
    expect(decodeChallenge('t', '')).toBeNull();
  });
});

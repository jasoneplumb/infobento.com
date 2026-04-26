/**
 * Intent: Short-lived HMAC-signed cookies that round-trip a WebAuthn challenge
 *   (or OAuth state/PKCE-verifier) between /options and /verify (or /start
 *   and /callback). Avoids needing a server-side challenge store.
 * Context: Issue #73 — keeps the API stateless across the auth ceremonies.
 * Crypto: HMAC-SHA256 over `${type}.${payload_b64url}.${exp}` with
 *   SESSION_SECRET (the same secret as session cookies — the included `type`
 *   tag prevents cross-purpose substitution).
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

const SECRET_ENV_VAR = 'SESSION_SECRET';

function getSecret(): string {
  const secret = process.env[SECRET_ENV_VAR];
  if (!secret || secret.length < 16) {
    throw new Error(`${SECRET_ENV_VAR} must be set to a value of at least 16 characters`);
  }
  return secret;
}

function sign(message: string, secret: string): string {
  return createHmac('sha256', secret).update(message).digest('base64url');
}

/**
 * Encode a typed challenge token. Payload is JSON-serialized, base64url-encoded,
 * and HMAC-tagged together with `type` and an absolute expiry (unix seconds).
 */
export function encodeChallenge<T extends Record<string, unknown> = Record<string, unknown>>(
  type: string,
  payload: T,
  options: { ttlSeconds?: number; secret?: string; now?: number } = {},
): string {
  const ttl = options.ttlSeconds ?? 5 * 60; // 5 minutes default
  const now = options.now ?? Math.floor(Date.now() / 1000);
  const exp = now + ttl;
  const secret = options.secret ?? getSecret();
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const message = `${type}.${payloadB64}.${exp}`;
  return `${message}.${sign(message, secret)}`;
}

/**
 * Decode and verify a typed challenge token. Returns the payload object on
 * success, or null if the signature is invalid, the type doesn't match, or
 * the expiry has passed.
 */
export function decodeChallenge<T extends Record<string, unknown> = Record<string, unknown>>(
  type: string,
  token: string,
  options: { secret?: string; now?: number } = {},
): T | null {
  const parts = token.split('.');
  if (parts.length !== 4) return null;
  const [actualType, payloadB64, expStr, sig] = parts as [string, string, string, string];
  if (actualType !== type) return null;
  const secret = options.secret ?? getSecret();
  const message = `${actualType}.${payloadB64}.${expStr}`;
  const expected = sign(message, secret);
  if (sig.length !== expected.length) return null;
  let a: Buffer;
  let b: Buffer;
  try {
    a = Buffer.from(sig, 'base64url');
    b = Buffer.from(expected, 'base64url');
  } catch {
    return null;
  }
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const now = options.now ?? Math.floor(Date.now() / 1000);
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp <= now) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  return parsed as T;
}

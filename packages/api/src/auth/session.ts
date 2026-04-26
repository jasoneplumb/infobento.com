/**
 * Intent: HMAC-signed session cookie carrying { account_id, exp }.
 * Context: Issue #73 — session is decoupled from credential type so users can
 *   add/remove passkeys or OAuth identities without re-auth.
 * Crypto: HMAC-SHA256 over `${payload_b64url}.${exp}` with SESSION_SECRET.
 *   Token format: `${account_id}.${exp}.${sig}` (all base64url).
 *   Constant-time comparison via timingSafeEqual.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Context } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';

export const SESSION_COOKIE_NAME = 'ib_session';
export const SESSION_TTL_DAYS = 90;

export interface SessionPayload {
  readonly accountId: string;
  readonly exp: number; // unix seconds
}

function b64urlEncode(input: string | Buffer): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
  return buf.toString('base64url');
}

function b64urlDecode(input: string): Buffer {
  return Buffer.from(input, 'base64url');
}

function getSecret(): string {
  const secret = process.env['SESSION_SECRET'];
  if (!secret || secret.length < 16) {
    throw new Error(
      'SESSION_SECRET environment variable must be set to a value of at least 16 characters',
    );
  }
  return secret;
}

function sign(message: string, secret: string): string {
  return createHmac('sha256', secret).update(message).digest('base64url');
}

/** Sign a session token. Pure given (payload, secret, now). */
export function signSession(
  payload: { accountId: string; ttlSeconds?: number },
  options: { secret?: string; now?: number } = {},
): string {
  const secret = options.secret ?? getSecret();
  const now = options.now ?? Math.floor(Date.now() / 1000);
  const ttl = payload.ttlSeconds ?? SESSION_TTL_DAYS * 24 * 60 * 60;
  const exp = now + ttl;
  const accountB64 = b64urlEncode(payload.accountId);
  const message = `${accountB64}.${exp}`;
  const sig = sign(message, secret);
  return `${message}.${sig}`;
}

/** Verify a session token. Returns the payload if valid + unexpired, null otherwise. */
export function verifySession(
  token: string,
  options: { secret?: string; now?: number } = {},
): SessionPayload | null {
  const secret = options.secret ?? getSecret();
  const now = options.now ?? Math.floor(Date.now() / 1000);
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [accountB64, expStr, sig] = parts as [string, string, string];
  const message = `${accountB64}.${expStr}`;
  const expected = sign(message, secret);
  // Lengths must match before timingSafeEqual.
  if (sig.length !== expected.length) return null;
  let sigBuf: Buffer;
  let expectedBuf: Buffer;
  try {
    sigBuf = b64urlDecode(sig);
    expectedBuf = b64urlDecode(expected);
  } catch {
    return null;
  }
  if (sigBuf.length !== expectedBuf.length) return null;
  if (!timingSafeEqual(sigBuf, expectedBuf)) return null;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp <= now) return null;
  let accountId: string;
  try {
    accountId = b64urlDecode(accountB64).toString('utf8');
  } catch {
    return null;
  }
  if (!accountId) return null;
  return { accountId, exp };
}

/** Read session payload from the request cookies. */
export function readSession(c: Context): SessionPayload | null {
  const token = getCookie(c, SESSION_COOKIE_NAME);
  if (!token) return null;
  try {
    return verifySession(token);
  } catch {
    // Misconfigured SESSION_SECRET — treat as no session rather than crashing.
    return null;
  }
}

/** Issue a session cookie for the given account. */
export function issueSessionCookie(c: Context, accountId: string): void {
  const token = signSession({ accountId });
  setCookie(c, SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: process.env['NODE_ENV'] === 'production',
    path: '/',
    maxAge: SESSION_TTL_DAYS * 24 * 60 * 60,
  });
}

/** Clear the session cookie. */
export function clearSessionCookie(c: Context): void {
  deleteCookie(c, SESSION_COOKIE_NAME, { path: '/' });
}

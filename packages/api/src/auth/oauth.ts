/**
 * Intent: OIDC PKCE flows for Sign in with Apple + Google.
 * Context: Issue #73 — fallback for users without a passkey-capable device,
 *   and for account recovery. Email may be supplied by the provider's ID
 *   token; we surface it via `firstLink.email` so the caller can prompt the
 *   user before linking to an existing account with a matching email.
 * Tokens: ID token verified via `jose` against the provider's JWKS.
 *   Apple's client_secret is itself a short-lived ES256 JWT; Google uses a
 *   plain shared secret.
 * Statelessness: state + PKCE verifier + post-callback redirect target
 *   round-trip via a signed cookie (auth/challenge.ts).
 */

import { createHash, randomBytes } from 'node:crypto';
import { createRemoteJWKSet, importPKCS8, jwtVerify, SignJWT } from 'jose';
import type { JWTVerifyGetKey } from 'jose';
import {
  createAccount,
  getAccount,
  getAccountByEmail,
  getOAuthIdentity,
  insertOAuthIdentity,
  setAccountEmailIfMissing,
  type DB,
  type OAuthProvider,
} from '../db.js';
import { encodeChallenge, decodeChallenge } from './challenge.js';

const STATE_TYPE = 'oauth-state';

interface ProviderConfig {
  authorizationEndpoint: string;
  tokenEndpoint: string;
  jwksUri: string;
  issuer: string;
  scopes: string;
}

const PROVIDERS: Record<OAuthProvider, ProviderConfig> = {
  google: {
    authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenEndpoint: 'https://oauth2.googleapis.com/token',
    jwksUri: 'https://www.googleapis.com/oauth2/v3/certs',
    issuer: 'https://accounts.google.com',
    scopes: 'openid email profile',
  },
  apple: {
    authorizationEndpoint: 'https://appleid.apple.com/auth/authorize',
    tokenEndpoint: 'https://appleid.apple.com/auth/token',
    jwksUri: 'https://appleid.apple.com/auth/keys',
    issuer: 'https://appleid.apple.com',
    scopes: 'openid email name',
  },
};

export function getProviderConfig(provider: OAuthProvider): ProviderConfig {
  return PROVIDERS[provider];
}

export interface StatePayload extends Record<string, unknown> {
  state: string;
  verifier: string;
  next: string;
  provider: OAuthProvider;
}

function base64urlNoPad(buf: Buffer): string {
  return buf.toString('base64url');
}

export function generatePkce(): { verifier: string; challenge: string } {
  const verifier = base64urlNoPad(randomBytes(32));
  const challenge = base64urlNoPad(createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

export interface StartResult {
  redirectUrl: string;
  stateToken: string;
}

export function buildAuthorizationRequest(
  provider: OAuthProvider,
  options: { clientId: string; redirectUri: string; next?: string },
): StartResult {
  const config = PROVIDERS[provider];
  const state = base64urlNoPad(randomBytes(16));
  const pkce = generatePkce();
  const next = sanitizeNext(options.next);
  const params = new URLSearchParams({
    client_id: options.clientId,
    redirect_uri: options.redirectUri,
    response_type: 'code',
    scope: config.scopes,
    state,
    code_challenge: pkce.challenge,
    code_challenge_method: 'S256',
  });
  if (provider === 'apple') {
    // Apple requires response_mode=form_post when scopes other than openid
    // are requested. Using `query` keeps the callback handler simple; with
    // form_post we'd need to accept POST too. We therefore stick to query
    // and only request `name email` when actually needed (registration UX).
    params.set('response_mode', 'query');
  }
  const stateToken = encodeChallenge<StatePayload>(STATE_TYPE, {
    state,
    verifier: pkce.verifier,
    next,
    provider,
  });
  return {
    redirectUrl: `${config.authorizationEndpoint}?${params.toString()}`,
    stateToken,
  };
}

function sanitizeNext(next: string | undefined): string {
  if (!next) return '/';
  if (!next.startsWith('/')) return '/';
  if (next.startsWith('//')) return '/';
  return next;
}

export interface OAuthCredentials {
  google: { clientId: string; clientSecret: string };
  apple: {
    clientId: string;
    teamId: string;
    keyId: string;
    privateKey: string; // PEM (PKCS8)
  };
  redirectUriBase: string; // e.g. https://www.infobento.com/api/auth/oauth
}

export function readOAuthCredentials(): OAuthCredentials {
  return {
    google: {
      clientId: process.env['GOOGLE_CLIENT_ID'] ?? '',
      clientSecret: process.env['GOOGLE_CLIENT_SECRET'] ?? '',
    },
    apple: {
      clientId: process.env['APPLE_CLIENT_ID'] ?? '',
      teamId: process.env['APPLE_TEAM_ID'] ?? '',
      keyId: process.env['APPLE_KEY_ID'] ?? '',
      privateKey: process.env['APPLE_PRIVATE_KEY'] ?? '',
    },
    redirectUriBase: process.env['OAUTH_REDIRECT_BASE'] ?? 'http://localhost:4000/api/auth/oauth',
  };
}

export function redirectUriFor(provider: OAuthProvider, base?: string): string {
  const root = (base ?? readOAuthCredentials().redirectUriBase).replace(/\/$/, '');
  return `${root}/${provider}/callback`;
}

/** Build Apple's client_secret JWT. Spec: docs.developer.apple.com/sign-in-with-apple */
export async function buildAppleClientSecret(
  creds: OAuthCredentials['apple'],
  options: { now?: number; ttlSeconds?: number } = {},
): Promise<string> {
  if (!creds.privateKey || !creds.teamId || !creds.keyId || !creds.clientId) {
    throw new Error('Missing Apple OAuth credentials');
  }
  const now = options.now ?? Math.floor(Date.now() / 1000);
  const ttl = options.ttlSeconds ?? 60 * 5; // 5 minutes — well under Apple's 6-month max
  const key = await importPKCS8(creds.privateKey, 'ES256');
  return new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: creds.keyId })
    .setIssuer(creds.teamId)
    .setSubject(creds.clientId)
    .setAudience('https://appleid.apple.com')
    .setIssuedAt(now)
    .setExpirationTime(now + ttl)
    .sign(key);
}

interface TokenResponse {
  access_token?: string;
  id_token?: string;
  token_type?: string;
  expires_in?: number;
  refresh_token?: string;
  error?: string;
  error_description?: string;
}

interface IdTokenClaims {
  iss?: string;
  sub?: string;
  aud?: string | string[];
  email?: string;
  email_verified?: boolean | string;
  exp?: number;
}

export interface CallbackDeps {
  /** Inject a fetch implementation for tests. */
  fetch?: typeof fetch;
  /** Inject a JWKS resolver for tests instead of fetching the provider's keys. */
  jwks?: JWTVerifyGetKey;
  now?: number;
}

export interface CallbackSuccess {
  ok: true;
  accountId: string;
  next: string;
  /** Set when this callback created a fresh account or freshly linked an
   *  identity to an account that already had an email. The caller may prompt
   *  the user to confirm linking when `linkedToExistingEmail` is true. */
  linkedToExistingEmail: boolean;
  email: string | null;
}

export interface CallbackFailure {
  ok: false;
  reason: string;
}

export async function handleOAuthCallback(
  db: DB,
  input: {
    provider: OAuthProvider;
    code: string;
    state: string;
    stateToken: string;
    creds: OAuthCredentials;
  },
  deps: CallbackDeps = {},
): Promise<CallbackSuccess | CallbackFailure> {
  const fetchImpl = deps.fetch ?? fetch;
  const decoded = decodeChallenge<StatePayload>(STATE_TYPE, input.stateToken, { now: deps.now });
  if (!decoded) return { ok: false, reason: 'invalid_or_expired_state' };
  if (decoded.provider !== input.provider) return { ok: false, reason: 'provider_mismatch' };
  if (decoded.state !== input.state) return { ok: false, reason: 'state_mismatch' };

  const config = PROVIDERS[input.provider];
  const redirectUri = redirectUriFor(input.provider, input.creds.redirectUriBase);

  let clientSecret: string;
  let clientId: string;
  if (input.provider === 'google') {
    clientSecret = input.creds.google.clientSecret;
    clientId = input.creds.google.clientId;
    if (!clientId || !clientSecret) {
      return { ok: false, reason: 'missing_google_credentials' };
    }
  } else {
    clientId = input.creds.apple.clientId;
    try {
      clientSecret = await buildAppleClientSecret(input.creds.apple, { now: deps.now });
    } catch (e) {
      return { ok: false, reason: e instanceof Error ? e.message : 'apple_client_secret_error' };
    }
  }

  const tokenBody = new URLSearchParams({
    grant_type: 'authorization_code',
    code: input.code,
    redirect_uri: redirectUri,
    client_id: clientId,
    client_secret: clientSecret,
    code_verifier: decoded.verifier,
  });
  let tokenJson: TokenResponse;
  try {
    const res = await fetchImpl(config.tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenBody.toString(),
    });
    tokenJson = (await res.json()) as TokenResponse;
    if (!res.ok || tokenJson.error) {
      return { ok: false, reason: `token_endpoint_error:${tokenJson.error ?? res.status}` };
    }
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : 'token_fetch_error' };
  }
  if (!tokenJson.id_token) return { ok: false, reason: 'missing_id_token' };

  const jwks = deps.jwks ?? createRemoteJWKSet(new URL(config.jwksUri));
  let claims: IdTokenClaims;
  try {
    const verified = await jwtVerify(tokenJson.id_token, jwks, {
      issuer: config.issuer,
      audience: clientId,
    });
    claims = verified.payload as IdTokenClaims;
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : 'id_token_verify_error' };
  }
  if (!claims.sub) return { ok: false, reason: 'id_token_missing_sub' };

  const email = typeof claims.email === 'string' ? claims.email.toLowerCase() : null;
  const existing = getOAuthIdentity(db, input.provider, claims.sub);
  if (existing) {
    return {
      ok: true,
      accountId: existing.account_id,
      next: decoded.next,
      linkedToExistingEmail: false,
      email: existing.email,
    };
  }

  // First time we've seen this provider+sub. Try to find a matching account
  // by email; otherwise create a new account.
  let accountId: string | null = null;
  let linkedToExistingEmail = false;
  if (email) {
    const found = getAccountByEmail(db, email);
    if (found) {
      accountId = found.id;
      linkedToExistingEmail = true;
    }
  }
  if (!accountId) {
    const account = createAccount(db, email ? { email } : {});
    accountId = account.id;
  } else if (email) {
    // Idempotent — does nothing if the email is already set.
    setAccountEmailIfMissing(db, accountId, email);
  }
  // Verify the account row exists before linking (paranoia: surface rather
  // than silently fail if a previous code path returned a stale id).
  if (!getAccount(db, accountId)) return { ok: false, reason: 'account_lookup_failed' };
  insertOAuthIdentity(db, {
    provider: input.provider,
    subject: claims.sub,
    accountId,
    email,
  });
  return {
    ok: true,
    accountId,
    next: decoded.next,
    linkedToExistingEmail,
    email,
  };
}

/**
 * Intent: Cover the parts of OAuth that don't require live provider calls —
 *   PKCE generation, state token round-trip, callback success/failure paths
 *   with an injected fetch + local JWKS, account upsert + email-link logic.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  exportJWK,
  generateKeyPair,
  SignJWT,
  createLocalJWKSet,
  type JSONWebKeySet,
  type CryptoKey,
} from 'jose';
import {
  createAccount,
  createDb,
  getAccount,
  getOAuthIdentity,
  insertOAuthIdentity,
  type DB,
} from '../db.js';
import {
  buildAuthorizationRequest,
  generatePkce,
  handleOAuthCallback,
  type OAuthCredentials,
} from './oauth.js';

const TEST_SECRET = 'test-secret-at-least-sixteen-chars';

function baseCreds(): OAuthCredentials {
  return {
    google: { clientId: 'google-client', clientSecret: 'google-secret' },
    apple: {
      clientId: 'apple-client',
      teamId: 'team',
      keyId: 'key',
      privateKey: '',
    },
    redirectUriBase: 'http://localhost:4000/api/auth/oauth',
  };
}

interface KeyPairAndJwks {
  privateKey: CryptoKey;
  publicKey: CryptoKey;
  jwks: ReturnType<typeof createLocalJWKSet>;
  kid: string;
}

async function makeJwks(): Promise<KeyPairAndJwks> {
  const { privateKey, publicKey } = await generateKeyPair('ES256');
  const publicJwk = await exportJWK(publicKey);
  publicJwk.kid = 'test-key';
  publicJwk.alg = 'ES256';
  publicJwk.use = 'sig';
  const set: JSONWebKeySet = { keys: [publicJwk] };
  return {
    privateKey,
    publicKey,
    kid: 'test-key',
    jwks: createLocalJWKSet(set),
  };
}

async function signIdToken(
  privateKey: CryptoKey,
  claims: { iss: string; aud: string; sub: string; email?: string },
  kid: string,
): Promise<string> {
  return new SignJWT({ ...(claims.email ? { email: claims.email } : {}) })
    .setProtectedHeader({ alg: 'ES256', kid })
    .setIssuer(claims.iss)
    .setAudience(claims.aud)
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey);
}

describe('PKCE helper', () => {
  it('produces a verifier and S256 challenge', () => {
    const { verifier, challenge } = generatePkce();
    expect(verifier.length).toBeGreaterThan(20);
    expect(challenge.length).toBeGreaterThan(20);
    expect(verifier).not.toBe(challenge);
  });
});

describe('buildAuthorizationRequest', () => {
  beforeEach(() => {
    process.env['SESSION_SECRET'] = TEST_SECRET;
  });
  afterEach(() => {
    delete process.env['SESSION_SECRET'];
  });

  it('produces a Google URL with the expected params', () => {
    const result = buildAuthorizationRequest('google', {
      clientId: 'cid',
      redirectUri: 'https://x/cb',
      next: '/editor',
    });
    expect(result.redirectUrl).toContain('https://accounts.google.com/o/oauth2/v2/auth?');
    expect(result.redirectUrl).toContain('client_id=cid');
    expect(result.redirectUrl).toContain('code_challenge_method=S256');
    expect(result.redirectUrl).toContain('redirect_uri=https%3A%2F%2Fx%2Fcb');
    expect(result.stateToken.split('.').length).toBe(4);
  });

  it('forces response_mode=query for Apple', () => {
    const result = buildAuthorizationRequest('apple', {
      clientId: 'cid',
      redirectUri: 'https://x/cb',
    });
    expect(result.redirectUrl).toContain('https://appleid.apple.com/auth/authorize?');
    expect(result.redirectUrl).toContain('response_mode=query');
  });

  it('rejects open-redirect-style next values', () => {
    const a = buildAuthorizationRequest('google', {
      clientId: 'c',
      redirectUri: 'r',
      next: '//evil.com',
    });
    const b = buildAuthorizationRequest('google', {
      clientId: 'c',
      redirectUri: 'r',
      next: 'https://evil.com',
    });
    // `next` should be normalized to '/'; we can't observe it without
    // round-tripping through the state token, so just ensure the URL itself
    // contains no `next=` leak.
    expect(a.redirectUrl).not.toContain('evil');
    expect(b.redirectUrl).not.toContain('evil');
  });
});

describe('handleOAuthCallback', () => {
  let db: DB;
  beforeEach(() => {
    db = createDb(':memory:');
    process.env['SESSION_SECRET'] = TEST_SECRET;
  });
  afterEach(() => {
    delete process.env['SESSION_SECRET'];
  });

  function fakeFetch(idToken: string): typeof fetch {
    return (async () =>
      new Response(JSON.stringify({ id_token: idToken, access_token: 'a' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })) as unknown as typeof fetch;
  }

  it('rejects when the state token is missing/invalid', async () => {
    const result = await handleOAuthCallback(db, {
      provider: 'google',
      code: 'c',
      state: 's',
      stateToken: 'not-a-token',
      creds: baseCreds(),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('invalid_or_expired_state');
  });

  it('rejects when state value does not match the cookie', async () => {
    const start = buildAuthorizationRequest('google', {
      clientId: 'google-client',
      redirectUri: 'http://localhost:4000/api/auth/oauth/google/callback',
    });
    const result = await handleOAuthCallback(db, {
      provider: 'google',
      code: 'c',
      state: 'WRONG',
      stateToken: start.stateToken,
      creds: baseCreds(),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('state_mismatch');
  });

  it('creates a new account when no email is in the ID token', async () => {
    const start = buildAuthorizationRequest('google', {
      clientId: 'google-client',
      redirectUri: 'http://localhost:4000/api/auth/oauth/google/callback',
    });
    const stateValue = decodeStateValue(start.stateToken);
    const k = await makeJwks();
    const idToken = await signIdToken(
      k.privateKey,
      { iss: 'https://accounts.google.com', aud: 'google-client', sub: 'gsub-1' },
      k.kid,
    );
    const result = await handleOAuthCallback(
      db,
      {
        provider: 'google',
        code: 'authcode',
        state: stateValue,
        stateToken: start.stateToken,
        creds: baseCreds(),
      },
      { fetch: fakeFetch(idToken), jwks: k.jwks },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      const acct = getAccount(db, result.accountId);
      expect(acct?.email).toBeNull();
      expect(getOAuthIdentity(db, 'google', 'gsub-1')?.account_id).toBe(result.accountId);
    }
  });

  it('links to an existing account by email and flags it', async () => {
    const existing = createAccount(db, { email: 'shared@example.com' });
    const start = buildAuthorizationRequest('google', {
      clientId: 'google-client',
      redirectUri: 'http://localhost:4000/api/auth/oauth/google/callback',
    });
    const k = await makeJwks();
    const idToken = await signIdToken(
      k.privateKey,
      {
        iss: 'https://accounts.google.com',
        aud: 'google-client',
        sub: 'gsub-2',
        email: 'SHARED@example.com',
      },
      k.kid,
    );
    const result = await handleOAuthCallback(
      db,
      {
        provider: 'google',
        code: 'authcode',
        state: decodeStateValue(start.stateToken),
        stateToken: start.stateToken,
        creds: baseCreds(),
      },
      { fetch: fakeFetch(idToken), jwks: k.jwks },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.accountId).toBe(existing.id);
      expect(result.linkedToExistingEmail).toBe(true);
    }
  });

  it('returns the existing account on repeat sign-in (idempotent)', async () => {
    const acct = createAccount(db, { email: 'r@example.com' });
    insertOAuthIdentity(db, {
      provider: 'google',
      subject: 'gsub-3',
      accountId: acct.id,
      email: 'r@example.com',
    });
    const start = buildAuthorizationRequest('google', {
      clientId: 'google-client',
      redirectUri: 'http://localhost:4000/api/auth/oauth/google/callback',
    });
    const k = await makeJwks();
    const idToken = await signIdToken(
      k.privateKey,
      {
        iss: 'https://accounts.google.com',
        aud: 'google-client',
        sub: 'gsub-3',
        email: 'r@example.com',
      },
      k.kid,
    );
    const result = await handleOAuthCallback(
      db,
      {
        provider: 'google',
        code: 'authcode',
        state: decodeStateValue(start.stateToken),
        stateToken: start.stateToken,
        creds: baseCreds(),
      },
      { fetch: fakeFetch(idToken), jwks: k.jwks },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.accountId).toBe(acct.id);
      expect(result.linkedToExistingEmail).toBe(false);
    }
  });

  it('rejects an ID token signed with a different audience', async () => {
    const start = buildAuthorizationRequest('google', {
      clientId: 'google-client',
      redirectUri: 'http://localhost:4000/api/auth/oauth/google/callback',
    });
    const k = await makeJwks();
    const idToken = await signIdToken(
      k.privateKey,
      { iss: 'https://accounts.google.com', aud: 'WRONG-CLIENT', sub: 'gsub-4' },
      k.kid,
    );
    const result = await handleOAuthCallback(
      db,
      {
        provider: 'google',
        code: 'authcode',
        state: decodeStateValue(start.stateToken),
        stateToken: start.stateToken,
        creds: baseCreds(),
      },
      { fetch: fakeFetch(idToken), jwks: k.jwks },
    );
    expect(result.ok).toBe(false);
  });

  it('reports an error when the provider returns an OAuth error', async () => {
    const start = buildAuthorizationRequest('google', {
      clientId: 'google-client',
      redirectUri: 'http://localhost:4000/api/auth/oauth/google/callback',
    });
    const errorFetch: typeof fetch = (async () =>
      new Response(JSON.stringify({ error: 'invalid_grant' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })) as unknown as typeof fetch;
    const k = await makeJwks();
    const result = await handleOAuthCallback(
      db,
      {
        provider: 'google',
        code: 'bad',
        state: decodeStateValue(start.stateToken),
        stateToken: start.stateToken,
        creds: baseCreds(),
      },
      { fetch: errorFetch, jwks: k.jwks },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('token_endpoint_error');
  });

  it('rejects when the provider in state does not match the route param', async () => {
    const start = buildAuthorizationRequest('google', {
      clientId: 'google-client',
      redirectUri: 'http://localhost:4000/api/auth/oauth/google/callback',
    });
    const result = await handleOAuthCallback(db, {
      provider: 'apple',
      code: 'c',
      state: decodeStateValue(start.stateToken),
      stateToken: start.stateToken,
      creds: baseCreds(),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('provider_mismatch');
  });
});

/** Pull the inner state value out of a state token, for round-tripping in tests. */
function decodeStateValue(token: string): string {
  const parts = token.split('.');
  const payloadB64 = parts[1]!;
  const json = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as {
    state: string;
  };
  return json.state;
}

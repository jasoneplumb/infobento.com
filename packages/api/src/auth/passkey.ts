/**
 * Intent: WebAuthn passkey registration + authentication ceremonies.
 * Context: Issue #73 — passkeys are the primary credential. Built on
 *   @simplewebauthn/server for COSE/CBOR parsing, attestation verification,
 *   and assertion validation.
 * Statelessness: the per-ceremony challenge is round-tripped via a short-lived
 *   signed cookie (`auth/challenge.ts`) rather than a server-side store.
 * RP config: RP_ID and RP_ORIGIN env vars; defaults are dev-friendly. RP_ORIGIN
 *   may be a comma-separated list to permit multiple origins (e.g. dev + prod).
 */

import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/server';
import {
  insertPasskey,
  getPasskey,
  getPasskeysForAccount,
  updatePasskeySignCount,
  getAccount,
  type DB,
} from '../db.js';
import { encodeChallenge, decodeChallenge } from './challenge.js';

const REGISTRATION_TYPE = 'webauthn-reg';
const AUTHENTICATION_TYPE = 'webauthn-auth';

interface RegChallengePayload extends Record<string, unknown> {
  challenge: string;
  accountId: string;
}
interface AuthChallengePayload extends Record<string, unknown> {
  challenge: string;
}

export interface PasskeyConfig {
  rpName: string;
  rpID: string;
  origins: readonly string[];
}

export function getPasskeyConfig(): PasskeyConfig {
  const rpID = process.env['RP_ID'] ?? 'localhost';
  const rpName = process.env['RP_NAME'] ?? 'InfoBento';
  const originEnv = process.env['RP_ORIGIN'] ?? 'http://localhost:5173';
  const origins = originEnv
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return { rpName, rpID, origins };
}

export interface RegistrationOptionsResult {
  options: PublicKeyCredentialCreationOptionsJSON;
  challengeToken: string;
}

export async function createRegistrationOptions(
  db: DB,
  accountId: string,
): Promise<RegistrationOptionsResult> {
  const config = getPasskeyConfig();
  const account = getAccount(db, accountId);
  if (!account) throw new Error('Account not found');
  const existing = getPasskeysForAccount(db, accountId);
  const options = await generateRegistrationOptions({
    rpName: config.rpName,
    rpID: config.rpID,
    userName: account.email ?? account.id,
    userDisplayName: account.display_name ?? account.email ?? '',
    attestationType: 'none',
    excludeCredentials: existing.map((c) => ({
      id: c.credential_id,
      transports: parseTransports(c.transports),
    })),
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
    },
  });
  const challengeToken = encodeChallenge<RegChallengePayload>(REGISTRATION_TYPE, {
    challenge: options.challenge,
    accountId,
  });
  return { options, challengeToken };
}

export interface VerifyRegistrationResult {
  ok: true;
  credentialId: string;
  accountId: string;
}
export interface VerifyRegistrationFailure {
  ok: false;
  reason: string;
}

export async function verifyRegistration(
  db: DB,
  input: { credential: RegistrationResponseJSON; challengeToken: string },
): Promise<VerifyRegistrationResult | VerifyRegistrationFailure> {
  const config = getPasskeyConfig();
  const decoded = decodeChallenge<RegChallengePayload>(REGISTRATION_TYPE, input.challengeToken);
  if (!decoded) return { ok: false, reason: 'invalid_or_expired_challenge' };
  const account = getAccount(db, decoded.accountId);
  if (!account) return { ok: false, reason: 'account_not_found' };
  let result;
  try {
    result = await verifyRegistrationResponse({
      response: input.credential,
      expectedChallenge: decoded.challenge,
      expectedOrigin: [...config.origins],
      expectedRPID: config.rpID,
    });
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : 'verification_error' };
  }
  if (!result.verified || !result.registrationInfo) {
    return { ok: false, reason: 'unverified' };
  }
  const { credential } = result.registrationInfo;
  // `credential.id` is already base64url-encoded by @simplewebauthn/server.
  insertPasskey(db, {
    credentialId: credential.id,
    accountId: decoded.accountId,
    publicKey: credential.publicKey,
    signCount: credential.counter,
    transports: credential.transports,
  });
  return { ok: true, credentialId: credential.id, accountId: decoded.accountId };
}

export interface AuthenticationOptionsResult {
  options: PublicKeyCredentialRequestOptionsJSON;
  challengeToken: string;
}

export async function createAuthenticationOptions(_db: DB): Promise<AuthenticationOptionsResult> {
  const config = getPasskeyConfig();
  const options = await generateAuthenticationOptions({
    rpID: config.rpID,
    userVerification: 'preferred',
    // Discoverable credentials: empty allow-list lets the user pick.
  });
  const challengeToken = encodeChallenge<AuthChallengePayload>(AUTHENTICATION_TYPE, {
    challenge: options.challenge,
  });
  return { options, challengeToken };
}

export interface VerifyAuthenticationResult {
  ok: true;
  accountId: string;
  credentialId: string;
}
export interface VerifyAuthenticationFailure {
  ok: false;
  reason: string;
}

export async function verifyAuthentication(
  db: DB,
  input: { assertion: AuthenticationResponseJSON; challengeToken: string },
): Promise<VerifyAuthenticationResult | VerifyAuthenticationFailure> {
  const config = getPasskeyConfig();
  const decoded = decodeChallenge<AuthChallengePayload>(AUTHENTICATION_TYPE, input.challengeToken);
  if (!decoded) return { ok: false, reason: 'invalid_or_expired_challenge' };
  const stored = getPasskey(db, input.assertion.id);
  if (!stored) return { ok: false, reason: 'unknown_credential' };
  let result;
  try {
    result = await verifyAuthenticationResponse({
      response: input.assertion,
      expectedChallenge: decoded.challenge,
      expectedOrigin: [...config.origins],
      expectedRPID: config.rpID,
      credential: {
        id: stored.credential_id,
        // Fresh-copy via slice() to satisfy the Uint8Array<ArrayBuffer>
        // refinement that @simplewebauthn/server uses (Uint8Array_).
        publicKey: stored.public_key.slice(),
        counter: stored.sign_count,
        transports: parseTransports(stored.transports),
      },
    });
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : 'verification_error' };
  }
  if (!result.verified) return { ok: false, reason: 'unverified' };
  const newCounter = result.authenticationInfo.newCounter;
  // updatePasskeySignCount rejects non-increasing counters (replay defense).
  // If the authenticator always reports 0, the helper still updates last_used_at
  // (the WHERE clause permits sign_count = 0 → 0 transitions).
  const updated = updatePasskeySignCount(db, stored.credential_id, newCounter);
  if (!updated && newCounter !== 0) {
    return { ok: false, reason: 'sign_count_replay' };
  }
  return { ok: true, accountId: stored.account_id, credentialId: stored.credential_id };
}

function parseTransports(
  raw: string | null,
): import('@simplewebauthn/server').AuthenticatorTransportFuture[] | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed as import('@simplewebauthn/server').AuthenticatorTransportFuture[];
    }
  } catch {
    return undefined;
  }
  return undefined;
}

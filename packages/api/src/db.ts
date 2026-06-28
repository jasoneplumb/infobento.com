/**
 * Intent: SQLite storage layer for the SaaS hosting tier.
 * Context: Round 12 Q5 / epic #77 — multi-tenant configs hosted on infobento.com.
 * Design: single SQLite file at /var/lib/infobento/data.db (override via
 *   INFOBENTO_DB_PATH env var). Schema accommodates passkey + OAuth auth (#73)
 *   without future migration: accounts use surrogate id with email as a
 *   nullable contact field.
 */

import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { DEFAULT_REFRESHES_PER_DAY, MAX_REFRESHES_PER_DAY } from '@infobento/core';

export type DB = Database.Database;

export interface Account {
  readonly id: string;
  readonly email: string | null;
  readonly display_name: string | null;
  readonly created_at: number;
}

export interface Device {
  readonly id: string;
  readonly pair_code: string;
  readonly owner_account_id: string | null;
  readonly config_json: string | null;
  readonly paired_at: number | null;
  readonly last_modified: number;
  /**
   * Web-side "forget Wi-Fi" command (issue #39). 1 = the owner asked the device
   * to clear its Wi-Fi credentials and re-enter captive-portal AP mode. The
   * server can't push to the device, so this is a pending flag the firmware
   * picks up on its next pull (X-Device-Forget header) and clears on delivery.
   */
  readonly forget_pending: number;
  /**
   * Device refresh cadence (scheduled data refreshes per day, `0..5760`),
   * denormalized from the config's `refreshesPerDay` on every `setConfig`. Kept
   * on the row so the pull-time `effectiveLastModified` bucket (RFC 0001 §4) and
   * the `X-Refresh-Interval` wake hint are computable before parsing
   * `config_json`, preserving the cheap pre-parse 304 path.
   */
  readonly refreshes_per_day: number;
}

export interface PasskeyCredential {
  readonly credential_id: string;
  readonly account_id: string;
  readonly public_key: Uint8Array;
  readonly sign_count: number;
  readonly transports: string | null;
  readonly created_at: number;
  readonly last_used_at: number | null;
}

export type OAuthProvider = 'apple' | 'google';

export interface OAuthIdentity {
  readonly provider: OAuthProvider;
  readonly subject: string;
  readonly account_id: string;
  readonly email: string | null;
  readonly created_at: number;
}

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS accounts (
    id           TEXT PRIMARY KEY,
    email        TEXT,
    display_name TEXT,
    created_at   INTEGER NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS accounts_email_idx
    ON accounts(email) WHERE email IS NOT NULL;

  CREATE TABLE IF NOT EXISTS devices (
    id               TEXT PRIMARY KEY,
    pair_code        TEXT NOT NULL UNIQUE,
    owner_account_id TEXT REFERENCES accounts(id),
    config_json      TEXT,
    paired_at        INTEGER,
    last_modified    INTEGER NOT NULL,
    forget_pending   INTEGER NOT NULL DEFAULT 0,
    refreshes_per_day INTEGER NOT NULL DEFAULT 3
  );

  CREATE TABLE IF NOT EXISTS passkey_credentials (
    credential_id  TEXT PRIMARY KEY,
    account_id     TEXT NOT NULL REFERENCES accounts(id),
    public_key     BLOB NOT NULL,
    sign_count     INTEGER NOT NULL,
    transports     TEXT,
    created_at     INTEGER NOT NULL,
    last_used_at   INTEGER
  );
  CREATE INDEX IF NOT EXISTS passkey_credentials_account_idx
    ON passkey_credentials(account_id);

  CREATE TABLE IF NOT EXISTS oauth_identities (
    provider     TEXT NOT NULL CHECK (provider IN ('apple','google')),
    subject      TEXT NOT NULL,
    account_id   TEXT NOT NULL REFERENCES accounts(id),
    email        TEXT,
    created_at   INTEGER NOT NULL,
    PRIMARY KEY (provider, subject)
  );
  CREATE INDEX IF NOT EXISTS oauth_identities_account_idx
    ON oauth_identities(account_id);
`;

/**
 * Open a database at `path`, apply the schema, return the handle.
 * Use ':memory:' for tests.
 */
export function createDb(path: string): DB {
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  runMigrations(db);
  return db;
}

/**
 * Additive, idempotent migrations for databases created before a column existed.
 * `CREATE TABLE IF NOT EXISTS` only seeds the schema for a *fresh* file, so a
 * pre-existing `devices` table won't gain new columns without an explicit
 * `ALTER TABLE`. SQLite's `ADD COLUMN ... DEFAULT` backfills existing rows.
 */
function runMigrations(db: DB): void {
  ensureColumn(db, 'devices', 'forget_pending', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn(db, 'devices', 'refreshes_per_day', 'INTEGER NOT NULL DEFAULT 3');
}

/**
 * Add `column` to `table` only if it isn't already present (safe to re-run).
 * All arguments MUST be static, trusted strings — they are interpolated directly
 * into SQL because SQLite's PRAGMA / DDL statements don't accept bound parameters.
 * Never pass user- or request-derived values here.
 */
function ensureColumn(db: DB, table: string, column: string, ddl: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
  }
}

let _singleton: DB | null = null;

/**
 * Lazily-initialized singleton DB at INFOBENTO_DB_PATH (default
 * /var/lib/infobento/data.db). Production code uses this; tests use createDb.
 */
export function getDb(): DB {
  if (_singleton) return _singleton;
  const path = process.env['INFOBENTO_DB_PATH'] ?? '/var/lib/infobento/data.db';
  _singleton = createDb(path);
  return _singleton;
}

/** Test-only helper to drop the singleton between test files. */
export function _resetSingletonForTesting(): void {
  if (_singleton) _singleton.close();
  _singleton = null;
}

// -- Accounts ---------------------------------------------------------------

export function createAccount(
  db: DB,
  input: { email?: string; displayName?: string } = {},
): Account {
  const id = randomUUID();
  const now = Date.now();
  db.prepare('INSERT INTO accounts (id, email, display_name, created_at) VALUES (?, ?, ?, ?)').run(
    id,
    input.email ?? null,
    input.displayName ?? null,
    now,
  );
  return {
    id,
    email: input.email ?? null,
    display_name: input.displayName ?? null,
    created_at: now,
  };
}

export function getAccount(db: DB, id: string): Account | null {
  const row = db.prepare('SELECT * FROM accounts WHERE id = ?').get(id) as Account | undefined;
  return row ?? null;
}

export function getAccountByEmail(db: DB, email: string): Account | null {
  const row = db.prepare('SELECT * FROM accounts WHERE email = ?').get(email) as
    Account | undefined;
  return row ?? null;
}

// -- Devices ----------------------------------------------------------------

/**
 * Manufacture-time helper: register a device with a pre-printed pair code.
 * In production this is called once per device (e.g. by a manufacturing
 * provisioning script). For tests, also useful as a fixture builder.
 */
export function createDevice(db: DB, input: { pairCode: string; id?: string }): Device {
  const id = input.id ?? randomUUID();
  const now = Date.now();
  db.prepare('INSERT INTO devices (id, pair_code, last_modified) VALUES (?, ?, ?)').run(
    id,
    input.pairCode,
    now,
  );
  return {
    id,
    pair_code: input.pairCode,
    owner_account_id: null,
    config_json: null,
    paired_at: null,
    last_modified: now,
    forget_pending: 0,
    refreshes_per_day: DEFAULT_REFRESHES_PER_DAY,
  };
}

export function getDevice(db: DB, id: string): Device | null {
  const row = db.prepare('SELECT * FROM devices WHERE id = ?').get(id) as Device | undefined;
  return row ?? null;
}

export function getDeviceByPairCode(db: DB, code: string): Device | null {
  const row = db.prepare('SELECT * FROM devices WHERE pair_code = ?').get(code) as
    Device | undefined;
  return row ?? null;
}

/**
 * Bind a device to an account via its pair code. Idempotent if the account
 * already owns the device. Returns null if the device is missing or owned by
 * a different account.
 */
export function claimDevice(db: DB, pairCode: string, accountId: string): Device | null {
  const now = Date.now();
  const result = db
    .prepare(
      `UPDATE devices
         SET owner_account_id = ?,
             paired_at        = COALESCE(paired_at, ?),
             last_modified    = ?
       WHERE pair_code = ?
         AND (owner_account_id IS NULL OR owner_account_id = ?)`,
    )
    .run(accountId, now, now, pairCode, accountId);
  if (result.changes === 0) return null;
  return getDeviceByPairCode(db, pairCode);
}

/**
 * Derive the denormalized refresh cadence from a config JSON string. A valid
 * value is an integer in `[0, MAX_REFRESHES_PER_DAY]`; anything else — including
 * unparseable JSON — falls back to the default, so the column never drifts to
 * NULL/garbage.
 */
function deriveRefreshesPerDay(configJson: string): number {
  try {
    const parsed = JSON.parse(configJson) as { refreshesPerDay?: unknown };
    const n = parsed.refreshesPerDay;
    if (typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= MAX_REFRESHES_PER_DAY) {
      return n;
    }
    return DEFAULT_REFRESHES_PER_DAY;
  } catch {
    return DEFAULT_REFRESHES_PER_DAY;
  }
}

export function setConfig(db: DB, deviceId: string, configJson: string): void {
  const now = Date.now();
  // config_json + last_modified + refreshes_per_day in one statement so the
  // denormalized cadence can't drift from the stored config (RFC 0001 §4).
  db.prepare(
    'UPDATE devices SET config_json = ?, last_modified = ?, refreshes_per_day = ? WHERE id = ?',
  ).run(configJson, now, deriveRefreshesPerDay(configJson), deviceId);
}

export function getDevicesForAccount(db: DB, accountId: string): readonly Device[] {
  // rowid tiebreaks when two pairings landed in the same millisecond.
  return db
    .prepare('SELECT * FROM devices WHERE owner_account_id = ? ORDER BY paired_at DESC, rowid DESC')
    .all(accountId) as Device[];
}

/**
 * Release an account's claim on a device (unpair). Clears `owner_account_id`,
 * `paired_at`, AND `config_json` so the device is pristine for a future re-pair.
 * Clearing the config is a privacy measure: a device re-paired by a *different*
 * account must not serve the previous owner's config (which can carry personal
 * text, calendar events, etc.) to the new owner's firmware. Scoped to
 * `accountId` so a caller can only unpair a device it owns — returns false if
 * the device is missing or owned by someone else.
 */
export function unclaimDevice(db: DB, deviceId: string, accountId: string): boolean {
  const now = Date.now();
  const result = db
    .prepare(
      `UPDATE devices
         SET owner_account_id  = NULL,
             paired_at         = NULL,
             config_json       = NULL,
             refreshes_per_day = 3,
             last_modified     = ?
       WHERE id = ?
         AND owner_account_id = ?`,
    )
    .run(now, deviceId, accountId);
  return result.changes > 0;
}

/**
 * Web-side "forget Wi-Fi" (issue #39): the owner asks a device they own to clear
 * its Wi-Fi credentials and re-enter captive-portal AP mode — the same effect as
 * the physical pinhole reset. The server can't reach the device, so this just
 * sets a pending flag; the firmware picks it up on its next pull (see
 * `consumeForget`). Scoped to `accountId`, so it returns false for a missing
 * device or one owned by someone else. Deliberately does NOT bump
 * `last_modified`: the command isn't config/frame content, and bumping it would
 * force a needless panel redraw on the device's next poll.
 */
export function requestForget(db: DB, deviceId: string, accountId: string): boolean {
  const result = db
    .prepare(`UPDATE devices SET forget_pending = 1 WHERE id = ? AND owner_account_id = ?`)
    .run(deviceId, accountId);
  return result.changes > 0;
}

/**
 * Atomically read-and-clear a device's pending "forget" flag, returning whether
 * one was set. Called on the firmware-facing pull path to deliver the command
 * exactly once (the device can't ACK after it forgets Wi-Fi, so deliver-and-clear
 * in a single UPDATE is the only workable handshake). Not owner-scoped: the
 * device id is the bearer secret on the pull endpoints, same as the rest of that
 * path.
 */
export function consumeForget(db: DB, deviceId: string): boolean {
  const result = db
    .prepare(`UPDATE devices SET forget_pending = 0 WHERE id = ? AND forget_pending = 1`)
    .run(deviceId);
  return result.changes > 0;
}

// -- Passkey credentials ----------------------------------------------------

interface PasskeyRow {
  credential_id: string;
  account_id: string;
  public_key: Buffer;
  sign_count: number;
  transports: string | null;
  created_at: number;
  last_used_at: number | null;
}

function rowToPasskey(row: PasskeyRow): PasskeyCredential {
  return {
    credential_id: row.credential_id,
    account_id: row.account_id,
    public_key: new Uint8Array(row.public_key),
    sign_count: row.sign_count,
    transports: row.transports,
    created_at: row.created_at,
    last_used_at: row.last_used_at,
  };
}

export function insertPasskey(
  db: DB,
  input: {
    credentialId: string;
    accountId: string;
    publicKey: Uint8Array;
    signCount: number;
    transports?: readonly string[];
  },
): PasskeyCredential {
  const now = Date.now();
  const transportsJson = input.transports?.length ? JSON.stringify(input.transports) : null;
  db.prepare(
    `INSERT INTO passkey_credentials
       (credential_id, account_id, public_key, sign_count, transports, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    input.credentialId,
    input.accountId,
    Buffer.from(input.publicKey),
    input.signCount,
    transportsJson,
    now,
  );
  return {
    credential_id: input.credentialId,
    account_id: input.accountId,
    public_key: input.publicKey,
    sign_count: input.signCount,
    transports: transportsJson,
    created_at: now,
    last_used_at: null,
  };
}

export function getPasskey(db: DB, credentialId: string): PasskeyCredential | null {
  const row = db
    .prepare('SELECT * FROM passkey_credentials WHERE credential_id = ?')
    .get(credentialId) as PasskeyRow | undefined;
  return row ? rowToPasskey(row) : null;
}

export function getPasskeysForAccount(db: DB, accountId: string): readonly PasskeyCredential[] {
  const rows = db
    .prepare('SELECT * FROM passkey_credentials WHERE account_id = ? ORDER BY created_at ASC')
    .all(accountId) as PasskeyRow[];
  return rows.map(rowToPasskey);
}

/**
 * Bump the stored sign counter to `newCount`. Reject (return false) if
 * `newCount` does not strictly increase the previous value — guards against
 * authenticator clones / replay attempts.
 *
 * Note: WebAuthn permits an authenticator that always reports counter=0
 * (e.g. some platform authenticators). The strict "must increase" rule
 * applies only when the previous stored counter was non-zero; counter=0
 * → 0 transitions are allowed.
 */
export function updatePasskeySignCount(db: DB, credentialId: string, newCount: number): boolean {
  const now = Date.now();
  const result = db
    .prepare(
      `UPDATE passkey_credentials
         SET sign_count = ?, last_used_at = ?
       WHERE credential_id = ?
         AND (sign_count = 0 OR ? > sign_count)`,
    )
    .run(newCount, now, credentialId, newCount);
  return result.changes > 0;
}

// -- OAuth identities -------------------------------------------------------

export function getOAuthIdentity(
  db: DB,
  provider: OAuthProvider,
  subject: string,
): OAuthIdentity | null {
  const row = db
    .prepare('SELECT * FROM oauth_identities WHERE provider = ? AND subject = ?')
    .get(provider, subject) as OAuthIdentity | undefined;
  return row ?? null;
}

export function insertOAuthIdentity(
  db: DB,
  input: {
    provider: OAuthProvider;
    subject: string;
    accountId: string;
    email?: string | null;
  },
): OAuthIdentity {
  const now = Date.now();
  db.prepare(
    `INSERT INTO oauth_identities (provider, subject, account_id, email, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(input.provider, input.subject, input.accountId, input.email ?? null, now);
  return {
    provider: input.provider,
    subject: input.subject,
    account_id: input.accountId,
    email: input.email ?? null,
    created_at: now,
  };
}

export function getOAuthIdentitiesForAccount(db: DB, accountId: string): readonly OAuthIdentity[] {
  return db
    .prepare('SELECT * FROM oauth_identities WHERE account_id = ? ORDER BY created_at ASC')
    .all(accountId) as OAuthIdentity[];
}

/**
 * Set the email on an account if it is currently null. Used when an OAuth
 * provider supplies an email for an account that was created without one.
 * No-op if the account already has an email (returns false).
 */
export function setAccountEmailIfMissing(db: DB, accountId: string, email: string): boolean {
  const result = db
    .prepare('UPDATE accounts SET email = ? WHERE id = ? AND email IS NULL')
    .run(email, accountId);
  return result.changes > 0;
}

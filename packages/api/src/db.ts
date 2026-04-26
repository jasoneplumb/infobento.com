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
    last_modified    INTEGER NOT NULL
  );
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
  return db;
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
    | Account
    | undefined;
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
  };
}

export function getDevice(db: DB, id: string): Device | null {
  const row = db.prepare('SELECT * FROM devices WHERE id = ?').get(id) as Device | undefined;
  return row ?? null;
}

export function getDeviceByPairCode(db: DB, code: string): Device | null {
  const row = db.prepare('SELECT * FROM devices WHERE pair_code = ?').get(code) as
    | Device
    | undefined;
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

export function setConfig(db: DB, deviceId: string, configJson: string): void {
  const now = Date.now();
  db.prepare('UPDATE devices SET config_json = ?, last_modified = ? WHERE id = ?').run(
    configJson,
    now,
    deviceId,
  );
}

export function getDevicesForAccount(db: DB, accountId: string): readonly Device[] {
  // rowid tiebreaks when two pairings landed in the same millisecond.
  return db
    .prepare('SELECT * FROM devices WHERE owner_account_id = ? ORDER BY paired_at DESC, rowid DESC')
    .all(accountId) as Device[];
}

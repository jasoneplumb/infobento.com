/**
 * Intent: Device-minting helpers — create a new device row with a unique,
 *   human-printable pair code, optionally seeding a starter config.
 * Context: Firmware bring-up (#106 Phase 0) and manufacturing provisioning.
 *   `createDevice` (db.ts) is the low-level insert; `claimDevice` binds an
 *   *existing* device to an account. Nothing else *creates* a device — this
 *   does, with pair-code generation + collision retry layered on top.
 */

import { randomInt } from 'node:crypto';
import { createDevice, setConfig, getDevice, type DB, type Device } from './db.js';

/**
 * Unambiguous pair-code alphabet: omits 0/O/1/I/L so a code printed on a
 * sticker can't be mis-keyed. 31 symbols, 6 chars → ~29.7 bits of entropy.
 */
const PAIR_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const PAIR_CODE_LENGTH = 6;

/** SQLite error code raised when the `pair_code` UNIQUE constraint is hit. */
const UNIQUE_VIOLATION = 'SQLITE_CONSTRAINT_UNIQUE';

/** Generate a random 6-char pair code from the unambiguous alphabet. */
export function generatePairCode(): string {
  let code = '';
  for (let i = 0; i < PAIR_CODE_LENGTH; i++) {
    // charAt (not []) so noUncheckedIndexedAccess keeps the type `string`.
    code += PAIR_CODE_ALPHABET.charAt(randomInt(PAIR_CODE_ALPHABET.length));
  }
  return code;
}

export interface MintDeviceOptions {
  /** Seed this config JSON so `/api/device/:id/frame` renders instead of 404ing. */
  readonly configJson?: string;
  /** Max attempts to find a non-colliding pair code (default 10). */
  readonly maxRetries?: number;
  /** Pair-code generator override (tests / custom alphabets). */
  readonly genCode?: () => string;
}

/**
 * Create a new unclaimed device with a unique pair code, returning the stored
 * record. Retries on the (astronomically unlikely) pair-code collision; if a
 * config is supplied it is seeded and the re-read record is returned.
 */
export function mintDevice(db: DB, options: MintDeviceOptions = {}): Device {
  const { configJson, maxRetries = 10, genCode = generatePairCode } = options;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    let device: Device;
    try {
      device = createDevice(db, { pairCode: genCode() });
    } catch (err) {
      if (err instanceof Error && (err as { code?: string }).code === UNIQUE_VIOLATION) {
        continue; // collision — try a fresh code
      }
      throw err;
    }

    if (configJson === undefined) return device;
    setConfig(db, device.id, configJson);
    // Re-read so the returned record reflects the seeded config + bumped mtime.
    return getDevice(db, device.id) ?? device;
  }

  throw new Error(`mintDevice: no free pair code after ${maxRetries} attempts`);
}

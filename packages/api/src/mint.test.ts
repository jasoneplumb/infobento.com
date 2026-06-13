import { describe, it, expect, beforeEach } from 'vitest';
import { createDb, getDevice, type DB } from './db.js';
import { generatePairCode, mintDevice } from './mint.js';

let db: DB;

beforeEach(() => {
  db = createDb(':memory:');
});

describe('generatePairCode', () => {
  it('returns a 6-char code from the unambiguous alphabet', () => {
    for (let i = 0; i < 500; i++) {
      const code = generatePairCode();
      expect(code).toHaveLength(6);
      // No 0/O/1/I/L — only the unambiguous symbols.
      expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
    }
  });
});

describe('mintDevice', () => {
  it('creates an unclaimed device with a pair code and persists it', () => {
    const device = mintDevice(db);
    expect(device.id).toBeTruthy();
    expect(device.pair_code).toHaveLength(6);
    expect(device.owner_account_id).toBeNull();
    expect(device.config_json).toBeNull();
    expect(getDevice(db, device.id)?.pair_code).toBe(device.pair_code);
  });

  it('seeds config when configJson is provided', () => {
    // Intentionally invalid per BentoConfigSchema — mintDevice treats
    // configJson as an opaque string and stores it as-is (no validation).
    const configJson = JSON.stringify({ boxes: [] });
    const device = mintDevice(db, { configJson });
    expect(device.config_json).toBe(configJson);
    expect(getDevice(db, device.id)?.config_json).toBe(configJson);
  });

  it('retries on a pair-code collision and still succeeds', () => {
    const taken = mintDevice(db).pair_code;
    const codes = [taken, taken, 'FRESH7'];
    let i = 0;
    const genCode = (): string => codes[i++] ?? 'BACKUP';
    const device = mintDevice(db, { genCode });
    expect(device.pair_code).toBe('FRESH7');
  });

  it('throws after exhausting retries on a persistent collision', () => {
    const taken = mintDevice(db).pair_code;
    expect(() => mintDevice(db, { genCode: () => taken, maxRetries: 3 })).toThrow(
      /no free pair code/,
    );
  });
});

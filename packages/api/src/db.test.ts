import { describe, it, expect, beforeEach } from 'vitest';
import {
  createDb,
  createAccount,
  getAccount,
  getAccountByEmail,
  createDevice,
  getDevice,
  getDeviceByPairCode,
  claimDevice,
  setConfig,
  getDevicesForAccount,
  unclaimDevice,
} from './db.js';

describe('db (in-memory)', () => {
  let db = createDb(':memory:');

  beforeEach(() => {
    db = createDb(':memory:');
  });

  describe('accounts', () => {
    it('creates an account with no contact fields', () => {
      const a = createAccount(db);
      expect(a.id.length).toBeGreaterThan(0);
      expect(a.email).toBeNull();
      expect(a.display_name).toBeNull();
      expect(typeof a.created_at).toBe('number');
    });

    it('creates an account with email and display name', () => {
      const a = createAccount(db, { email: 'jane@example.com', displayName: 'Jane' });
      expect(a.email).toBe('jane@example.com');
      expect(a.display_name).toBe('Jane');
    });

    it('looks up by id', () => {
      const a = createAccount(db, { email: 'lookup@example.com' });
      const found = getAccount(db, a.id);
      expect(found?.email).toBe('lookup@example.com');
    });

    it('returns null for missing account', () => {
      expect(getAccount(db, 'no-such-id')).toBeNull();
    });

    it('looks up by email', () => {
      createAccount(db, { email: 'a@x.com' });
      const found = getAccountByEmail(db, 'a@x.com');
      expect(found).not.toBeNull();
    });

    it('enforces unique email when present', () => {
      createAccount(db, { email: 'dup@x.com' });
      expect(() => createAccount(db, { email: 'dup@x.com' })).toThrow();
    });

    it('allows multiple accounts with null email', () => {
      const a1 = createAccount(db);
      const a2 = createAccount(db);
      expect(a1.id).not.toBe(a2.id);
    });
  });

  describe('devices', () => {
    it('creates an unclaimed device', () => {
      const d = createDevice(db, { pairCode: 'ABC123' });
      expect(d.pair_code).toBe('ABC123');
      expect(d.owner_account_id).toBeNull();
      expect(d.paired_at).toBeNull();
      expect(d.config_json).toBeNull();
    });

    it('looks up by id and pair code', () => {
      const d = createDevice(db, { pairCode: 'XYZ789' });
      expect(getDevice(db, d.id)?.id).toBe(d.id);
      expect(getDeviceByPairCode(db, 'XYZ789')?.id).toBe(d.id);
    });

    it('rejects duplicate pair codes', () => {
      createDevice(db, { pairCode: 'DUP000' });
      expect(() => createDevice(db, { pairCode: 'DUP000' })).toThrow();
    });

    it('returns null for missing device or pair code', () => {
      expect(getDevice(db, 'nope')).toBeNull();
      expect(getDeviceByPairCode(db, 'NOPECODE')).toBeNull();
    });
  });

  describe('claimDevice', () => {
    it('binds an unclaimed device to an account', () => {
      const a = createAccount(db, { email: 'owner@x.com' });
      createDevice(db, { pairCode: 'CLAIM01' });
      const claimed = claimDevice(db, 'CLAIM01', a.id);
      expect(claimed?.owner_account_id).toBe(a.id);
      expect(claimed?.paired_at).not.toBeNull();
    });

    it('is idempotent for the same account (does not bump paired_at)', () => {
      const a = createAccount(db);
      createDevice(db, { pairCode: 'IDEM01' });
      const first = claimDevice(db, 'IDEM01', a.id);
      const second = claimDevice(db, 'IDEM01', a.id);
      expect(second?.paired_at).toBe(first?.paired_at);
    });

    it('rejects claim by a different account', () => {
      const a1 = createAccount(db);
      const a2 = createAccount(db);
      createDevice(db, { pairCode: 'STEAL01' });
      claimDevice(db, 'STEAL01', a1.id);
      expect(claimDevice(db, 'STEAL01', a2.id)).toBeNull();
    });

    it('returns null for unknown pair code', () => {
      const a = createAccount(db);
      expect(claimDevice(db, 'NOPECODE', a.id)).toBeNull();
    });
  });

  describe('setConfig', () => {
    it('writes config_json and updates last_modified', () => {
      const d = createDevice(db, { pairCode: 'CFG001' });
      const before = d.last_modified;
      // ensure clock tick
      const sleep = (n: number): Promise<void> => new Promise((r) => setTimeout(r, n));
      return sleep(2).then(() => {
        setConfig(db, d.id, '{"boxes":[]}');
        const fresh = getDevice(db, d.id);
        expect(fresh?.config_json).toBe('{"boxes":[]}');
        expect(fresh!.last_modified).toBeGreaterThan(before);
      });
    });
  });

  describe('getDevicesForAccount', () => {
    it('returns empty for an account with no devices', () => {
      const a = createAccount(db);
      expect(getDevicesForAccount(db, a.id)).toEqual([]);
    });

    it('returns claimed devices ordered most-recently-paired first', () => {
      const a = createAccount(db);
      createDevice(db, { pairCode: 'A0001' });
      createDevice(db, { pairCode: 'B0002' });
      claimDevice(db, 'A0001', a.id);
      claimDevice(db, 'B0002', a.id);
      const list = getDevicesForAccount(db, a.id);
      expect(list).toHaveLength(2);
      expect(list[0]!.pair_code).toBe('B0002');
    });
  });

  describe('unclaimDevice', () => {
    it('releases the owner and clears paired_at for a device the account owns', () => {
      const a = createAccount(db);
      const d = createDevice(db, { pairCode: 'UNC001' });
      claimDevice(db, 'UNC001', a.id);
      expect(getDevice(db, d.id)?.owner_account_id).toBe(a.id);

      expect(unclaimDevice(db, d.id, a.id)).toBe(true);
      const fresh = getDevice(db, d.id);
      expect(fresh?.owner_account_id).toBeNull();
      expect(fresh?.paired_at).toBeNull();
      // It no longer shows up among the account's devices.
      expect(getDevicesForAccount(db, a.id)).toEqual([]);
    });

    it('refuses to unclaim a device owned by another account', () => {
      const owner = createAccount(db);
      const other = createAccount(db);
      const d = createDevice(db, { pairCode: 'UNC002' });
      claimDevice(db, 'UNC002', owner.id);

      expect(unclaimDevice(db, d.id, other.id)).toBe(false);
      expect(getDevice(db, d.id)?.owner_account_id).toBe(owner.id);
    });

    it('returns false for a missing device', () => {
      const a = createAccount(db);
      expect(unclaimDevice(db, 'no-such-id', a.id)).toBe(false);
    });
  });
});

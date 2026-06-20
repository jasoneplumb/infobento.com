import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rmSync, existsSync } from 'node:fs';
import { parseArgs, runCli } from './mint-cli.js';
import { _resetSingletonForTesting, getDb } from './db.js';

describe('mint-cli parseArgs', () => {
  it('defaults to no help, no paths', () => {
    expect(parseArgs([])).toEqual({ help: false });
  });

  it('parses --config and --db', () => {
    expect(parseArgs(['--config', 'c.json', '--db', 'd.db'])).toEqual({
      help: false,
      configPath: 'c.json',
      dbPath: 'd.db',
    });
  });

  it('parses -h / --help', () => {
    expect(parseArgs(['-h']).help).toBe(true);
    expect(parseArgs(['--help']).help).toBe(true);
  });

  it('throws on a missing flag value', () => {
    expect(() => parseArgs(['--config'])).toThrow('Missing value for --config');
    expect(() => parseArgs(['--db'])).toThrow('Missing value for --db');
  });

  it('throws on an unknown argument', () => {
    expect(() => parseArgs(['--bogus'])).toThrow('Unknown argument: --bogus');
  });
});

describe('mint-cli runCli', () => {
  const tmpDb = join(tmpdir(), `ib-mint-cli-${String(process.pid)}.db`);

  function cleanupDb(): void {
    for (const f of [tmpDb, `${tmpDb}-wal`, `${tmpDb}-shm`]) if (existsSync(f)) rmSync(f);
  }

  beforeEach(() => {
    // The CLI mutates INFOBENTO_DB_PATH then reads the getDb() singleton; reset
    // both so --db takes effect (the singleton is process-global).
    _resetSingletonForTesting();
    delete process.env['INFOBENTO_DB_PATH'];
    cleanupDb();
  });

  afterEach(() => {
    _resetSingletonForTesting();
    delete process.env['INFOBENTO_DB_PATH'];
    cleanupDb();
    vi.restoreAllMocks();
  });

  it('prints help and does not touch the database', () => {
    const out = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    runCli(['--help']);
    const text = out.mock.calls.map((c) => String(c[0])).join('');
    expect(text).toContain('Mint a new InfoBento device');
    expect(existsSync(tmpDb)).toBe(false);
  });

  it('mints a claimable (owner-null) device row into the --db path', () => {
    vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    runCli(['--db', tmpDb]);
    const rows = getDb()
      .prepare('SELECT id, pair_code, owner_account_id FROM devices')
      .all() as Array<{ id: string; pair_code: string; owner_account_id: string | null }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id.length).toBeGreaterThan(0);
    expect(rows[0]?.pair_code.length).toBeGreaterThan(0);
    expect(rows[0]?.owner_account_id).toBeNull();
  });

  it('throws when the --config file is missing', () => {
    vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    expect(() => runCli(['--db', tmpDb, '--config', '/no/such/config.json'])).toThrow();
  });
});

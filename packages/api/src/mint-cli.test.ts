import { describe, it, expect } from 'vitest';
import { parseArgs } from './mint-cli.js';

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

/**
 * Intent: Operator CLI to mint a new InfoBento device (device row + unique pair
 *   code, optionally seeding a starter config).
 * Context: Lives inside @infobento/api so it compiles to `dist/mint-cli.js` and
 *   ships with every deploy — the production host has no `scripts/` or `tsx`, so
 *   a repo-root script can't run there. Run on the host with:
 *     INFOBENTO_DB_PATH=/var/lib/infobento/data.db node dist/mint-cli.js
 *   or `npm run mint -w @infobento/api`. `scripts/mint-device.ts` is a thin
 *   local-dev shim over this module.
 * Pattern: Pure arg-parse → mintDevice → print. Auto-runs only as an entry point
 *   (so tests / the shim can import `parseArgs`/`runCli` without side effects).
 */

import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { validateBentoConfig } from '@infobento/core';
import { getDb } from './db.js';
import { mintDevice } from './mint.js';

export interface CliArgs {
  configPath?: string;
  dbPath?: string;
  help: boolean;
}

const HELP = `Mint a new InfoBento device.

Usage:
  npm run mint -w @infobento/api -- [options]        # from a built checkout
  node packages/api/dist/mint-cli.js [options]       # on the deployed host

Options:
  --config <file>  Seed a starter config (JSON) so the device renders a frame
                   instead of 404ing on first fetch. Validated before saving.
  --db <file>      SQLite path to write to (default: $INFOBENTO_DB_PATH or
                   /var/lib/infobento/data.db).
  -h, --help       Show this help.
`;

export function parseArgs(argv: readonly string[]): CliArgs {
  const args: CliArgs = { help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--config':
      case '--db': {
        const value = argv[++i];
        if (value === undefined) throw new Error(`Missing value for ${arg}`);
        if (arg === '--config') args.configPath = value;
        else args.dbPath = value;
        break;
      }
      case '-h':
      case '--help':
        args.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg ?? ''}`);
    }
  }
  return args;
}

function loadConfigJson(path: string): string {
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
  const result = validateBentoConfig(parsed);
  if (!result.valid) {
    const detail = result.errors.map((e) => `  - ${e.path}: ${e.message}`).join('\n');
    throw new Error(`Invalid config in ${path}:\n${detail}`);
  }
  // validateBentoConfig only reports pass/fail (no Zod-coerced data), so there
  // are no defaults/transforms to apply — re-serialize to normalize whitespace.
  return JSON.stringify(parsed);
}

/** Run the mint CLI with the given argv (excluding `node` + script path). */
export function runCli(argv: readonly string[]): void {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write(HELP);
    return;
  }

  // getDb() reads INFOBENTO_DB_PATH lazily, so set it before the first call.
  if (args.dbPath) process.env['INFOBENTO_DB_PATH'] = args.dbPath;

  const configJson = args.configPath ? loadConfigJson(args.configPath) : undefined;
  const device = mintDevice(getDb(), { configJson });

  process.stdout.write(
    [
      'Minted device:',
      `  id (bearer secret): ${device.id}`,
      `  pair code:          ${device.pair_code}`,
      `  config seeded:      ${configJson ? 'yes' : 'no'}`,
      '',
      'Next steps:',
      `  1. Flash the firmware with device id ${device.id}`,
      `  2. Claim it at https://www.infobento.com/pair/${device.pair_code}`,
      '',
    ].join('\n'),
  );
}

/**
 * True when this module is the process entry point (`node dist/mint-cli.js`),
 * not merely imported (tests, the local shim). Paths are realpath-normalized so
 * a symlinked invocation still compares equal.
 */
function isEntryPoint(): boolean {
  const entry = process.argv[1];
  if (entry === undefined) return false;
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url));
  } catch (e) {
    if (e instanceof Error && 'code' in e && e.code === 'ENOENT') return false;
    throw e;
  }
}

if (isEntryPoint()) runCli(process.argv.slice(2));

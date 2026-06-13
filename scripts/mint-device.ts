/**
 * Mint a new InfoBento device: create a device row with a unique pair code,
 * optionally seeding a starter config so `/api/device/:id/frame` renders a
 * frame instead of 404ing on the firmware's first fetch.
 *
 * Prints the device id (the bearer secret the firmware authenticates with)
 * and the pair code (printed on the device sticker for web pairing).
 *
 * Run:
 *   npx tsx scripts/mint-device.ts
 *   npx tsx scripts/mint-device.ts --config ./my-config.json
 *   npx tsx scripts/mint-device.ts --db ./dev.db --config ./my-config.json
 */

import { readFileSync } from 'node:fs';
import { getDb } from '../packages/api/src/db.js';
import { mintDevice } from '../packages/api/src/mint.js';
import { validateBentoConfig } from '../packages/core/src/validation.js';

interface CliArgs {
  configPath?: string;
  dbPath?: string;
  help: boolean;
}

const HELP = `Mint a new InfoBento device.

Usage: npx tsx scripts/mint-device.ts [options]

Options:
  --config <file>  Seed a starter config (JSON) so the device renders a frame
                   instead of 404ing on first fetch. Validated before saving.
  --db <file>      SQLite path to write to (default: $INFOBENTO_DB_PATH or
                   /var/lib/infobento/data.db).
  -h, --help       Show this help.
`;

function parseArgs(argv: readonly string[]): CliArgs {
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
        throw new Error(`Unknown argument: ${arg}`);
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
  // Re-serialize the validated value to normalize whitespace.
  return JSON.stringify(parsed);
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
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
      'Firmware fetches its frame at:',
      `  GET /api/device/${device.id}/frame`,
      '',
    ].join('\n'),
  );
}

main();

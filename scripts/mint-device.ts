/**
 * Local-dev shim for minting a device — runs the CLI from @infobento/api
 * against source via tsx, so you don't need a build during development:
 *
 *   npx tsx scripts/mint-device.ts [--config ./my-config.json] [--db ./dev.db]
 *
 * The real implementation lives in `packages/api/src/mint-cli.ts` so it also
 * compiles into the deployed build. On the production host (no scripts/, no
 * tsx) mint with:
 *
 *   INFOBENTO_DB_PATH=/var/lib/infobento/data.db npm run mint -w @infobento/api
 */

import { runCli } from '../packages/api/src/mint-cli.js';

runCli(process.argv.slice(2));

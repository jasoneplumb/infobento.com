# Deployment

Production runs the Hono API (`@infobento/api`) as a systemd service behind nginx
on a single host. Deploys are driven by `.github/workflows/deploy.yml`, which SSHes
to the host and runs `scripts/deploy-infobento.sh`.

## Trigger

- Push a `v*` tag, or run the workflow manually (`workflow_dispatch` / the `/deploy`
  skill).
- The deploy: builds → tars `package.json`, `package-lock.json`, `packages/`,
  `deploy/` → SSHes the artifact to the host → `deploy-infobento.sh` extracts,
  `npm ci --production --ignore-scripts` (+ `npm rebuild better-sqlite3` for the
  native binary), refreshes the systemd unit, restarts the service, health-checks,
  and rolls back on failure.

## Host layout

| Path                                    | Purpose                                                                                                                                  |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `/var/www/infobento`                    | Deployed app (`WorkingDirectory`); owned by `www-data`.                                                                                  |
| `/etc/systemd/system/infobento.service` | Service unit — tracked in repo at [`deploy/infobento.service`](../deploy/infobento.service) and refreshed by the deploy when it changes. |
| `/etc/infobento/auth.env`               | Runtime auth secrets (`root:www-data`, `640`); written by the deploy from GitHub secrets, loaded via the unit's `EnvironmentFile=`.      |
| `/var/lib/infobento/data.db`            | SQLite store (override with `INFOBENTO_DB_PATH`).                                                                                        |

The service listens on `127.0.0.1:4000`; nginx terminates TLS and reverse-proxies.
**The canonical host is `www.infobento.com`** — the apex `infobento.com` 301-redirects
to it, so all origins/redirect URIs must use `www.`.

## Required GitHub secrets

The deploy forwards these into `auth.env`. The unit must have
`EnvironmentFile=-/etc/infobento/auth.env` (it does, via `deploy/infobento.service`)
or they are silently ignored. Secrets omitted from a run keep their prior value in
`auth.env`.

| Secret                                                                     | Value / notes                                                                                                                              |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `SESSION_SECRET`                                                           | ≥16-char random (HMAC for sessions + OAuth/passkey challenges). Generate with `openssl rand -hex 32`. **Required** — auth 500s without it. |
| `RP_ID`                                                                    | WebAuthn Relying Party ID, e.g. `infobento.com`.                                                                                           |
| `RP_ORIGIN`                                                                | `https://www.infobento.com` (comma-separated if multiple).                                                                                 |
| `OAUTH_REDIRECT_BASE`                                                      | `https://www.infobento.com/api/auth/oauth` — **must match the host the browser uses (www).**                                               |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`                                | From Google Cloud → Credentials (Web application client).                                                                                  |
| `APPLE_CLIENT_ID` / `APPLE_TEAM_ID` / `APPLE_KEY_ID` / `APPLE_PRIVATE_KEY` | Sign in with Apple (Service ID + key).                                                                                                     |
| `DEPLOY_HOST` / `DEPLOY_USER` / `DEPLOY_KEY`                               | SSH target + private key for the deploy.                                                                                                   |

Set one with: `gh secret set GOOGLE_CLIENT_ID` (prompts; value stays out of shell
history). Non-secret values like `OAUTH_REDIRECT_BASE` can use `--body "..."`.

## OAuth provider setup

`redirect_uri` is `${OAUTH_REDIRECT_BASE}/<provider>/callback`. For Google, register
this **exact** URI in the OAuth client's Authorized redirect URIs:

```
https://www.infobento.com/api/auth/oauth/google/callback
```

A mismatch (wrong host, scheme, or trailing slash) yields `Error 400:
redirect_uri_mismatch`.

## Minting a device

Devices don't self-register — a row must exist (with a pair code) before the
firmware can pull or a user can claim it under **Devices**. Mint on the host so
the row lands in the DB the live server reads:

```bash
# On the production host, as the DB owner (www-data writes /var/lib/infobento/data.db):
cd /var/www/infobento
sudo -u www-data env INFOBENTO_DB_PATH=/var/lib/infobento/data.db \
  npm run mint -w @infobento/api -- --config ./starter.json   # --config optional
```

`npm run mint` just runs `node packages/api/dist/mint-cli.js` — invoke that
directly the same way (as `www-data`, with `INFOBENTO_DB_PATH` set) if you
prefer. Running as root instead would leave root-owned `-wal`/`-shm` files that
break the service's next write.

Prints the **device id** (the firmware's bearer secret) and the **pair code**.
Flash the firmware with that id, then claim it at
`https://www.infobento.com/pair/<pair-code>` while signed in. (Local dev:
`npx tsx scripts/mint-device.ts --db ./dev.db`.)

## Verifying a deploy

```bash
# OAuth start should 302 to the provider (not /?auth_error=oauth_unconfigured):
curl -sI https://www.infobento.com/api/auth/oauth/google/start | grep -i '^location'
# After a browser sign-in, the session endpoint should report authenticated:
curl -s https://www.infobento.com/api/auth/session
```

## Gotchas (learned the hard way)

- **`better-sqlite3` is native.** `npm ci --ignore-scripts` skips its prebuilt-binary
  postinstall, so the deploy runs `npm rebuild better-sqlite3` afterward. Without it,
  anything that opens the DB 500s (`Could not locate the bindings file`).
- **The unit must load `auth.env`.** A unit provisioned without `EnvironmentFile=`
  ignores every secret; that's why the unit is version-controlled and refreshed on
  deploy.
- **www vs apex.** `OAUTH_REDIRECT_BASE`, `RP_ORIGIN`, and the registered redirect
  URIs must all use `www.infobento.com`.

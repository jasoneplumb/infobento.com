#!/usr/bin/env bash
# Intent: Deploy InfoBento to production via SSH
# Context: Called from .github/workflows/deploy.yml; receives tar.gz on stdin
# Pattern: Backup → extract → npm ci → restart service → health check → rollback on failure
set -e

DEPLOY_DIR="/var/www/infobento"
DATA_DIR="/var/lib/infobento"
SERVICE_NAME="infobento"

# Ensure the SaaS data directory exists and is owned by the service user.
# The SQLite file at $DATA_DIR/data.db lives outside DEPLOY_DIR so it
# survives `rm -rf "$DEPLOY_DIR/packages"` and version rollbacks.
mkdir -p "$DATA_DIR"
chown www-data:www-data "$DATA_DIR"
chmod 700 "$DATA_DIR"

# Write the auth env file (issue #73). The systemd unit picks this up via
# `EnvironmentFile=-/etc/infobento/auth.env`. We rewrite it on every deploy
# so rotating any secret only requires a redeploy. Variables that arrive
# unset on this run keep their existing values from the prior file (avoiding
# accidental wipes when a single secret is omitted from the deploy
# environment).
AUTH_ENV_DIR="/etc/infobento"
AUTH_ENV_FILE="$AUTH_ENV_DIR/auth.env"
mkdir -p "$AUTH_ENV_DIR"
chmod 750 "$AUTH_ENV_DIR"

write_env_kv() {
  local key="$1"
  local value="$2"
  if [ -n "$value" ]; then
    echo "$key=$value" >> "$AUTH_ENV_FILE.new"
  elif [ -f "$AUTH_ENV_FILE" ] && grep -q "^$key=" "$AUTH_ENV_FILE"; then
    grep "^$key=" "$AUTH_ENV_FILE" >> "$AUTH_ENV_FILE.new"
  fi
}

: > "$AUTH_ENV_FILE.new"
write_env_kv "SESSION_SECRET" "${SESSION_SECRET:-}"
write_env_kv "RP_ID" "${RP_ID:-}"
write_env_kv "RP_ORIGIN" "${RP_ORIGIN:-}"
write_env_kv "OAUTH_REDIRECT_BASE" "${OAUTH_REDIRECT_BASE:-}"
write_env_kv "GOOGLE_CLIENT_ID" "${GOOGLE_CLIENT_ID:-}"
write_env_kv "GOOGLE_CLIENT_SECRET" "${GOOGLE_CLIENT_SECRET:-}"
write_env_kv "APPLE_CLIENT_ID" "${APPLE_CLIENT_ID:-}"
write_env_kv "APPLE_TEAM_ID" "${APPLE_TEAM_ID:-}"
write_env_kv "APPLE_KEY_ID" "${APPLE_KEY_ID:-}"
write_env_kv "APPLE_PRIVATE_KEY" "${APPLE_PRIVATE_KEY:-}"
mv "$AUTH_ENV_FILE.new" "$AUTH_ENV_FILE"
chown root:www-data "$AUTH_ENV_FILE"
chmod 640 "$AUTH_ENV_FILE"

echo "Receiving and extracting InfoBento deployment..."

mkdir -p "$DEPLOY_DIR"

BACKUP_TS=$(date +%s)
if [ -f "$DEPLOY_DIR/package.json" ]; then
  echo "Backing up current deployment..."
  cp -r "$DEPLOY_DIR" "/tmp/infobento-backup-$BACKUP_TS" || true
fi

# Extract new deployment (preserving package.json for npm ci)
rm -rf "$DEPLOY_DIR/packages"
tar -xzf - -C "$DEPLOY_DIR"

echo "Extraction complete!"

# Install production dependencies
echo "Installing production dependencies..."
cd "$DEPLOY_DIR"
npm ci --production --ignore-scripts 2>&1 | tail -5

# better-sqlite3 is a native module. The --ignore-scripts above (kept for supply-
# chain safety on every other package) also skips better-sqlite3's postinstall,
# which fetches its prebuilt .node binary — so rebuild just that one package.
# prebuild-install downloads the prebuilt for this Node ABI (no compiler needed).
# Without this the API 500s the instant anything opens the DB (auth, pairing).
npm rebuild better-sqlite3 2>&1 | tail -5

echo "Dependencies installed!"

# Verify deployment
echo "Verifying deployment..."
test -f "$DEPLOY_DIR/packages/api/dist/server.js" || test -f "$DEPLOY_DIR/packages/api/dist/index.js" || {
  echo "ERROR: API server entry point not found"
  BACKUP=$(ls -td /tmp/infobento-backup-* 2>/dev/null | head -1)
  if [ -n "$BACKUP" ]; then
    echo "Rolling back to previous version..."
    rm -rf "$DEPLOY_DIR"
    cp -r "$BACKUP" "$DEPLOY_DIR"
    systemctl restart "$SERVICE_NAME" 2>/dev/null || true
    echo "Rollback complete"
  fi
  exit 1
}

test -d "$DEPLOY_DIR/packages/web/dist" || {
  echo "ERROR: Web bundle not found"
  BACKUP=$(ls -td /tmp/infobento-backup-* 2>/dev/null | head -1)
  if [ -n "$BACKUP" ]; then
    echo "Rolling back..."
    rm -rf "$DEPLOY_DIR"
    cp -r "$BACKUP" "$DEPLOY_DIR"
    systemctl restart "$SERVICE_NAME" 2>/dev/null || true
    echo "Rollback complete"
  fi
  exit 1
}

echo "Content verification passed!"

# Fix ownership so www-data service can read the files
chown -R www-data:www-data "$DEPLOY_DIR"

# Restart the service
echo "Restarting $SERVICE_NAME service..."
systemctl restart "$SERVICE_NAME"
sleep 3

# Health check — Hono serves API on port 4000, Caddy/nginx reverse-proxies
if curl -sf --max-time 10 http://localhost:4000/api/health -o /dev/null 2>/dev/null; then
  echo "Health check passed!"
else
  echo "ERROR: Health check failed — rolling back..."
  BACKUP=$(ls -td /tmp/infobento-backup-* 2>/dev/null | head -1)
  if [ -n "$BACKUP" ]; then
    echo "Restoring from: $BACKUP"
    rm -rf "$DEPLOY_DIR"
    cp -r "$BACKUP" "$DEPLOY_DIR"
    cd "$DEPLOY_DIR" && npm ci --production --ignore-scripts 2>&1 | tail -3
    systemctl restart "$SERVICE_NAME"
    echo "Rollback complete"
  else
    echo "No backup found for rollback"
  fi
  exit 1
fi

# Write version metadata
VERSION="${DEPLOY_VERSION:-unknown}"
echo "{\"version\":\"$VERSION\",\"sha\":\"${DEPLOY_SHA:-unknown}\",\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" > "$DEPLOY_DIR/.deployed-version" || echo "WARNING: Failed to write version info"

# Keep last 5 backups
ls -td /tmp/infobento-backup-* 2>/dev/null | tail -n +6 | xargs rm -rf 2>/dev/null || true

echo "InfoBento deployment complete! (v$VERSION)"

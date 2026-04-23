#!/usr/bin/env bash
# Intent: Deploy InfoBento to production via SSH
# Context: Called from .github/workflows/deploy.yml; receives tar.gz on stdin
# Pattern: Backup → extract → npm ci → restart service → health check → rollback on failure
set -e

DEPLOY_DIR="/var/www/infobento"
SERVICE_NAME="infobento"

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

#!/usr/bin/env bash
# Pulls the latest code and redeploys backend + IMS under pm2.
# Run on the shop's macOS machine after `scripts/setup.sh` has already been
# run once. Does not touch POS -- that's updated via a new installer.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

require() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Error: $1 not found. $2" >&2
    exit 1
  fi
}

echo "==> Checking prerequisites"
require git "Install git from https://git-scm.com/"
require pnpm "Run: corepack enable"
require pm2 "Run scripts/setup.sh first."

if [ -n "$(git status --porcelain)" ]; then
  echo "Error: working tree has uncommitted changes -- resolve them before updating:" >&2
  git status --short >&2
  exit 1
fi

echo "==> Pulling latest code"
git pull

echo "==> Installing dependencies"
pnpm install

echo "==> Applying database migrations"
pnpm --filter @cafe-system/backend db:migrate

echo "==> Building production bundles"
pnpm --filter @cafe-system/backend build
pnpm --filter ims build

echo "==> Restarting services under pm2"
pm2 startOrRestart ecosystem.config.js --update-env
pm2 save

cat <<'EOF'

Update complete.
  Backend: http://localhost:3000
  IMS:     http://localhost:8080

POS isn't updated by this script -- download the latest installer from the
GitHub Releases page and run it separately.
EOF

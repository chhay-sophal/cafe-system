#!/usr/bin/env bash
# One-time on-premise setup: installs deps, configures env, sets up the
# database, builds production bundles, and starts backend + IMS under pm2.
# Run from a fresh `git clone` of this repo, on the shop's macOS machine.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

require() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Error: $1 not found. $2" >&2
    exit 1
  fi
}

ensure_env_file() {
  local dir="$1"
  if [ ! -f "$dir/.env" ]; then
    cp "$dir/.env.example" "$dir/.env"
    echo "Created $dir/.env from .env.example"
  fi
}

echo "==> Checking prerequisites"
require node "Install Node.js 18+ from https://nodejs.org/"
require pnpm "Run: corepack enable"
if ! command -v pm2 >/dev/null 2>&1; then
  echo "pm2 not found -- installing globally..."
  npm install -g pm2
fi

echo "==> Installing dependencies"
pnpm install

echo "==> Configuring environment files"
ensure_env_file "apps/backend"
ensure_env_file "apps/ims"

echo "==> Checking JWT_SECRET"
BACKEND_ENV="apps/backend/.env"
if grep -q '^JWT_SECRET=change-this-in-production$' "$BACKEND_ENV"; then
  if command -v openssl >/dev/null 2>&1; then
    SECRET=$(openssl rand -hex 32)
  else
    SECRET=$(head -c32 /dev/urandom | od -An -tx1 | tr -d ' \n')
  fi
  # BSD sed (macOS) requires an explicit (empty) backup extension after -i
  sed -i '' "s/^JWT_SECRET=.*/JWT_SECRET=${SECRET}/" "$BACKEND_ENV"
  echo "Generated a random JWT_SECRET"
else
  echo "JWT_SECRET already customized -- leaving it alone"
fi

DB_PATH="apps/backend/data/store_data.db"
FIRST_RUN=false
[ -f "$DB_PATH" ] || FIRST_RUN=true

echo "==> Setting up the database"
pnpm --filter @cafe-system/backend db:migrate
if [ "$FIRST_RUN" = true ]; then
  echo "Fresh database detected -- seeding initial data"
  pnpm --filter @cafe-system/backend db:seed
else
  echo "Existing database found -- skipping seed"
fi

echo "==> Building production bundles"
pnpm --filter @cafe-system/backend build
pnpm --filter ims build

echo "==> Starting services under pm2"
pm2 start ecosystem.config.js
pm2 save

echo "==> Creating a desktop shortcut for IMS"
cat > "$HOME/Desktop/Cafe IMS.webloc" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>URL</key>
	<string>http://localhost:8080</string>
</dict>
</plist>
PLIST

cat <<'EOF'

Setup complete.
  Backend: http://localhost:3000
  IMS:     http://localhost:8080

To keep these running after a reboot (one-time):
  pm2 startup launchd
  (then run the sudo command it prints)

Next: install the POS app from the GitHub Releases page.
EOF

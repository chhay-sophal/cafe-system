#!/usr/bin/env bash
# Decommissions backend + IMS on this macOS machine: stops the pm2
# services, unregisters boot-persistence, and removes the IMS desktop
# shortcut. Does NOT touch the database/uploads/backups by default -
# pass --purge-data to also delete that (irreversible, asks to confirm).
#
# POS is not handled here - uninstall it by dragging it to the Trash,
# same as any other installed app.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

PURGE_DATA=false
if [ "${1:-}" = "--purge-data" ]; then
  PURGE_DATA=true
fi

echo "==> Stopping pm2 services"
if command -v pm2 >/dev/null 2>&1; then
  pm2 delete cafe-backend cafe-ims 2>/dev/null || true
  pm2 save
else
  echo "pm2 not found -- nothing to stop"
fi

echo "==> Unregistering pm2 from launchd startup"
if command -v pm2 >/dev/null 2>&1; then
  pm2 unstartup launchd || echo "Nothing registered, or it needs the sudo command pm2 just printed"
else
  echo "pm2 not found -- nothing to unregister"
fi

echo "==> Removing the IMS desktop shortcut"
SHORTCUT="$HOME/Desktop/Cafe IMS.webloc"
if [ -f "$SHORTCUT" ]; then
  rm -f "$SHORTCUT"
  echo "Removed $SHORTCUT"
else
  echo "No shortcut found at $SHORTCUT"
fi

if [ "$PURGE_DATA" = true ]; then
  echo ""
  echo "You asked to also delete the database, uploads, and backups."
  echo "This is IRREVERSIBLE and deletes all sales/inventory history."
  read -r -p "Type 'yes' to confirm permanent deletion: " confirmation
  if [ "$confirmation" = "yes" ]; then
    rm -rf apps/backend/data apps/backend/uploads apps/backend/backups
    echo "Data deleted."
  else
    echo "Confirmation not received -- data left untouched."
  fi
else
  echo ""
  echo "Data was NOT deleted. Your database, uploads, and backups are"
  echo "still at apps/backend/data, apps/backend/uploads, and"
  echo "apps/backend/backups. Re-run with --purge-data to remove them."
fi

echo ""
echo "Uninstall complete. POS is a separately installed app --"
echo "remove it by dragging it to the Trash if needed."

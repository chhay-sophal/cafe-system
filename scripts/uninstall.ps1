#Requires -Version 5.1
# Decommissions backend + IMS on this Windows machine: stops the pm2
# services, unregisters boot-persistence, and removes the IMS desktop
# shortcut. Does NOT touch the database/uploads/backups by default -
# pass -PurgeData to also delete that (irreversible, asks to confirm).
#
# POS is not handled here - uninstall it via Windows' "Add or remove
# programs", same as any other installed app.

param(
    [switch]$PurgeData
)

$ErrorActionPreference = 'Stop'

$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

Write-Host "==> Stopping pm2 services"
if (Get-Command pm2 -ErrorAction SilentlyContinue) {
    pm2 delete cafe-backend cafe-ims 2>$null
    pm2 save
} else {
    Write-Host "pm2 not found -- nothing to stop"
}

Write-Host "==> Unregistering pm2 from Windows startup"
if (Get-Command pm2-startup -ErrorAction SilentlyContinue) {
    pm2-startup uninstall
} else {
    Write-Host "pm2-windows-startup not found -- nothing to unregister"
}

Write-Host "==> Removing the IMS desktop shortcut"
$shortcutPath = Join-Path ([Environment]::GetFolderPath('Desktop')) "Cafe IMS.url"
if (Test-Path $shortcutPath) {
    Remove-Item $shortcutPath -Force
    Write-Host "Removed $shortcutPath"
} else {
    Write-Host "No shortcut found at $shortcutPath"
}

if ($PurgeData) {
    Write-Host ""
    Write-Host "You asked to also delete the database, uploads, and backups."
    Write-Host "This is IRREVERSIBLE and deletes all sales/inventory history."
    $confirmation = Read-Host "Type 'yes' to confirm permanent deletion"
    if ($confirmation -eq 'yes') {
        Remove-Item -Recurse -Force "apps/backend/data" -ErrorAction SilentlyContinue
        Remove-Item -Recurse -Force "apps/backend/uploads" -ErrorAction SilentlyContinue
        Remove-Item -Recurse -Force "apps/backend/backups" -ErrorAction SilentlyContinue
        Write-Host "Data deleted."
    } else {
        Write-Host "Confirmation not received -- data left untouched."
    }
} else {
    Write-Host ""
    Write-Host "Data was NOT deleted. Your database, uploads, and backups are"
    Write-Host "still at apps/backend/data, apps/backend/uploads, and"
    Write-Host "apps/backend/backups. Re-run with -PurgeData to remove them."
}

Write-Host ""
Write-Host "Uninstall complete. POS is a separately installed app --"
Write-Host "remove it via Windows' 'Add or remove programs' if needed."

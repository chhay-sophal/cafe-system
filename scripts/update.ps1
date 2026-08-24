#Requires -Version 5.1
# Pulls the latest code and redeploys backend + IMS under pm2.
# Run on the shop's Windows machine after `scripts/setup.ps1` has already
# been run once. Does not touch POS -- that's updated via a new installer.

$ErrorActionPreference = 'Stop'

$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

function Require-Command($Name, $Hint) {
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        Write-Error "$Name not found. $Hint"
        exit 1
    }
}

Write-Host "==> Checking prerequisites"
Require-Command git "Install git from https://git-scm.com/"
Require-Command pnpm "Run: corepack enable"
Require-Command pm2 "Run scripts/setup.ps1 first."

$dirty = git status --porcelain
if ($dirty) {
    Write-Error "Working tree has uncommitted changes -- resolve them before updating:`n$dirty"
    exit 1
}

Write-Host "==> Pulling latest code"
git pull

Write-Host "==> Installing dependencies"
pnpm install

Write-Host "==> Applying database migrations"
pnpm --filter @cafe-system/backend db:migrate

Write-Host "==> Building production bundles"
pnpm --filter @cafe-system/backend build
pnpm --filter ims build

Write-Host "==> Restarting services under pm2"
pm2 startOrRestart ecosystem.config.js --update-env
pm2 save

Write-Host ""
Write-Host "Update complete."
Write-Host "  Backend: http://localhost:3000"
Write-Host "  IMS:     http://localhost:8080"
Write-Host ""
Write-Host "POS isn't updated by this script -- download the latest installer"
Write-Host "from the GitHub Releases page and run it separately."

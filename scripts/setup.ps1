#Requires -Version 5.1
# One-time on-premise setup: installs deps, configures env, sets up the
# database, builds production bundles, and starts backend + IMS under pm2.
# Run from a fresh `git clone` of this repo, on the shop's Windows machine.

$ErrorActionPreference = 'Stop'

$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

function Require-Command($Name, $Hint) {
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        Write-Error "$Name not found. $Hint"
        exit 1
    }
}

function Ensure-EnvFile($Dir) {
    $envPath = Join-Path $Dir ".env"
    $examplePath = Join-Path $Dir ".env.example"
    if (-not (Test-Path $envPath)) {
        Copy-Item $examplePath $envPath
        Write-Host "Created $envPath from .env.example"
    }
    return $envPath
}

Write-Host "==> Checking prerequisites"
Require-Command node "Install Node.js 18+ from https://nodejs.org/"
Require-Command pnpm "Run: corepack enable"
if (-not (Get-Command pm2 -ErrorAction SilentlyContinue)) {
    Write-Host "pm2 not found -- installing globally..."
    npm install -g pm2
}

Write-Host "==> Installing dependencies"
pnpm install

Write-Host "==> Configuring environment files"
$backendEnv = Ensure-EnvFile "apps/backend"
Ensure-EnvFile "apps/ims" | Out-Null

Write-Host "==> Checking JWT_SECRET"
$envContent = Get-Content $backendEnv -Raw
if ($envContent -match 'JWT_SECRET=change-this-in-production') {
    $secret = [System.Guid]::NewGuid().ToString("N") + [System.Guid]::NewGuid().ToString("N")
    $envContent = $envContent -replace 'JWT_SECRET=change-this-in-production', "JWT_SECRET=$secret"
    Set-Content -Path $backendEnv -Value $envContent -NoNewline
    Write-Host "Generated a random JWT_SECRET"
} else {
    Write-Host "JWT_SECRET already customized -- leaving it alone"
}

$dbPath = "apps/backend/data/store_data.db"
$isFirstRun = -not (Test-Path $dbPath)

Write-Host "==> Setting up the database"
pnpm --filter @cafe-system/backend db:migrate
if ($isFirstRun) {
    Write-Host "Fresh database detected -- no accounts exist yet, and every login"
    Write-Host "needs one, so let's create the first admin account now."
    pnpm --filter @cafe-system/backend db:create-admin
} else {
    Write-Host "Existing database found -- skipping admin account creation"
}

Write-Host "==> Building production bundles"
pnpm --filter @cafe-system/backend build
pnpm --filter ims build

Write-Host "==> Starting services under pm2"
pm2 start ecosystem.config.js
pm2 save

Write-Host "==> Creating a desktop shortcut for IMS"
$desktop = [Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktop "Cafe IMS.url"
Set-Content -Path $shortcutPath -Value @"
[InternetShortcut]
URL=http://localhost:8080
"@

Write-Host ""
Write-Host "Setup complete."
Write-Host "  Backend: http://localhost:3000"
Write-Host "  IMS:     http://localhost:8080"
Write-Host ""
Write-Host "To keep these running after a reboot (one-time):"
Write-Host "  npm install -g pm2-windows-startup"
Write-Host "  pm2-startup install"
Write-Host ""
Write-Host "Next: install the POS app from the GitHub Releases page."

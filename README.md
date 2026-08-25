# Cafe System

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![Vue 3](https://img.shields.io/badge/Vue-3-4FC08D?logo=vue.js&logoColor=white)
![Nuxt 4](https://img.shields.io/badge/Nuxt-4-00DC82?logo=nuxt.js&logoColor=white)
![Tauri 2](https://img.shields.io/badge/Tauri-2-FFC131?logo=tauri&logoColor=white)
![pnpm](https://img.shields.io/badge/pnpm-9.15-F69220?logo=pnpm&logoColor=white)

A point-of-sale and back-office system for a coffee shop, built as a pnpm monorepo with a shared REST API and two purpose-built clients: a cashier-facing POS terminal and a manager-facing inventory/analytics dashboard.

## What's in here

| App | Path | What it's for |
| --- | --- | --- |
| **Backend API** | [`apps/backend`](apps/backend) | Express + SQLite REST API. Owns auth, catalog, orders, inventory, recipes, and reporting. |
| **POS** | [`apps/pos`](apps/pos) | Tauri (Vue 3) desktop app for the cash register — product grid, cart, checkout, offline order queue. |
| **IMS** | [`apps/ims`](apps/ims) | Nuxt 4 dashboard for managers — live stock table, recipe editor, sales analytics. |
| **Shared types** | [`packages/shared-types`](packages/shared-types) | Zod schemas shared across apps for request/response validation. |

The backend is the single source of truth; POS and IMS are independent frontends that both talk to it over HTTP — they never talk to each other directly.

## Why it's useful

- **PIN-based staff login** with role-gated access (Cashier, Barista, Manager, Admin) and JWT sessions.
- **Full checkout flow** — product catalog with modifiers (e.g. milk, syrup), cart, cash/card/QR payment, automatic tax and change calculation.
- **Offline-resilient POS** — orders created while the register loses connectivity are queued in IndexedDB and auto-synced once the network is back, so a flaky connection never blocks a sale.
- **Recipe-driven inventory** — link ingredients and quantities to products/modifiers so every sale automatically decrements stock; adjust stock manually for restocks, wastage, or audit corrections.
- **Sales analytics** — daily summaries, payment-method breakdowns, and hourly volume charts over any date range.
- **Desktop-native POS** — packaged with Tauri, so it installs and runs like a native app on the register machine instead of living in a browser tab.

## Getting started

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [pnpm](https://pnpm.io/) 11.x (`corepack enable` will pick up the pinned version automatically)
- Rust toolchain (only needed to build/run the POS desktop shell — see the [Tauri prerequisites guide](https://v2.tauri.app/start/prerequisites/))

### Install

```bash
git clone git@github.com:chhay-sophal/cafe-system.git
cd cafe-system
pnpm install
```

This installs dependencies for every app and package in the workspace.

### Configure environment variables

Each app ships an `.env.example` — copy it to `.env` and adjust as needed:

```bash
cp apps/backend/.env.example apps/backend/.env
cp apps/ims/.env.example apps/ims/.env
cp apps/pos/.env.example apps/pos/.env
```

| App | Variable | Default | Notes |
| --- | --- | --- | --- |
| backend | `PORT` | `3000` | API port |
| backend | `JWT_SECRET` | `change-this-in-production` | Must be overridden outside local dev |
| ims | `NUXT_PUBLIC_API_BASE` | `http://localhost:3000` | Backend URL the dashboard calls |
| pos | `VITE_API_BASE_URL` | `http://localhost:3000` | Backend URL the POS app calls |

### Set up the database

The backend uses SQLite via Drizzle ORM. From `apps/backend`:

```bash
pnpm --filter @cafe-system/backend db:migrate   # apply schema
pnpm --filter @cafe-system/backend db:seed      # load sample staff/catalog data
```

### Run the apps

Each app runs independently — start the backend first, then whichever client(s) you need:

```bash
# API — http://localhost:3000
pnpm --filter @cafe-system/backend dev

# IMS manager dashboard — http://localhost:3001
pnpm --filter ims dev

# POS terminal (web preview)
pnpm --filter pos dev

# POS terminal (native desktop shell)
pnpm --filter pos tauri dev
```

### Run the tests

```bash
pnpm --filter @cafe-system/backend test
```

## Deployment

There's no cloud hosting here — backend, IMS, and POS all run on a single on-prem machine (the register PC), and `localhost` is correct for every URL. If you later split POS onto separate register machines, see the [multi-machine note](#multi-machine-note) at the end of this section.

### First-time setup

After cloning the repo onto the shop machine, run the setup script for that OS instead of doing the steps by hand:

```bash
# Windows (PowerShell)
.\scripts\setup.ps1

# macOS
./scripts/setup.sh
```

This installs dependencies, creates `.env` files (generating a random `JWT_SECRET` for the backend if it's still at the placeholder default), migrates and seeds the database on first run only, builds production bundles, and starts backend + IMS under [pm2](https://www.npmjs.com/package/pm2) via the committed [`ecosystem.config.js`](ecosystem.config.js). Requires Node.js 18+, pnpm (`corepack enable`), and git already on the machine — the script installs pm2 itself if missing. Rust/Tauri tooling is **not** needed here; POS is installed from a prebuilt installer, not built from source (see below).

<details>
<summary>What the script does, step by step (for reference or if you need to run it manually)</summary>

1. Check for Node, pnpm, git, and pm2 (installing pm2 if missing).
2. `pnpm install`.
3. Copy `apps/backend/.env.example` → `.env` and `apps/ims/.env.example` → `.env` if they don't exist yet.
4. Generate a random `JWT_SECRET` in `apps/backend/.env` if it's still the `.env.example` placeholder.
5. `pnpm --filter @cafe-system/backend db:migrate`, then `db:seed` only if `apps/backend/data/store_data.db` didn't already exist.
6. `pnpm --filter @cafe-system/backend build` and `pnpm --filter ims build`.
7. `pm2 start ecosystem.config.js && pm2 save`.
8. Create a desktop shortcut ("Cafe IMS") pointing at `http://localhost:8080`, so staff never need to type it.

</details>

Once it finishes, register pm2 to survive a reboot (one-time, not handled by the script since it needs elevated/interactive privileges):

- **Windows**: pm2 doesn't manage Windows services natively — install the [`pm2-windows-startup`](https://www.npmjs.com/package/pm2-windows-startup) helper: `npm install -g pm2-windows-startup && pm2-startup install`.
- **macOS**: run `pm2 startup launchd` and follow the printed `sudo` command to register the generated launch agent.

Confirm both are running with `pm2 status`, and tail logs with `pm2 logs cafe-backend` / `pm2 logs cafe-ims`.

### Install POS

Download the latest installer for this OS from the [GitHub Releases page](https://github.com/chhay-sophal/cafe-system/releases) (built by [`.github/workflows/release.yml`](.github/workflows/release.yml) — `.msi`/`.exe` for Windows, `.dmg` for macOS) and run it. No configuration needed: the bundled `VITE_API_BASE_URL` already defaults to `http://localhost:3000`.

If no release exists yet for the version you need, cut one from a dev machine:

```bash
git tag pos-v1.2.0
git push origin pos-v1.2.0
```

then publish the resulting draft release on GitHub before downloading.

### Verify

- Open `http://localhost:8080` and log into IMS.
- Launch the POS app and log in with a staff PIN.
- Ring up a test sale in POS and confirm it shows up in IMS's sales/stock views.

### Day-to-day maintenance

Redeploying backend/IMS after a code change — run the matching update script instead of the individual commands:

```bash
# Windows (PowerShell)
.\scripts\update.ps1

# macOS
./scripts/update.sh
```

This pulls the latest code, reinstalls dependencies, applies any new database migrations (never re-seeds), rebuilds both apps, and does `pm2 startOrRestart ecosystem.config.js` so it works whether or not the services were already running. It refuses to run if the working tree has uncommitted changes, so it won't silently overwrite local edits.

Updating POS: download the newer installer from Releases and run it — it upgrades in place. The update script doesn't touch POS.

The backend already takes a daily automated backup at 3 AM to `apps/backend/backups/` (see [`src/db/backup.ts`](apps/backend/src/db/backup.ts)) — but that still lives on the same disk, so periodically copy `apps/backend/backups/` and `apps/backend/uploads/` somewhere off-machine (USB drive, cloud sync) to survive hardware failure.

### Decommissioning a machine

```bash
# Windows (PowerShell)
.\scripts\uninstall.ps1

# macOS
./scripts/uninstall.sh
```

Stops the pm2 services, unregisters boot-persistence, and removes the IMS desktop shortcut. It deliberately leaves the database, uploads, and backups untouched — that's real sales/inventory history. Pass `-PurgeData` (Windows) / `--purge-data` (macOS) to also delete them; it asks for a typed `yes` confirmation first since that step is irreversible. POS isn't handled here — uninstall it the normal way for this OS (Windows' "Add or remove programs", or dragging it to the Trash on macOS).

<a id="multi-machine-note"></a>
> **Splitting POS onto separate register machines?** Point each register's POS build at the backend's LAN IP (not `localhost`) via `VITE_API_BASE_URL`, and rebuild the POS installer with that value baked in — the prebuilt Releases installer assumes backend and POS share a machine.

## Where to get help

- **Bugs and feature requests**: open an issue on the [GitHub issue tracker](https://github.com/chhay-sophal/cafe-system/issues).
- **Questions about a specific app**: start with that app's source under `apps/<app>/src` — the backend routes in [`apps/backend/src/app.ts`](apps/backend/src/app.ts) are the best map of what the API supports.

## Contributing

Contributions are welcome:

1. Fork the repo and create a feature branch.
2. Make your changes, keeping backend request/response shapes in sync with [`packages/shared-types`](packages/shared-types).
3. Run the relevant app's tests/build before opening a PR.
4. Open a pull request describing what changed and why.

## Maintainers

Maintained by [Sophal Chhay](https://github.com/chhay-sophal).

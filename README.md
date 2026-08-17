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
- [pnpm](https://pnpm.io/) 9.x (`corepack enable` will pick up the pinned version automatically)
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

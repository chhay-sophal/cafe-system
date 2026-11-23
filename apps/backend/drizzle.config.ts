import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'drizzle-kit';

// drizzle-kit (db:generate / db:migrate / db:studio) only ever works on the
// LOCAL database file - dev machines and on-prem installs. It loads
// apps/backend/.env by itself, so a hosted Turso URL left there would
// otherwise be migrated silently; refuse instead. The hosted production
// database is migrated only by `pnpm db:migrate:prod` (src/db/migrate-prod.ts).
const backendDir = path.dirname(fileURLToPath(import.meta.url));
const defaultDbPath = path.resolve(backendDir, 'data', 'store_data.db');

const configuredUrl = process.env.TURSO_DATABASE_URL;
if (configuredUrl && !configuredUrl.startsWith('file:')) {
  throw new Error(
    'drizzle-kit only works on the local database, but TURSO_DATABASE_URL (from apps/backend/.env or the shell) '
    + 'points at a remote one. Remove it from .env for local work; migrate production with `pnpm db:migrate:prod`.',
  );
}
const url = configuredUrl ?? `file:${defaultDbPath}`;
fs.mkdirSync(path.dirname(url.slice('file:'.length)), { recursive: true });

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'turso',
  dbCredentials: { url },
});

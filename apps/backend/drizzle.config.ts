import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'drizzle-kit';

const backendDir = path.dirname(fileURLToPath(import.meta.url));
const defaultDbPath = path.resolve(backendDir, 'data', 'store_data.db');

if (!process.env.TURSO_DATABASE_URL || process.env.TURSO_DATABASE_URL.startsWith('file:')) {
  fs.mkdirSync(path.dirname(defaultDbPath), { recursive: true });
}

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'turso',
  dbCredentials: {
    url: process.env.TURSO_DATABASE_URL ?? `file:${defaultDbPath}`,
    authToken: process.env.TURSO_AUTH_TOKEN,
  },
});

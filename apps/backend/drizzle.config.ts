import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'drizzle-kit';

const backendDir = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.resolve(backendDir, 'data', 'store_data.db');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: {
    url: dbPath,
  },
});
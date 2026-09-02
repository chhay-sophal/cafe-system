import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from './schema.js';
import { env } from '../env.js';

// Local file mode (default for dev/CI/on-prem) needs its parent directory to
// exist; a remote libsql:// URL (Turso) has no local path to create.
if (env.TURSO_DATABASE_URL.startsWith('file:')) {
  const dbPath = env.TURSO_DATABASE_URL.slice('file:'.length);
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
}

export const client = createClient({
  url: env.TURSO_DATABASE_URL,
  authToken: env.TURSO_AUTH_TOKEN,
});

export const db = drizzle(client, { schema });

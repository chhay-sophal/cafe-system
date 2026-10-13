import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { TEST_DATABASE_PATH } from './test-database.js';

// Runs once per `vitest run`, before any test file: start from an empty
// test database built by the real migrations, so the schema under test is
// exactly what `pnpm db:migrate` would produce.
export default async function setup() {
  for (const suffix of ['', '-journal', '-shm', '-wal']) {
    fs.rmSync(`${TEST_DATABASE_PATH}${suffix}`, { force: true });
  }
  fs.mkdirSync(path.dirname(TEST_DATABASE_PATH), { recursive: true });

  const client = createClient({ url: `file:${TEST_DATABASE_PATH}` });
  try {
    const migrationsFolder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'drizzle');
    await migrate(drizzle(client), { migrationsFolder });
  } finally {
    client.close();
  }
}

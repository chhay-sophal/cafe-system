// `pnpm db:migrate:prod` - the ONLY command that migrates the hosted (Turso)
// production database. Everything else (db:migrate, the dev server, the
// other db:* scripts) is local-only; see drizzle.config.ts and src/env.ts.
//
// Credentials come from apps/backend/.env.production - never from .env,
// which is for local development:
//
//   TURSO_DATABASE_URL=libsql://your-db.turso.io
//   TURSO_AUTH_TOKEN=...
//
// It shows the target and the migrations it would apply, and only goes
// ahead once you type the database name. Pass --env-file <path> to read
// credentials from another file.
import fs from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { createClient } from '@libsql/client';
import { parse } from 'dotenv';
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { backendRoot } from '../paths.js';

const MIGRATIONS_FOLDER = path.resolve(backendRoot, 'drizzle');

interface JournalEntry {
  tag: string;
  when: number;
}

function fail(message: string): never {
  console.error(`❌ ${message}`);
  process.exit(1);
}

function envFilePath(): string {
  const index = process.argv.indexOf('--env-file');
  if (index !== -1) {
    const value = process.argv[index + 1];
    if (!value) fail('--env-file needs a path.');
    return path.resolve(value);
  }
  return path.resolve(backendRoot, '.env.production');
}

async function main() {
  const file = envFilePath();
  if (!fs.existsSync(file)) {
    fail(`${file} not found. Create it with the production TURSO_DATABASE_URL and TURSO_AUTH_TOKEN (see .env.production.example).`);
  }
  // Parsed into a local object, not process.env, so nothing else picks it up.
  const credentials = parse(fs.readFileSync(file));
  const url = credentials.TURSO_DATABASE_URL;
  const authToken = credentials.TURSO_AUTH_TOKEN;
  if (!url || !/^(libsql|https):\/\//.test(url)) {
    fail(`TURSO_DATABASE_URL in ${path.basename(file)} must be the hosted libsql:// (or https://) URL. For the local database use \`pnpm db:migrate\`.`);
  }
  if (!authToken) {
    fail(`TURSO_AUTH_TOKEN is missing from ${path.basename(file)}.`);
  }

  const host = new URL(url).host;
  const databaseName = host.split('.')[0]!;
  const client = createClient({ url, authToken });

  try {
    // What's applied vs what's in the repo - the same rule drizzle's migrator
    // uses: any journal entry newer than the last applied migration.
    const journal = JSON.parse(fs.readFileSync(path.join(MIGRATIONS_FOLDER, 'meta', '_journal.json'), 'utf8')) as { entries: JournalEntry[] };
    let lastApplied = 0;
    try {
      const table = await client.execute("select name from sqlite_master where type = 'table' and name = '__drizzle_migrations'");
      lastApplied = table.rows.length
        ? Number((await client.execute('select max(created_at) as last from __drizzle_migrations')).rows[0]?.last ?? 0)
        : 0;
    } catch (error) {
      fail(`Couldn't read the migration state of ${host}: ${error instanceof Error ? error.message : error}`);
    }
    const pending = journal.entries.filter((entry) => entry.when > lastApplied);

    console.log(`Production database: ${host}`);
    if (pending.length === 0) {
      console.log('✅ Already up to date - nothing to apply.');
      return;
    }
    console.log(`Migrations to apply (${pending.length}):`);
    for (const entry of pending) {
      console.log(`  - ${entry.tag}`);
    }

    if (!process.stdin.isTTY) {
      fail('Refusing to migrate production without an interactive confirmation.');
    }
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = (await rl.question(`\nThis changes the LIVE database. Type the database name (${databaseName}) to continue: `)).trim();
    rl.close();
    if (answer !== databaseName) {
      console.log('Cancelled - nothing was changed.');
      return;
    }

    await migrate(drizzle(client), { migrationsFolder: MIGRATIONS_FOLDER });
    console.log(`✅ Applied ${pending.length} migration(s) to ${host}.`);
  } finally {
    client.close();
  }
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));

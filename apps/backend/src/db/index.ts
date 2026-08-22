import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';
import { backendRoot } from '../paths.js';

const dbPath = path.resolve(backendRoot, 'data', 'store_data.db');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

// Open SQLite DB file
const sqlite = new Database(dbPath);

// Enable WAL Mode and Busy Timeout for smooth multi-register concurrency
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('busy_timeout = 5000');
// NORMAL is safe (not just fast) under WAL: durability only depends on
// checkpoints, not every commit, and WAL itself survives a crash.
sqlite.pragma('synchronous = NORMAL');

export const db = drizzle(sqlite, { schema });
export { sqlite };
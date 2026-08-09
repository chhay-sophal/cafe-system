import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';

const backendDir = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.resolve(backendDir, '..', 'data', 'store_data.db');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

// Open SQLite DB file
const sqlite = new Database(dbPath);

// Enable WAL Mode and Busy Timeout for smooth multi-register concurrency
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('busy_timeout = 5000');

export const db = drizzle(sqlite, { schema });
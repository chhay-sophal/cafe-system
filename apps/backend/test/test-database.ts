import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The suite wipes orders, payments, users etc. between tests, so it gets its
// own database file - never the dev database at data/store_data.db.
export const TEST_DATABASE_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'test.db');
export const TEST_DATABASE_URL = `file:${TEST_DATABASE_PATH}`;

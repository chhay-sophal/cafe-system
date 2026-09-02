import fs from 'node:fs';
import path from 'node:path';
import { client } from './index.js';
import { env } from '../env.js';
import { backendRoot } from '../paths.js';

const backupsDir = path.resolve(backendRoot, 'backups');

function timestampedBackupPath() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(backupsDir, `store_data-${timestamp}.db`);
}

export async function runBackup() {
  // Remote Turso has no local file to snapshot - and its own continuous
  // backups/point-in-time recovery already cover this, so there's nothing
  // for this app-level job to do.
  if (!env.TURSO_DATABASE_URL.startsWith('file:')) {
    return;
  }

  fs.mkdirSync(backupsDir, { recursive: true });
  const destination = timestampedBackupPath();
  await client.execute(`VACUUM INTO '${destination}'`);
  console.log(`💾 Database backup written to ${destination}`);
  return destination;
}

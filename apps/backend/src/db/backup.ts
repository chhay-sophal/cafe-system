import fs from 'node:fs';
import path from 'node:path';
import { sqlite } from './index.js';
import { backendRoot } from '../paths.js';

const backupsDir = path.resolve(backendRoot, 'backups');

function timestampedBackupPath() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(backupsDir, `store_data-${timestamp}.db`);
}

export async function runBackup() {
  fs.mkdirSync(backupsDir, { recursive: true });
  const destination = timestampedBackupPath();
  await sqlite.backup(destination);
  console.log(`💾 Database backup written to ${destination}`);
  return destination;
}

import { client } from './index.js';
import { runBackup } from './backup.js';

try {
  await runBackup();
} catch (error) {
  console.error('Database backup failed:', error);
  process.exitCode = 1;
} finally {
  client.close();
}

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';

// Resolved relative to this file rather than process.cwd(), since process
// managers like PM2 default cwd to the ecosystem file's directory, not
// this app's own directory.
const backendDir = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(backendDir, '..', '.env'), quiet: true });

const { env } = await import('./env.js');
const { createApp } = await import('./app.js');
const { runBackup } = await import('./db/backup.js');
const cron = (await import('node-cron')).default;

const app = createApp();

app.listen(env.PORT, () => {
  console.log(`☕ Cafe POS Backend API running at http://localhost:${env.PORT}`);
});

// 3 AM: outside typical shop hours, so a backup never runs mid-checkout.
cron.schedule('0 3 * * *', () => {
  runBackup().catch((error) => {
    console.error('Scheduled database backup failed:', error);
  });
});

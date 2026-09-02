import cron from 'node-cron';
import { env } from './env.js';
import { createApp } from './app.js';
import { runBackup } from './db/backup.js';

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

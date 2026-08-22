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

const app = createApp();

app.listen(env.PORT, () => {
  console.log(`☕ Cafe POS Backend API running at http://localhost:${env.PORT}`);
});

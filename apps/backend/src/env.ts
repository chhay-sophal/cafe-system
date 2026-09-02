import path from 'node:path';
import { config } from 'dotenv';
import { z } from 'zod';
import { backendRoot } from './paths.js';

// Every entry point that reads env below needs this loaded first - the
// server (src/index.ts) and the standalone `tsx src/db/*.ts` CLI scripts
// (seed, create-admin, backup) alike. Resolved relative to backendRoot
// rather than cwd, since PM2 and a directly-invoked tsx script can start
// from different working directories.
config({ path: path.resolve(backendRoot, '.env'), quiet: true });

const defaultDbPath = path.resolve(backendRoot, 'data', 'store_data.db');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  JWT_SECRET: z.string().min(1, 'JWT_SECRET must be set to a non-empty value'),
  // Unset (dev, CI, on-prem) -> local file, same location as before. Set to a
  // libsql://... URL with TURSO_AUTH_TOKEN (Render + Turso) to go hosted -
  // same driver either way, see src/db/index.ts.
  TURSO_DATABASE_URL: z.string().default(`file:${defaultDbPath}`),
  TURSO_AUTH_TOKEN: z.string().optional(),
  // Product image uploads: local disk unless all R2 vars are set, in which
  // case uploads go to Cloudflare R2 instead (Render's filesystem is
  // ephemeral). See src/lib/uploads.ts.
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET: z.string().optional(),
  R2_PUBLIC_URL: z.string().optional(),
});

function loadEnv() {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('Invalid environment configuration:');
    for (const issue of result.error.issues) {
      console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(1);
  }
  return result.data;
}

export const env = loadEnv();

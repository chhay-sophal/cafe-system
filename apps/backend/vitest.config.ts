import { defineConfig } from 'vitest/config';
import { TEST_DATABASE_URL } from './test/test-database.js';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.ts'],
    // Recreates the separate test database from the migrations before every
    // run (see test/test-database.ts for why it's separate).
    globalSetup: ['./test/global-setup.ts'],
    // Tests import app.js/middleware directly, bypassing src/index.ts's
    // dotenv.config() call - so env.ts's required JWT_SECRET needs to come
    // from somewhere else here. CI has no .env file at all (it's gitignored),
    // so this can't rely on one existing either. dotenv never overrides a
    // variable that's already set, so TURSO_DATABASE_URL here also wins over
    // any value in .env.
    env: {
      JWT_SECRET: 'test-secret-do-not-use-in-production',
      TURSO_DATABASE_URL: TEST_DATABASE_URL,
    },
  },
});

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.ts'],
    // Tests import app.js/middleware directly, bypassing src/index.ts's
    // dotenv.config() call - so env.ts's required JWT_SECRET needs to come
    // from somewhere else here. CI has no .env file at all (it's gitignored),
    // so this can't rely on one existing either.
    env: {
      JWT_SECRET: 'test-secret-do-not-use-in-production',
    },
  },
});

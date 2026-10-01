import { defineConfig } from 'vitest/config';
import { testDatabaseUrl } from './vitest.database-url.mjs';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
    // Integration suites share the one test database and truncate between
    // tests, so files must not run in parallel.
    fileParallelism: false,
    hookTimeout: 30_000,
    testTimeout: 30_000,
    env: {
      DATABASE_URL: testDatabaseUrl(),
    },
  },
});

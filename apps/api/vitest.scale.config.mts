import { defineConfig } from 'vitest/config';
import { testDatabaseUrl } from './vitest.database-url.mjs';

/**
 * The 10k scale suite. Deliberately separate from the fast run: it seeds ~10,000
 * TODOs and asserts deterministic plan/query-count properties. Wall-clock
 * latency lives in the non-gating benchmark (`scripts/benchmark.ts`), not here.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/scale/**/*.scale.ts'],
    fileParallelism: false,
    hookTimeout: 120_000,
    testTimeout: 120_000,
    env: {
      DATABASE_URL: testDatabaseUrl(),
    },
  },
});

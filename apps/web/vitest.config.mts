import { defineConfig } from 'vitest/config';

/**
 * The web app's tests cover pure modules only (no DOM): the list and action
 * state machines. The React bindings are exercised through the app, not here,
 * so no jsdom or testing-library.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});

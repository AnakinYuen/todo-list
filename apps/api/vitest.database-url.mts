/**
 * Integration tests run against a dedicated test database, never the
 * development one. Prefer an explicit TEST_DATABASE_URL; otherwise derive the
 * test URL from DATABASE_URL (so it works in the devcontainer, where the host is
 * `db`, and natively, where it is `localhost`). Shared by the fast and scale
 * Vitest configs so both resolve the same database.
 *
 * The `.mts` configs import this as `./vitest.database-url.mjs`: node16 ESM
 * resolution requires an explicit extension, and `.mjs` maps to this `.mts`.
 */
export function testDatabaseUrl(): string {
  if (process.env.TEST_DATABASE_URL) {
    return process.env.TEST_DATABASE_URL;
  }
  const base = process.env.DATABASE_URL;
  if (base) {
    const url = new URL(base);
    url.pathname = '/todo-list_test';
    return url.toString();
  }
  return 'postgres://postgres:postgres@localhost:5432/todo-list_test';
}

import { createDatabase, createPool } from '../src/db/pool';

/**
 * Empties the list without reseeding: removes every TODO and, via the cascade,
 * its Dependency edges. The counterpart to `seed.ts` for demo resets and
 * manual testing — `db:clean` when a blank list is wanted, `seed` for the
 * curated fixture.
 */
async function main(): Promise<void> {
  const pool = createPool();
  try {
    const db = createDatabase(pool);
    await db.execute('truncate table todos restart identity cascade');
    console.log('Cleaned all TODOs');
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});

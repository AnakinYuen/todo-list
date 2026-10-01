import { join } from 'node:path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDatabase, createPool } from './pool';

async function main(): Promise<void> {
  const pool = createPool();
  try {
    await migrate(createDatabase(pool), {
      migrationsFolder: join(__dirname, '..', '..', 'drizzle'),
    });
    console.log('Migrations applied');
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});

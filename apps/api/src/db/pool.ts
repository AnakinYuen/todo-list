import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { loadConfig } from '../config';
import * as schema from './schema';

export type Database = NodePgDatabase<typeof schema>;

export function createPool(): Pool {
  return new Pool({ connectionString: loadConfig().databaseUrl });
}

export function createDatabase(pool: Pool): Database {
  return drizzle(pool, { schema });
}

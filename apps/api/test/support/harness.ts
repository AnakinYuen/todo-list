import { join } from 'node:path';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { Todo } from '@todo-list/shared';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createApp } from '../../src/app.factory';
import { DbService } from '../../src/db/db.service';

export interface TestHarness {
  app: NestFastifyApplication;
  db: DbService;
  reset(): Promise<void>;
  /**
   * Completes a TODO with a *pinned* completion time, so assertions that depend
   * on it — the next Recurrence due date — do not depend on wall-clock time.
   */
  completeOn(id: string, version: number, completedAt: string): Promise<Todo>;
  /**
   * Runs `run` while counting the SQL statements the pool executes, so a test can
   * assert a read is a bounded number of queries (the N+1 check).
   */
  countQueries<T>(run: () => Promise<T>): Promise<{ result: T; count: number }>;
  close(): Promise<void>;
}

interface QueryCountablePool {
  query: (...args: unknown[]) => unknown;
}

/**
 * Boots the real application against the derived test database, applies
 * migrations, and exposes a reset that truncates between tests.
 */
export async function createTestHarness(): Promise<TestHarness> {
  const app = await createApp();
  const db = app.get(DbService);

  await migrate(db.db, { migrationsFolder: join(process.cwd(), 'drizzle') });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  return {
    app,
    db,
    async reset(): Promise<void> {
      await db.pool.query('truncate table todos restart identity cascade');
    },
    async completeOn(
      id: string,
      version: number,
      completedAt: string,
    ): Promise<Todo> {
      // Pin the completion time first: `nextCompletedAt` keeps an existing
      // timestamp rather than calling `new Date()`, so the spawn anchors to it.
      await db.pool.query('update todos set completed_at = $2 where id = $1', [
        id,
        `${completedAt}T00:00:00.000Z`,
      ]);
      const response = await app.inject({
        method: 'POST',
        url: `/api/todos/${id}/transitions`,
        payload: { status: 'COMPLETED', version },
      });
      if (response.statusCode !== 200) {
        throw new Error(`completeOn failed (${response.statusCode})`);
      }
      return response.json() as Todo;
    },
    async countQueries<T>(
      run: () => Promise<T>,
    ): Promise<{ result: T; count: number }> {
      const pool = db.pool as unknown as QueryCountablePool;
      const original = pool.query;
      let count = 0;
      pool.query = (...args: unknown[]) => {
        count += 1;
        return original.apply(pool, args);
      };
      try {
        const result = await run();
        return { result, count };
      } finally {
        pool.query = original;
      }
    },
    async close(): Promise<void> {
      await app.close();
    },
  };
}

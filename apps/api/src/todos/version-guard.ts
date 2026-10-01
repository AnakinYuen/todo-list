import { and, eq, isNull, sql } from 'drizzle-orm';
import { todos, type TodoRow } from '../db/schema';
import type { Database } from './dependencies';
import { conflict, notFound } from './errors';

/**
 * Applies an optimistic update guarded by the expected version, then resolves a
 * failed guard into 404 (missing or Deleted) or 409 (stale, reporting the
 * database's actual version). The caller owns the transaction and any advisory
 * lock — this writes only through the `db` it is handed, so the concurrency
 * boundary stays explicit at each call site (ADR 0003, ADR 0007).
 */
export async function withVersionGuard(
  db: Database,
  id: string,
  version: number,
  values: Partial<typeof todos.$inferInsert>,
): Promise<TodoRow> {
  const [row] = await db
    .update(todos)
    .set({
      ...values,
      version: sql`${todos.version} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(todos.id, id),
        eq(todos.version, version),
        isNull(todos.deletedAt),
      ),
    )
    .returning();

  if (row) {
    return row;
  }

  const [existing] = await db
    .select({ version: todos.version, deletedAt: todos.deletedAt })
    .from(todos)
    .where(eq(todos.id, id))
    .limit(1);

  if (!existing || existing.deletedAt) {
    notFound();
  }

  conflict(existing.version);
}

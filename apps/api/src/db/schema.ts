import { TodoPriority, TodoStatus } from '@todo-list/shared';
import { sql } from 'drizzle-orm';
import {
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import type { RecurrenceRule } from '@todo-list/shared';

export const todoStatusEnum = pgEnum('todo_status', [...TodoStatus.options] as [
  string,
  ...string[],
]);

export const todoPriorityEnum = pgEnum('todo_priority', [
  ...TodoPriority.options,
] as [string, ...string[]]);

export const todos = pgTable(
  'todos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 200 }).notNull(),
    description: text('description'),
    dueDate: date('due_date', { mode: 'string' }),
    status: todoStatusEnum('status').notNull().default('NOT_STARTED'),
    priority: todoPriorityEnum('priority').notNull().default('MEDIUM'),
    version: integer('version').notNull().default(1),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    /** Set when completing a recurring TODO spawned its successor (ADR 0007). */
    spawnedAt: timestamp('spawned_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    recurrence: jsonb('recurrence').$type<RecurrenceRule>(),
    seriesId: uuid('series_id'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // One live occurrence per date per series (ADR 0007): the defence-in-depth
    // guard for spawn, on top of the optimistic version check. Deleted rows are
    // excluded so they do not occupy a date the dedup guard considers free.
    uniqueIndex('todos_series_due_date_key')
      .on(table.seriesId, table.dueDate)
      .where(sql`${table.seriesId} IS NOT NULL AND ${table.deletedAt} IS NULL`),
    // Filter and lookup support (ticket 10). The keyset sorts use computed text
    // keys, so these do not serve ORDER BY; they narrow the list's `WHERE`
    // filters and the recurrence series scan.
    index('todos_status_idx').on(table.status),
    index('todos_priority_idx').on(table.priority),
    index('todos_due_date_idx').on(table.dueDate),
    index('todos_series_id_idx').on(table.seriesId),
    // Prefix search for the dependency picker: `lower(name) LIKE 'term%'`.
    // `text_pattern_ops` lets the btree serve LIKE under a non-C collation.
    index('todos_name_prefix_idx').using(
      'btree',
      sql`lower(${table.name}) text_pattern_ops`,
    ),
  ],
);

export type TodoRow = typeof todos.$inferSelect;

/**
 * Directed dependency edges: a row means `dependent` depends on `dependency`.
 * Cascade delete keeps the graph consistent when a TODO is purged.
 */
export const todoDependencies = pgTable(
  'todo_dependencies',
  {
    dependentId: uuid('dependent_id')
      .notNull()
      .references(() => todos.id, { onDelete: 'cascade' }),
    dependencyId: uuid('dependency_id')
      .notNull()
      .references(() => todos.id, { onDelete: 'cascade' }),
  },
  (table) => [
    primaryKey({ columns: [table.dependentId, table.dependencyId] }),
    index('todo_dependencies_dependency_idx').on(table.dependencyId),
  ],
);

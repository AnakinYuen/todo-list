import { BadRequestException } from '@nestjs/common';
import { sql, type SQL } from 'drizzle-orm';
import {
  SortOrder,
  TodoSort,
  type TodoSort as TodoSortType,
} from '@todo-list/shared';
import { todos, type TodoRow } from '../db/schema';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface Cursor {
  /** The last row's sort-key value (a string; never null). */
  key: string;
  /** The last row's id, for a stable tie-break. */
  id: string;
  /** The sort the cursor was issued for, so a stale cursor is rejected. */
  sort: TodoSortType;
  order: SortOrder;
  /** A fingerprint of the filters, so a cursor cannot be reused across them. */
  filters: string;
}

/**
 * A stable fingerprint of the list filters (not the sort, order, limit or the
 * cursor itself), so a cursor reused against a different filter set is rejected
 * instead of silently skipping or repeating rows.
 */
export function filterFingerprint(params: {
  includeDeleted: boolean;
  status?: string;
  priority?: string;
  dueAfter?: string;
  dueBefore?: string;
  overdue: boolean;
  blocked?: boolean;
}): string {
  return [
    params.includeDeleted ? '1' : '0',
    params.status ?? '',
    params.priority ?? '',
    params.dueAfter ?? '',
    params.dueBefore ?? '',
    params.overdue ? '1' : '0',
    params.blocked === undefined ? '' : params.blocked ? '1' : '0',
  ].join('|');
}

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

function invalidCursor(): never {
  throw new BadRequestException({
    code: 'VALIDATION',
    message: 'Invalid cursor',
  });
}

export function decodeCursor(value: string): Cursor {
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8'),
    );
    if (typeof parsed === 'object' && parsed !== null) {
      const { key, id, sort, order, filters } = parsed as Record<
        string,
        unknown
      >;
      if (
        typeof key === 'string' &&
        typeof id === 'string' &&
        UUID_RE.test(id) &&
        TodoSort.safeParse(sort).success &&
        SortOrder.safeParse(order).success &&
        typeof filters === 'string'
      ) {
        return {
          key,
          id,
          sort: sort as TodoSortType,
          order: order as SortOrder,
          filters,
        };
      }
    }
  } catch {
    // fall through to the validation error
  }
  invalidCursor();
}

/** Ranks that make the Postgres enums sort in a fixed, meaningful order. */
const STATUS_RANK: Record<string, string> = {
  NOT_STARTED: '0',
  IN_PROGRESS: '1',
  COMPLETED: '2',
  ARCHIVED: '3',
};

const PRIORITY_RANK: Record<string, string> = {
  LOW: '0',
  MEDIUM: '1',
  HIGH: '2',
};

/** The unknown-value rank, shared by the SQL expression and the row value. */
const UNRANKED = '9';

/** A date-of-null sentinel so undated TODOs sort last in either direction. */
function dueDateSentinel(order: SortOrder): string {
  return order === 'asc' ? '9999-12-31' : '0000-01-01';
}

/** The SQL projection of a rank key. Its default must match `rankOf`. */
function rankSql(column: SQL, ranks: Record<string, string>): SQL {
  const whens = Object.entries(ranks).map(
    ([value, rank]) => sql`when ${value} then ${rank}`,
  );
  return sql`case ${column} ${sql.join(whens, sql` `)} else ${sql.raw(UNRANKED)} end`;
}

/**
 * The row-side projection, falling back exactly as `rankSql` does. The two are
 * built together by `rankKey`, so the `ORDER BY` and the cursor cannot disagree.
 */
function rankOf(ranks: Record<string, string>, value: string): string {
  return ranks[value] ?? UNRANKED;
}

/** A rank key: the SQL `case` and the row value derived from the same table. */
function rankKey(
  column: SQL,
  ranks: Record<string, string>,
  read: (row: TodoRow) => string,
): SortKey {
  return {
    sql: rankSql(column, ranks),
    valueOf: (row) => rankOf(ranks, read(row)),
  };
}

/** The two projections of a keyset sort, kept in one object. */
export interface SortKey {
  sql: SQL;
  valueOf: (row: TodoRow) => string;
}

/**
 * The keyset sort key: the SQL expression PostgreSQL orders by, and the string
 * the matching row contributes to the cursor. Both projections sit in one arm
 * per sort, so the `ORDER BY` and the cursor cannot drift into skipping or
 * repeating a page.
 */
export function sortKey(sort: TodoSortType, order: SortOrder): SortKey {
  switch (sort) {
    case 'name':
      return { sql: sql`${todos.name}`, valueOf: (row) => row.name };
    case 'dueDate':
      return {
        sql: sql`coalesce(to_char(${todos.dueDate}, 'YYYY-MM-DD'), ${dueDateSentinel(order)})`,
        valueOf: (row) => row.dueDate ?? dueDateSentinel(order),
      };
    case 'status':
      return rankKey(sql`${todos.status}`, STATUS_RANK, (row) => row.status);
    case 'priority':
      return rankKey(
        sql`${todos.priority}`,
        PRIORITY_RANK,
        (row) => row.priority,
      );
  }
}

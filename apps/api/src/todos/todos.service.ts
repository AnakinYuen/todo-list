import { isDeepStrictEqual } from 'node:util';
import { BadRequestException, Injectable } from '@nestjs/common';
import {
  DeleteImpact,
  MAX_DEPENDENCIES_PER_TODO,
  SEARCH_RESULT_LIMIT,
} from '@todo-list/shared';
import type {
  CreateTodoInput,
  ListTodosParams,
  NextOccurrencePreview,
  RecurrenceRule,
  Todo,
  TodoPage,
  TodoPriority,
  TodoRef,
  TodoStatus,
  TransitionImpact,
  TransitionTodoInput,
  UpdateTodoInput,
} from '@todo-list/shared';
import {
  and,
  asc,
  desc,
  eq,
  getTableColumns,
  gte,
  isNull,
  lte,
  ne,
  notInArray,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { todoDependencies, todos, type TodoRow } from '../db/schema';
import { nextFreeDueDate, nextOccurrence } from '../recurrence/recurrence';
import { toTodo } from '../serializers';
import {
  applyReopenCascade,
  cascadeTargets,
  dependentsUnblockedBy,
  removesSatisfaction,
} from './cascade';
import {
  dependencyMap,
  dependencyRefsJson,
  GRAPH_LOCK_KEY,
  hasUnsatisfiedDependency,
  parseDependencyRefs,
  satisfied,
  unsatisfiedRefs,
  type Database,
} from './dependencies';
import {
  decodeCursor,
  encodeCursor,
  filterFingerprint,
  sortKey,
} from './list-keys';
import {
  blocked,
  conflict,
  cycle,
  dependencyLimit,
  notFound,
  recurrenceOnCompleted,
} from './errors';
import { withVersionGuard } from './version-guard';

/**
 * A completion time is recorded when a TODO enters Completed, preserved when it
 * is later Archived (archiving is orthogonal to outcome), and cleared when it
 * leaves Completed for an active status.
 */
function nextCompletedAt(
  status: TodoStatus,
  current: Date | null,
): Date | null {
  if (status === 'COMPLETED') {
    return current ?? new Date();
  }
  if (status === 'ARCHIVED') {
    return current;
  }
  return null;
}

/** Hides Deleted TODOs unless the caller explicitly asks for them. */
function visible(includeDeleted: boolean): SQL | undefined {
  return includeDeleted ? undefined : isNull(todos.deletedAt);
}

@Injectable()
export class TodosService {
  constructor(private readonly dbService: DbService) {}

  async create(input: CreateTodoInput): Promise<Todo> {
    const [row] = await this.dbService.db
      .insert(todos)
      .values({
        name: input.name,
        description: input.description ?? null,
        dueDate: input.dueDate ?? null,
        completedAt: input.status === 'COMPLETED' ? new Date() : null,
        recurrence: input.recurrence ?? null,
        seriesId: input.recurrence ? crypto.randomUUID() : null,
        ...(input.priority ? { priority: input.priority } : {}),
        ...(input.status ? { status: input.status } : {}),
      })
      .returning();
    if (!row) {
      throw new Error('Insert returned no row');
    }
    return this.serializeOne(row);
  }

  async list(params: ListTodosParams): Promise<TodoPage> {
    const key = sortKey(params.sort, params.order);
    const filters = filterFingerprint(params);
    const conditions: (SQL | undefined)[] = [visible(params.includeDeleted)];

    if (params.status) {
      conditions.push(eq(todos.status, params.status));
    }
    if (params.priority) {
      conditions.push(eq(todos.priority, params.priority));
    }
    if (params.dueAfter) {
      conditions.push(gte(todos.dueDate, params.dueAfter));
    }
    if (params.dueBefore) {
      conditions.push(lte(todos.dueDate, params.dueBefore));
    }
    if (params.overdue) {
      conditions.push(sql`${todos.dueDate} < current_date`);
      conditions.push(notInArray(todos.status, ['COMPLETED', 'ARCHIVED']));
    }
    if (params.blocked !== undefined) {
      const exists = hasUnsatisfiedDependency();
      conditions.push(params.blocked ? exists : sql`not (${exists})`);
    }
    if (params.cursor) {
      const cursor = decodeCursor(params.cursor);
      if (cursor.sort !== params.sort || cursor.order !== params.order) {
        throw new BadRequestException({
          code: 'VALIDATION',
          message: 'Cursor does not match the requested sort',
        });
      }
      if (cursor.filters !== filters) {
        throw new BadRequestException({
          code: 'VALIDATION',
          message: 'Cursor does not match the requested filters',
        });
      }
      const next =
        params.order === 'asc'
          ? sql`${key.sql} > ${cursor.key}`
          : sql`${key.sql} < ${cursor.key}`;
      conditions.push(
        sql`(${next} OR (${key.sql} = ${cursor.key} AND ${todos.id} > ${cursor.id}::uuid))`,
      );
    }

    // The page and its dependencies come back together, one query, one
    // snapshot: `blocked`/`blockedBy` can no longer reflect a different instant
    // than the rows themselves (ticket 10).
    const rows = await this.dbService.db
      .select({
        ...getTableColumns(todos),
        dependencies: dependencyRefsJson(sql`${todos.id}`),
      })
      .from(todos)
      .where(and(...conditions))
      .orderBy(
        params.order === 'asc' ? asc(key.sql) : desc(key.sql),
        asc(todos.id),
      )
      .limit(params.limit + 1);

    const hasMore = rows.length > params.limit;
    const page = hasMore ? rows.slice(0, params.limit) : rows;
    const last = page.at(-1);

    return {
      todos: page.map((row) =>
        toTodo(row, parseDependencyRefs(row.dependencies)),
      ),
      nextCursor:
        hasMore && last
          ? encodeCursor({
              key: key.valueOf(last),
              id: last.id,
              sort: params.sort,
              order: params.order,
              filters,
            })
          : null,
    };
  }

  /**
   * The dependency picker's search: live TODOs whose name **starts with**
   * `term`, case-insensitively and literally (a `%` or `_` is not a wildcard),
   * name-ordered and capped. Served by the `todos_name_prefix_idx` btree index.
   * Discovery only — cycles, the fan-out cap and duplicates stay the
   * add-dependency path's job.
   */
  async search(term: string): Promise<TodoRef[]> {
    const escaped = term
      .toLowerCase()
      .replace(/[\\%_]/g, (char) => `\\${char}`);
    const rows = await this.dbService.db
      .select({ id: todos.id, name: todos.name, status: todos.status })
      .from(todos)
      .where(
        and(
          isNull(todos.deletedAt),
          sql`lower(${todos.name}) like ${`${escaped}%`}`,
        ),
      )
      .orderBy(asc(todos.name), asc(todos.id))
      .limit(SEARCH_RESULT_LIMIT);
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      status: row.status as TodoStatus,
    }));
  }

  async getById(id: string, includeDeleted = false): Promise<Todo> {
    const [row] = await this.dbService.db
      .select()
      .from(todos)
      .where(and(eq(todos.id, id), visible(includeDeleted)))
      .limit(1);
    if (!row) {
      notFound();
    }
    return this.serializeOne(row);
  }

  async update(id: string, input: UpdateTodoInput): Promise<Todo> {
    const changes: {
      name?: string;
      description?: string | null;
      dueDate?: string | null;
      priority?: TodoPriority;
      recurrence?: RecurrenceRule | null;
      seriesId?: string;
    } = {};
    if (input.name !== undefined) changes.name = input.name;
    if (input.description !== undefined)
      changes.description = input.description;
    if (input.dueDate !== undefined) changes.dueDate = input.dueDate;
    if (input.priority !== undefined) changes.priority = input.priority;
    if (input.recurrence !== undefined) changes.recurrence = input.recurrence;

    if (input.recurrence !== undefined) {
      const [current] = await this.dbService.db
        .select({
          completedAt: todos.completedAt,
          seriesId: todos.seriesId,
          recurrence: todos.recurrence,
        })
        .from(todos)
        .where(and(eq(todos.id, id), isNull(todos.deletedAt)))
        .limit(1);

      // A completed TODO (Completed, or Archived after completion) has an
      // immutable rule: its successor already spawned from the old rule, so
      // adding, changing or removing it would be inert. An unchanged echo is
      // fine — the web form sends every field on save. Missing/Deleted falls
      // through to the guarded update, which resolves it to 404.
      const changesRule =
        !!current && !isDeepStrictEqual(current.recurrence, input.recurrence);
      if (current?.completedAt && changesRule) {
        recurrenceOnCompleted();
      }

      // A TODO that gains a rule for the first time joins (or starts) a series.
      if (input.recurrence && current && !current.seriesId) {
        changes.seriesId = crypto.randomUUID();
      }
    }

    return this.serializeOne(
      await withVersionGuard(this.dbService.db, id, input.version, changes),
    );
  }

  async transition(id: string, input: TransitionTodoInput): Promise<Todo> {
    const gate = input.status === 'IN_PROGRESS' || input.status === 'COMPLETED';

    // Check and write share one transaction. A transition that reads the graph
    // — the gate, or a cascade over the dependents — takes the graph lock, so a
    // concurrent dependency edit or a concurrent start/reopen cannot slip
    // between the read and the write.
    const updated = await this.dbService.db.transaction(async (tx) => {
      const current = await this.liveRow(tx, id);
      if (current.version !== input.version) {
        conflict(current.version);
      }
      if (current.status === input.status) {
        return current;
      }

      const cascades = removesSatisfaction(current.completedAt, input.status);
      if (gate || cascades) {
        await tx.execute(sql`select pg_advisory_xact_lock(${GRAPH_LOCK_KEY})`);
      }

      if (gate) {
        const dependencies = (await dependencyMap(tx, [id])).get(id) ?? [];
        const unsatisfied = unsatisfiedRefs(dependencies);
        if (unsatisfied.length > 0) {
          blocked(unsatisfied);
        }
      }

      // Completing a recurring occurrence spawns exactly one successor, once per
      // occurrence (ADR 0007). The marker is set in the same write, so reopening
      // and re-completing cannot fork the series.
      const willSpawn =
        input.status === 'COMPLETED' &&
        current.recurrence !== null &&
        current.spawnedAt === null;

      const row = await withVersionGuard(tx, id, input.version, {
        status: input.status,
        completedAt: nextCompletedAt(input.status, current.completedAt),
        ...(willSpawn ? { spawnedAt: new Date() } : {}),
      });

      if (willSpawn) {
        await this.spawnNext(tx, row, id);
      }

      // Leaving a Satisfied state restores the invariant: started dependents
      // are pulled back to Not Started, transitively (ADR 0004).
      if (cascades) {
        await applyReopenCascade(tx, id);
      }

      return row;
    });

    return this.serializeOne(updated);
  }

  /**
   * The next due date a completion *now* would schedule, computed by the same
   * path as `spawnNext` (including the after-completion dedup guard) so the UI
   * hint cannot disagree with the write. `from` defaults to today and exists so
   * tests are not wall-clock dependent.
   */
  async nextOccurrencePreview(
    id: string,
    from?: string,
  ): Promise<NextOccurrencePreview> {
    const current = await this.liveRow(this.dbService.db, id);
    // Not recurring, or already spawned its successor: completing it writes no
    // next occurrence, so there is nothing to preview.
    if (!current.recurrence || current.spawnedAt !== null) {
      return { nextDueDate: null, skipsAhead: false };
    }
    const rule = current.recurrence;
    const completionDate = from ?? new Date().toISOString().slice(0, 10);
    const naive = nextOccurrence(rule, completionDate, current.dueDate);
    const nextDueDate = await this.uniqueDueDate(
      this.dbService.db,
      rule,
      naive,
      current.seriesId,
    );
    return { nextDueDate, skipsAhead: nextDueDate !== naive };
  }

  /**
   * The dry run behind the UI's confirmation: the TODOs a transition to `to`
   * would cascade, computed by the same rule the cascade applies. Transitions
   * that do not remove this TODO's satisfaction return an empty set.
   */
  async transitionImpact(
    id: string,
    to: TodoStatus,
  ): Promise<TransitionImpact> {
    const current = await this.liveRow(this.dbService.db, id);
    if (!removesSatisfaction(current.completedAt, to)) {
      return { affected: [], total: 0 };
    }
    return cascadeTargets(this.dbService.db, id);
  }

  /** The live (not Deleted) row, or 404. */
  private async liveRow(db: Database, id: string): Promise<TodoRow> {
    const [row] = await db
      .select()
      .from(todos)
      .where(and(eq(todos.id, id), isNull(todos.deletedAt)))
      .limit(1);
    if (!row) {
      notFound();
    }
    return row;
  }

  /**
   * Clones a completed occurrence into the next one: the rule, name,
   * description, Priority and dependencies outside the series carry over; the
   * Status, completion time and in-series dependencies do not. The next due
   * date is generated per the rule's mode (ADR 0007).
   */
  private async spawnNext(
    tx: Database,
    occurrence: TodoRow,
    occurrenceId: string,
  ): Promise<void> {
    const rule = occurrence.recurrence as RecurrenceRule;
    const completionDate = (occurrence.completedAt ?? new Date())
      .toISOString()
      .slice(0, 10);
    const dueDate = await this.uniqueDueDate(
      tx,
      rule,
      nextOccurrence(rule, completionDate, occurrence.dueDate),
      occurrence.seriesId,
    );

    const [next] = await tx
      .insert(todos)
      .values({
        name: occurrence.name,
        description: occurrence.description,
        dueDate,
        priority: occurrence.priority as TodoPriority,
        status: 'NOT_STARTED',
        recurrence: rule,
        seriesId: occurrence.seriesId,
      })
      .returning({ id: todos.id });

    if (!next || !occurrence.seriesId) {
      return;
    }

    const edges = await tx
      .select({ dependencyId: todoDependencies.dependencyId })
      .from(todoDependencies)
      .innerJoin(todos, eq(todos.id, todoDependencies.dependencyId))
      .where(
        and(
          eq(todoDependencies.dependentId, occurrenceId),
          sql`${todos.seriesId} is distinct from ${occurrence.seriesId}`,
          isNull(todos.deletedAt),
        ),
      );

    if (edges.length > 0) {
      await tx
        .insert(todoDependencies)
        .values(
          edges.map((edge) => ({
            dependentId: next.id,
            dependencyId: edge.dependencyId,
          })),
        )
        .onConflictDoNothing();
    }
  }

  /**
   * The next due date a completion would schedule, made free of the series.
   * The dedup rule itself is `nextFreeDueDate` in the recurrence module; this
   * reads the series' live dates it is applied to.
   */
  private async uniqueDueDate(
    tx: Database,
    rule: RecurrenceRule,
    candidate: string,
    seriesId: string | null,
  ): Promise<string> {
    if (rule.mode !== 'AFTER_COMPLETION' || !seriesId) {
      return candidate;
    }
    const rows = await tx
      .select({ dueDate: todos.dueDate })
      .from(todos)
      .where(and(eq(todos.seriesId, seriesId), isNull(todos.deletedAt)));
    const taken = new Set(
      rows.map((row) => row.dueDate).filter((date): date is string => !!date),
    );
    return nextFreeDueDate(rule, candidate, taken);
  }

  async addDependency(id: string, dependsOn: string): Promise<Todo> {
    if (id === dependsOn) {
      cycle();
    }

    await this.dbService.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(${GRAPH_LOCK_KEY})`);

      const dependent = await this.liveRow(tx, id);
      const [dependency] = await tx
        .select({
          ...getTableColumns(todos),
          satisfied: satisfied('todos'),
        })
        .from(todos)
        .where(and(eq(todos.id, dependsOn), isNull(todos.deletedAt)))
        .limit(1);
      if (!dependency) {
        notFound();
      }

      // Fan-out cap: bound how many dependencies one TODO declares, so every
      // row's dependencies/blockedBy payload stays small. The edge being added
      // is excluded so re-adding an existing dependency stays a no-op.
      const counted = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(todoDependencies)
        .where(
          and(
            eq(todoDependencies.dependentId, id),
            ne(todoDependencies.dependencyId, dependsOn),
          ),
        );
      if ((counted[0]?.count ?? 0) >= MAX_DEPENDENCIES_PER_TODO) {
        dependencyLimit(MAX_DEPENDENCIES_PER_TODO);
      }

      const reach: { rows: unknown[] } = await tx.execute(sql`
        with recursive reach(node) as (
          select dependency_id from todo_dependencies where dependent_id = ${dependsOn}
          union
          select d.dependency_id
          from todo_dependencies d
          join reach r on d.dependent_id = r.node
        )
        select 1 from reach where node = ${id} limit 1
      `);
      if (reach.rows.length > 0) {
        cycle();
      }

      // Adding an unmet requirement to a TODO already In Progress would leave
      // it Blocked with no transition to cascade (ADR 0004). The dependency's
      // satisfaction comes from the shared predicate in the read above.
      if (dependent.status === 'IN_PROGRESS' && !dependency.satisfied) {
        blocked(
          unsatisfiedRefs([
            {
              id: dependency.id,
              name: dependency.name,
              status: dependency.status as TodoStatus,
              satisfied: false,
            },
          ]),
        );
      }

      await tx
        .insert(todoDependencies)
        .values({ dependentId: id, dependencyId: dependsOn })
        .onConflictDoNothing();
    });

    return this.getById(id);
  }

  async removeDependency(id: string, dependencyId: string): Promise<Todo> {
    // Removing an edge cannot create a cycle, so no graph lock is needed.
    await this.dbService.db.transaction(async (tx) => {
      await this.requireLive(tx, id);
      await tx
        .delete(todoDependencies)
        .where(
          and(
            eq(todoDependencies.dependentId, id),
            eq(todoDependencies.dependencyId, dependencyId),
          ),
        );
    });

    return this.getById(id);
  }

  /**
   * Deletion is permanent to the user (ADR 0005): the row is retained only as an
   * audit tombstone, and the TODO stops being a Dependency of or on anything, so
   * its dependents unblock. It is optimistic like every other write: a stale
   * `version` is rejected, so a UI cannot delete a row someone else just changed.
   * Removing edges is a graph write, so it takes the graph lock.
   */
  async delete(id: string, version: number): Promise<void> {
    await this.dbService.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(${GRAPH_LOCK_KEY})`);

      await withVersionGuard(tx, id, version, { deletedAt: new Date() });

      await tx
        .delete(todoDependencies)
        .where(
          or(
            eq(todoDependencies.dependentId, id),
            eq(todoDependencies.dependencyId, id),
          ),
        );
    });
  }

  /**
   * The delete-side dry run: the live dependents whose last unmet Dependency is
   * `id`, so deleting it unblocks them. Mirrors the delete's edge removal.
   */
  async deleteImpact(id: string): Promise<DeleteImpact> {
    await this.liveRow(this.dbService.db, id);
    return DeleteImpact.parse(
      await dependentsUnblockedBy(this.dbService.db, id),
    );
  }

  /** Throws 404 unless the TODO exists and is not Deleted. */
  private async requireLive(db: Database, id: string): Promise<void> {
    await this.liveRow(db, id);
  }

  private async serializeOne(row: TodoRow): Promise<Todo> {
    const byId = await dependencyMap(this.dbService.db, [row.id]);
    return toTodo(row, byId.get(row.id) ?? []);
  }
}

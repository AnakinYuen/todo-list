import { and, eq, inArray, isNull, sql, type SQL } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { z } from 'zod';
import { TodoRef, TodoStatus } from '@todo-list/shared';
import * as schema from '../db/schema';
import { todoDependencies, todos } from '../db/schema';

export type Database =
  | NodePgDatabase<typeof schema>
  | Parameters<Parameters<NodePgDatabase<typeof schema>['transaction']>[0]>[0];

/** A dependency reference plus whether it currently satisfies the dependency. */
export type DependencyRef = TodoRef & { satisfied: boolean };

/**
 * A single graph-wide advisory lock key. Dependency-edge mutations take it so
 * the reachability check and the insert are atomic (ADR 0003).
 */
export const GRAPH_LOCK_KEY = 0x544f444f; // 'TODO'

/**
 * The **one** definition of a Satisfied Dependency (CONTEXT.md): its target is
 * completed and not Deleted. Written as SQL — never re-expressed in TypeScript —
 * so the `blocked` filter and the dependency read cannot drift; `unsatisfied` is
 * simply its negation at the call site. `alias` names the `todos` join the
 * predicate applies to.
 */
export function satisfied(alias: string): SQL<boolean> {
  const target = sql.identifier(alias);
  return sql<boolean>`(${target}.completed_at is not null and ${target}.deleted_at is null)`;
}

/** SQL predicate: the row has at least one unsatisfied dependency. */
export function hasUnsatisfiedDependency(): SQL {
  return sql`exists (
    select 1
    from todo_dependencies d
    join todos dep on dep.id = d.dependency_id
    where d.dependent_id = ${todos.id}
      and dep.deleted_at is null
      and (not ${satisfied('dep')})
  )`;
}

const DependencyRefJson = TodoRef.extend({ satisfied: z.boolean() });

const DependencyRefsJson = z.array(DependencyRefJson);

/**
 * The dependencies of each dependent, as a JSON array carrying the shared
 * `satisfied` flag, so a page can be read in one query with one snapshot. Used
 * inside the list `SELECT`; parse the result with `parseDependencyRefs`.
 *
 * An edge whose target was Deleted out of band is ignored — deletion removes
 * edges, so the row reads as if the edge were gone, matching `satisfied`.
 */
export function dependencyRefsJson(dependentId: SQL): SQL {
  return sql`(
    select coalesce(
      json_agg(
        json_build_object(
          'id', dep.id,
          'name', dep.name,
          'status', dep.status,
          'satisfied', ${satisfied('dep')}
        )
        order by dep.name, dep.id
      ),
      '[]'::json
    )
    from todo_dependencies d
    join todos dep on dep.id = d.dependency_id
    where d.dependent_id = ${dependentId}
      and dep.deleted_at is null
  )`;
}

/** Validates the JSON a list read aggregated for one TODO's dependencies. */
export function parseDependencyRefs(value: unknown): DependencyRef[] {
  return DependencyRefsJson.parse(value);
}

/**
 * Every dependency of each of `ids`, keyed by dependent id, ordered like the
 * list aggregate so a single read and a page agree, with satisfaction computed
 * by the shared predicate. Archiving a completed dependency keeps it satisfied
 * (ADR 0002).
 */
export async function dependencyMap(
  db: Database,
  ids: string[],
): Promise<Map<string, DependencyRef[]>> {
  const map = new Map<string, DependencyRef[]>();
  if (ids.length === 0) {
    return map;
  }

  const rows = await db
    .select({
      dependentId: todoDependencies.dependentId,
      id: todos.id,
      name: todos.name,
      status: todos.status,
      satisfied: satisfied('todos'),
    })
    .from(todoDependencies)
    .innerJoin(todos, eq(todos.id, todoDependencies.dependencyId))
    .where(
      and(inArray(todoDependencies.dependentId, ids), isNull(todos.deletedAt)),
    )
    .orderBy(todos.name, todos.id);

  for (const row of rows) {
    const list = map.get(row.dependentId) ?? [];
    list.push({
      id: row.id,
      name: row.name,
      status: row.status as TodoStatus,
      satisfied: row.satisfied,
    });
    map.set(row.dependentId, list);
  }
  return map;
}

/** The unsatisfied subset, mapped to references for a `blockedBy` payload. */
export function unsatisfiedRefs(dependencies: DependencyRef[]): TodoRef[] {
  return dependencies
    .filter((dependency) => !dependency.satisfied)
    .map(({ id, name, status }) => ({ id, name, status }));
}

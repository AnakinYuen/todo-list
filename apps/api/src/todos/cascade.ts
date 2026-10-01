import { sql } from 'drizzle-orm';
import type {
  TodoRef,
  TodoStatus,
  TransitionImpactEntry,
} from '@todo-list/shared';
import { satisfied, type Database } from './dependencies';

/**
 * The graph effects a Dependency edit has on other TODOs: the reopen cascade
 * when a Satisfied TODO leaves that state (ADR 0004), and the delete impact when
 * an edge is removed (ADR 0005). Each preview reads the same rule its write
 * applies, so a dry run cannot disagree with the outcome.
 */

/**
 * The invariant from ADR 0004: a TODO may be In Progress only while every
 * dependency is Satisfied. A transition that takes a Satisfied TODO
 * (`completedAt` set) to an active Status removes that satisfaction, so its
 * started dependents have to go back to Not Started. Reopening a completed
 * TODO is the common case; un-archiving a completed one does the same.
 */
export function removesSatisfaction(
  completedAt: Date | null,
  to: TodoStatus,
): boolean {
  return completedAt !== null && (to === 'IN_PROGRESS' || to === 'NOT_STARTED');
}

/**
 * The dependents a transition must revert: the In Progress, live TODOs reachable
 * from `dependencyId` *through other reverted TODOs*. A Completed dependent
 * stays Completed and keeps satisfying its own dependents, so the walk stops
 * there rather than tainting everything downstream. `UNION` (not `UNION ALL`)
 * de-duplicates, so a cycle already in the data still terminates.
 *
 * This is the single definition of "who cascades": both the impact read and the
 * write below are built from it, so the preview cannot disagree with the outcome.
 */
function affectedBy(dependencyId: string) {
  return sql`
    with recursive affected(id) as (
      select d.dependent_id
      from todo_dependencies d
      join todos t on t.id = d.dependent_id
      where d.dependency_id = ${dependencyId}
        and t.status = 'IN_PROGRESS'
        and t.deleted_at is null
      union
      select d.dependent_id
      from todo_dependencies d
      join affected a on d.dependency_id = a.id
      join todos t on t.id = d.dependent_id
      where t.status = 'IN_PROGRESS'
        and t.deleted_at is null
    )
  `;
}

/**
 * Both callers filter the walk to In Progress rows, so the only move it can
 * describe is In Progress -> Not Started.
 */
function asImpact(row: Record<string, unknown>): TransitionImpactEntry {
  return {
    id: row.id as string,
    name: row.name as string,
    from: 'IN_PROGRESS',
    to: 'NOT_STARTED',
  };
}

/** How many affected rows a preview returns; `total` carries the full count. */
export const IMPACT_PREVIEW_LIMIT = 3;

/**
 * The TODOs a transition of `dependencyId` would cascade, read-only: a capped,
 * name-ordered preview plus the full count, both from the same walk.
 */
export async function cascadeTargets(
  db: Database,
  dependencyId: string,
): Promise<{ affected: TransitionImpactEntry[]; total: number }> {
  const result = await db.execute(sql`
    ${affectedBy(dependencyId)}
    select t.id, t.name, count(*) over () as total
    from affected a
    join todos t on t.id = a.id
    order by t.name, t.id
    limit ${IMPACT_PREVIEW_LIMIT}
  `);
  return {
    affected: result.rows.map(asImpact),
    total: Number(result.rows[0]?.total ?? 0),
  };
}

/**
 * Moves every cascade target back to Not Started, bumping its version so a
 * concurrent edit of one returns 409.
 */
export async function applyReopenCascade(
  db: Database,
  dependencyId: string,
): Promise<void> {
  await db.execute(sql`
    ${affectedBy(dependencyId)}
    update todos
    set status = 'NOT_STARTED',
        completed_at = null,
        version = todos.version + 1,
        updated_at = now()
    where todos.id in (select id from affected)
  `);
}

/**
 * The live dependents whose **last** unmet Dependency is `dependencyId`, so
 * deleting it unblocks them: the delete-side counterpart of ADR 0004's
 * transition impact. Built from the shared `satisfied` predicate, so the
 * preview cannot disagree with what deleting actually unblocks. A target
 * Deleted out of band is ignored, like every other read.
 */
export async function dependentsUnblockedBy(
  db: Database,
  dependencyId: string,
): Promise<{ unblocked: TodoRef[]; total: number }> {
  const result = await db.execute(sql`
    select t.id, t.name, t.status, count(*) over () as total
    from todo_dependencies d
    join todos t on t.id = d.dependent_id
    join todos p on p.id = d.dependency_id
    where d.dependency_id = ${dependencyId}
      and t.deleted_at is null
      and (not ${satisfied('p')})
      and not exists (
        select 1
        from todo_dependencies d2
        join todos dep on dep.id = d2.dependency_id
        where d2.dependent_id = t.id
          and d2.dependency_id <> ${dependencyId}
          and dep.deleted_at is null
          and (not ${satisfied('dep')})
      )
    order by t.name, t.id
    limit ${IMPACT_PREVIEW_LIMIT}
  `);
  return {
    unblocked: result.rows.map((row) => ({
      id: row.id as string,
      name: row.name as string,
      status: row.status as TodoStatus,
    })),
    total: Number(result.rows[0]?.total ?? 0),
  };
}

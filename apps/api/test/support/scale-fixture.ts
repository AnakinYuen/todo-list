import type { Pool } from 'pg';
import { MAX_DEPENDENCIES_PER_TODO } from '@todo-list/shared';

/** The seeded list size the scale suite and benchmark share. */
export const SCALE_SIZE = 10_000;

/** How many TODOs depend on the single supernode. */
export const SUPERNODE_DEPENDENTS = 2_000;

/**
 * Seeds a deterministic ~10k list with a spread of Statuses, Priorities and due
 * dates, plus the two shapes ticket 10 cares about: one TODO with thousands of
 * dependents (in-degree), and one TODO at the dependency fan-out cap. Runs
 * `ANALYZE` so the planner sees real statistics. Idempotent — it starts empty.
 */
export async function seedScaleData(
  pool: Pool,
  size: number = SCALE_SIZE,
): Promise<void> {
  await pool.query('truncate table todos restart identity cascade');

  await pool.query(
    `insert into todos (name, description, status, priority, due_date, deleted_at)
     select
       'TODO ' || lpad(i::text, 6, '0'),
       'Generated for the scale suite #' || i,
       case
         when i % 100 = 0 then 'ARCHIVED'
         when i % 4 = 0 then 'COMPLETED'
         when i % 4 = 1 then 'IN_PROGRESS'
         else 'NOT_STARTED'
       end::todo_status,
       (array['LOW', 'MEDIUM', 'HIGH'])[1 + (i % 3)]::todo_priority,
       date '2027-01-01' + (i % 365),
       case when i % 50 = 0 then now() else null end
     from generate_series(1, $1) as i`,
    [size],
  );

  const supernode = await pool.query<{ id: string }>(
    `insert into todos (name, priority, status)
     values ('Supernode', 'HIGH', 'NOT_STARTED')
     returning id`,
  );
  const supernodeId = supernode.rows[0]?.id;
  if (!supernodeId) {
    throw new Error('scale seed: supernode insert returned no row');
  }

  await pool.query(
    `insert into todo_dependencies (dependent_id, dependency_id)
     select d.id, $1
     from todos d
     where d.name like 'TODO %' and d.deleted_at is null
     order by d.name
     limit $2`,
    [supernodeId, SUPERNODE_DEPENDENTS],
  );

  const hub = await pool.query<{ id: string }>(
    `insert into todos (name, priority, status)
     values ('Hub at the fan-out cap', 'MEDIUM', 'NOT_STARTED')
     returning id`,
  );
  const hubId = hub.rows[0]?.id;
  if (!hubId) {
    throw new Error('scale seed: hub insert returned no row');
  }

  await pool.query(
    `insert into todo_dependencies (dependent_id, dependency_id)
     select $1, p.id
     from (
       select id from todos
       where name like 'TODO %' and deleted_at is null
       order by name limit $2
     ) p`,
    [hubId, MAX_DEPENDENCIES_PER_TODO],
  );

  await pool.query('vacuum analyze todos');
  await pool.query('vacuum analyze todo_dependencies');
}

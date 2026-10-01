import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { MAX_DEPENDENCIES_PER_TODO } from '@todo-list/shared';
import { todos } from '../../src/db/schema';
import {
  dependencyRefsJson,
  hasUnsatisfiedDependency,
} from '../../src/todos/dependencies';
import { createTestHarness, type TestHarness } from '../support/harness';
import { seedScaleData, SUPERNODE_DEPENDENTS } from '../support/scale-fixture';

interface PlanNode {
  'Node Type': string;
  'Relation Name'?: string;
  'Index Name'?: string;
  Plans?: PlanNode[];
}

let harness: TestHarness;
let supernodeId: string;
let hubId: string;

beforeAll(async () => {
  harness = await createTestHarness();
  await seedScaleData(harness.db.pool);

  const supernode = await harness.db.pool.query<{ id: string }>(
    `select id from todos where name = 'Supernode'`,
  );
  supernodeId = supernode.rows[0]?.id ?? '';
  const hub = await harness.db.pool.query<{ id: string }>(
    `select id from todos where name = 'Hub at the fan-out cap'`,
  );
  hubId = hub.rows[0]?.id ?? '';
});

afterAll(async () => {
  await harness?.close();
});

async function get(url: string) {
  const response = await harness.app.inject({ method: 'GET', url });
  expect(response.statusCode).toBe(200);
  return response.json();
}

/** Every plan node, flattened depth-first. */
function flatten(node: PlanNode): PlanNode[] {
  return [node, ...(node.Plans ?? []).flatMap(flatten)];
}

async function explain(sql: string, params: unknown[]): Promise<PlanNode[]> {
  const result = await harness.db.pool.query<{
    'QUERY PLAN': Array<{ Plan: PlanNode }>;
  }>(`explain (format json) ${sql}`, params);
  const plan = result.rows[0]?.['QUERY PLAN']?.[0]?.Plan;
  return plan ? flatten(plan) : [];
}

const edgeIndex = 'todo_dependencies_dependent_id_dependency_id_pk';

/** Assert a relation is reached through an index, never a sequential scan. */
function expectIndexAccess(nodes: PlanNode[], relation: string): void {
  const relationNodes = nodes.filter(
    (node) => node['Relation Name'] === relation,
  );
  expect(relationNodes.length).toBeGreaterThan(0);
  expect(relationNodes.some((node) => node['Node Type'] === 'Seq Scan')).toBe(
    false,
  );
}

describe('scale: read paths stay indexed and bounded', () => {
  it('reads a page and its dependencies in a single query', async () => {
    const { count } = await harness.countQueries(() =>
      get('/api/todos?limit=20'),
    );

    expect(count).toBe(1);
  });

  it('keeps the query count bounded as the page size grows', async () => {
    const small = await harness.countQueries(() => get('/api/todos?limit=1'));
    const large = await harness.countQueries(() => get('/api/todos?limit=100'));

    expect(large.count).toBe(small.count);
  });

  it('uses the edge index for the blocked filter, never a sequential scan', async () => {
    // Built from the production predicate, so a change to the rule is exercised.
    const query = harness.db.db
      .select({ one: sql<number>`1` })
      .from(todos)
      .where(and(eq(todos.id, hubId), hasUnsatisfiedDependency()));
    const { sql: text, params } = query.toSQL();

    const nodes = await explain(text, params);

    expect(nodes.some((node) => node['Index Name'] === edgeIndex)).toBe(true);
    expectIndexAccess(nodes, 'todo_dependencies');
  });

  it('uses the edge index for the dependency read, never a sequential scan', async () => {
    // The exact aggregate the list read embeds, so it cannot drift.
    const query = harness.db.db
      .select({
        id: todos.id,
        dependencies: dependencyRefsJson(sql`${todos.id}`),
      })
      .from(todos)
      .where(eq(todos.id, hubId));
    const { sql: text, params } = query.toSQL();

    const nodes = await explain(text, params);

    expect(nodes.some((node) => node['Index Name'] === edgeIndex)).toBe(true);
    expectIndexAccess(nodes, 'todo_dependencies');
  });

  it('uses the status index for a selective Status filter', async () => {
    const nodes = await explain(
      `select id from todos
       where status = 'ARCHIVED' and deleted_at is null`,
      [],
    );

    expect(
      nodes.some((node) => node['Index Name'] === 'todos_status_idx'),
    ).toBe(true);
    expect(nodes.some((node) => node['Node Type'] === 'Seq Scan')).toBe(false);
  });

  it('uses the due-date index for a selective due-date range', async () => {
    const nodes = await explain(
      `select id from todos
       where due_date between $1 and $2
         and deleted_at is null`,
      ['2027-01-01', '2027-01-03'],
    );

    expect(
      nodes.some((node) => node['Index Name'] === 'todos_due_date_idx'),
    ).toBe(true);
    expect(nodes.some((node) => node['Node Type'] === 'Seq Scan')).toBe(false);
  });

  it('uses the prefix index for a name search, never a sequential scan', async () => {
    // The dependency-picker search shape: a lowercased, literal prefix.
    const query = harness.db.db
      .select({ id: todos.id })
      .from(todos)
      .where(
        and(
          isNull(todos.deletedAt),
          sql`lower(${todos.name}) like ${'todo 0099%'}`,
        ),
      )
      .limit(20);
    const { sql: text, params } = query.toSQL();

    const nodes = await explain(text, params);

    expect(
      nodes.some((node) => node['Index Name'] === 'todos_name_prefix_idx'),
    ).toBe(true);
    expectIndexAccess(nodes, 'todos');
  });
});

describe('scale: supernodes degrade gracefully', () => {
  it('returns a supernode and its dependents without enumerating them', async () => {
    const supernode = await get(`/api/todos/${supernodeId}`);

    expect(supernode).toMatchObject({ name: 'Supernode', dependencies: [] });
  });

  it('reads a dependent of the supernode with its single blocker', async () => {
    const solo = await harness.db.pool.query<{ id: string }>(
      `select d.dependent_id as id
       from todo_dependencies d
       where d.dependency_id = $1
         and not exists (
           select 1 from todo_dependencies other
           where other.dependent_id = d.dependent_id
             and other.dependency_id <> $1
         )
       limit 1`,
      [supernodeId],
    );
    const soloId = solo.rows[0]?.id ?? '';

    const dependent = await get(`/api/todos/${soloId}`);

    expect(dependent.blocked).toBe(true);
    expect(dependent.blockedBy).toEqual([
      expect.objectContaining({ id: supernodeId }),
    ]);
  });

  it('caps the dependencies a row can carry at the fan-out limit', async () => {
    const hub = await get(`/api/todos/${hubId}`);

    expect(hub.dependencies).toHaveLength(MAX_DEPENDENCIES_PER_TODO);
    expect(hub.blockedBy.length).toBeLessThanOrEqual(MAX_DEPENDENCIES_PER_TODO);
  });

  it('caps the delete impact of a supernode and reports the true total', async () => {
    const impact = await get(`/api/todos/${supernodeId}/delete-impact`);

    expect(impact.unblocked).toHaveLength(3);
    expect(impact.total).toBe(SUPERNODE_DEPENDENTS);
  });
});

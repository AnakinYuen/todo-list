import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MAX_DEPENDENCIES_PER_TODO } from '@todo-list/shared';
import { createTestHarness, type TestHarness } from './support/harness';

let harness: TestHarness;

const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';

beforeAll(async () => {
  harness = await createTestHarness();
});

afterAll(async () => {
  await harness?.close();
});

beforeEach(async () => {
  await harness.reset();
});

async function createTodo(payload: Record<string, unknown>) {
  const response = await harness.app.inject({
    method: 'POST',
    url: '/api/todos',
    payload,
  });
  expect(response.statusCode).toBe(201);
  return response.json();
}

async function getTodo(id: string) {
  const response = await harness.app.inject({
    method: 'GET',
    url: `/api/todos/${id}`,
  });
  expect(response.statusCode).toBe(200);
  return response.json();
}

function addDependency(id: string, dependsOn: string) {
  return harness.app.inject({
    method: 'POST',
    url: `/api/todos/${id}/dependencies`,
    payload: { dependsOn },
  });
}

function removeDependency(id: string, dependencyId: string) {
  return harness.app.inject({
    method: 'DELETE',
    url: `/api/todos/${id}/dependencies/${dependencyId}`,
  });
}

function transition(id: string, status: string, version: number) {
  return harness.app.inject({
    method: 'POST',
    url: `/api/todos/${id}/transitions`,
    payload: { status, version },
  });
}

function listBlocked(blocked: boolean) {
  return harness.app.inject({
    method: 'GET',
    url: `/api/todos?blocked=${blocked}`,
  });
}

describe('todos: dependencies (HTTP seam)', () => {
  it('adds a dependency and reports the dependent as Blocked', async () => {
    const dependent = await createTodo({ name: 'Ship it' });
    const dependency = await createTodo({ name: 'Get approval' });

    const response = await addDependency(dependent.id, dependency.id);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      blocked: true,
      blockedBy: [{ id: dependency.id, name: 'Get approval' }],
    });
  });

  it('removing a dependency unblocks the dependent', async () => {
    const dependent = await createTodo({ name: 'Ship it' });
    const dependency = await createTodo({ name: 'Get approval' });
    await addDependency(dependent.id, dependency.id);

    const removed = await removeDependency(dependent.id, dependency.id);

    expect(removed.statusCode).toBe(200);
    expect(removed.json()).toMatchObject({ blocked: false, blockedBy: [] });
  });

  it('adding the same dependency twice does not duplicate it', async () => {
    const dependent = await createTodo({ name: 'Ship it' });
    const dependency = await createTodo({ name: 'Get approval' });
    await addDependency(dependent.id, dependency.id);

    const again = await addDependency(dependent.id, dependency.id);

    expect(again.statusCode).toBe(200);
    expect(again.json().blockedBy).toHaveLength(1);
  });

  it('rejects a self-dependency', async () => {
    const todo = await createTodo({ name: 'Loop' });

    const response = await addDependency(todo.id, todo.id);

    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({ code: 'CYCLE_DETECTED' });
  });

  it('rejects an indirect cycle', async () => {
    const a = await createTodo({ name: 'A' });
    const b = await createTodo({ name: 'B' });
    const c = await createTodo({ name: 'C' });
    await addDependency(a.id, b.id);
    await addDependency(b.id, c.id);

    const response = await addDependency(c.id, a.id);

    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({ code: 'CYCLE_DETECTED' });
  });

  it('rejects depending on an unknown TODO', async () => {
    const todo = await createTodo({ name: 'A' });

    const response = await addDependency(todo.id, UNKNOWN_ID);

    expect(response.statusCode).toBe(404);
  });

  it('blocks starting and completing a Blocked TODO', async () => {
    const dependent = await createTodo({ name: 'Ship it' });
    const dependency = await createTodo({ name: 'Get approval' });
    await addDependency(dependent.id, dependency.id);

    const start = await transition(dependent.id, 'IN_PROGRESS', 1);
    expect(start.statusCode).toBe(422);
    expect(start.json()).toMatchObject({
      code: 'BLOCKED_BY_DEPENDENCIES',
      blockedBy: [{ id: dependency.id, name: 'Get approval' }],
    });

    const complete = await transition(dependent.id, 'COMPLETED', 1);
    expect(complete.statusCode).toBe(422);
  });

  it('unblocks once the dependency is completed', async () => {
    const dependent = await createTodo({ name: 'Ship it' });
    const dependency = await createTodo({ name: 'Get approval' });
    await addDependency(dependent.id, dependency.id);
    await transition(dependency.id, 'COMPLETED', 1);

    expect((await getTodo(dependent.id)).blocked).toBe(false);
    const start = await transition(dependent.id, 'IN_PROGRESS', 1);
    expect(start.statusCode).toBe(200);
  });

  it('keeps a dependency satisfied when it is later archived', async () => {
    const dependent = await createTodo({ name: 'Ship it' });
    const dependency = await createTodo({ name: 'Get approval' });
    await addDependency(dependent.id, dependency.id);
    const completed = await transition(dependency.id, 'COMPLETED', 1);
    await transition(dependency.id, 'ARCHIVED', completed.json().version);

    expect((await getTodo(dependent.id)).blocked).toBe(false);
  });

  it('deleting a dependency removes the edge and unblocks the dependent', async () => {
    const dependent = await createTodo({ name: 'Ship it' });
    const dependency = await createTodo({ name: 'Get approval' });
    await addDependency(dependent.id, dependency.id);
    await harness.app.inject({
      method: 'DELETE',
      url: `/api/todos/${dependency.id}?version=${dependency.version}`,
    });

    const updated = await getTodo(dependent.id);
    expect(updated.blocked).toBe(false);
    expect(updated.dependencies).toEqual([]);
  });

  it('refuses to add an unsatisfied dependency to an In Progress TODO', async () => {
    const dependent = await createTodo({ name: 'Ship it' });
    const dependency = await createTodo({ name: 'Get approval' });
    await transition(dependent.id, 'IN_PROGRESS', dependent.version);

    const response = await addDependency(dependent.id, dependency.id);

    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({
      code: 'BLOCKED_BY_DEPENDENCIES',
      blockedBy: [{ id: dependency.id, name: 'Get approval' }],
    });
    const unchanged = await getTodo(dependent.id);
    expect(unchanged.status).toBe('IN_PROGRESS');
    expect(unchanged.blocked).toBe(false);
    expect(unchanged.dependencies).toHaveLength(0);
  });

  it('adds a satisfied dependency to an In Progress TODO', async () => {
    const dependent = await createTodo({ name: 'Ship it' });
    const dependency = await createTodo({ name: 'Get approval' });
    await transition(dependent.id, 'IN_PROGRESS', dependent.version);
    await transition(dependency.id, 'COMPLETED', dependency.version);

    const response = await addDependency(dependent.id, dependency.id);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: 'IN_PROGRESS',
      blocked: false,
      blockedBy: [],
    });
  });

  it('adds an unsatisfied dependency to a Completed TODO (ADR 0004)', async () => {
    const dependent = await createTodo({
      name: 'Ship it',
      status: 'COMPLETED',
    });
    const dependency = await createTodo({ name: 'Get approval' });

    const response = await addDependency(dependent.id, dependency.id);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: 'COMPLETED',
      blocked: true,
    });
  });

  it('filters by blocked and unblocked', async () => {
    const blockedTodo = await createTodo({ name: 'Blocked' });
    const dependency = await createTodo({ name: 'Prerequisite' });
    await createTodo({ name: 'Free' });
    await addDependency(blockedTodo.id, dependency.id);

    const blockedPage = await listBlocked(true);
    expect(
      blockedPage.json().todos.map((t: { name: string }) => t.name),
    ).toEqual(['Blocked']);

    const unblockedPage = await listBlocked(false);
    expect(
      unblockedPage
        .json()
        .todos.map((t: { name: string }) => t.name)
        .sort(),
    ).toEqual(['Free', 'Prerequisite']);
  });

  it('caps the dependencies a single TODO may declare', async () => {
    const dependent = await createTodo({ name: 'Hub' });
    for (let i = 0; i < MAX_DEPENDENCIES_PER_TODO; i += 1) {
      const prerequisite = await createTodo({ name: `Prerequisite ${i}` });
      const added = await addDependency(dependent.id, prerequisite.id);
      expect(added.statusCode).toBe(200);
    }

    const extra = await createTodo({ name: 'One too many' });
    const response = await addDependency(dependent.id, extra.id);

    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({ code: 'DEPENDENCY_LIMIT' });
  });
});

describe('todos: archived dependencies (HTTP seam)', () => {
  async function dependentWithPrerequisite() {
    const dependent = await createTodo({ name: 'Ship it' });
    const dependency = await createTodo({ name: 'Get approval' });
    await addDependency(dependent.id, dependency.id);
    return { dependent, dependency };
  }

  it('keeps a dependent Blocked when its dependency is Archived before completion', async () => {
    const { dependent, dependency } = await dependentWithPrerequisite();

    const archived = await transition(
      dependency.id,
      'ARCHIVED',
      dependency.version,
    );
    expect(archived.statusCode).toBe(200);
    expect(archived.json()).toMatchObject({
      status: 'ARCHIVED',
      completedAt: null,
    });

    const blocked = await getTodo(dependent.id);
    expect(blocked.blocked).toBe(true);
    expect(blocked.blockedBy).toEqual([
      expect.objectContaining({ id: dependency.id, name: 'Get approval' }),
    ]);

    const start = await transition(dependent.id, 'IN_PROGRESS', 1);
    expect(start.statusCode).toBe(422);
    expect(start.json()).toMatchObject({ code: 'BLOCKED_BY_DEPENDENCIES' });
  });

  it('unblocks only once the archived-before-completion dependency is completed', async () => {
    const { dependent, dependency } = await dependentWithPrerequisite();
    const archived = await transition(
      dependency.id,
      'ARCHIVED',
      dependency.version,
    );
    expect((await getTodo(dependent.id)).blocked).toBe(true);

    const completed = await transition(
      dependency.id,
      'COMPLETED',
      archived.json().version,
    );

    expect(completed.statusCode).toBe(200);
    expect((await getTodo(dependent.id)).blocked).toBe(false);
  });
});

describe('todos: cycle detection beyond the three-node chain (HTTP seam)', () => {
  async function createTodos(names: string[]) {
    return Promise.all(names.map((name) => createTodo({ name })));
  }

  /**
   * A diamond that converges and closes at the last hop:
   *   A -> B -> D -> F
   *   A -> C -> E -> F
   * so `F -> A` closes a four-node cycle through either path.
   */
  async function diamond() {
    const [a, b, c, d, e, f] = await createTodos([
      'A',
      'B',
      'C',
      'D',
      'E',
      'F',
    ]);
    const edges = [
      [a, b],
      [a, c],
      [b, d],
      [c, e],
      [d, f],
      [e, f],
    ] as const;
    for (const [dependent, prerequisite] of edges) {
      const response = await addDependency(dependent.id, prerequisite.id);
      expect(response.statusCode).toBe(200);
    }
    return { a, f };
  }

  it('rejects a four-node cycle', async () => {
    const [a, b, c, d] = await createTodos(['A', 'B', 'C', 'D']);
    expect((await addDependency(a.id, b.id)).statusCode).toBe(200);
    expect((await addDependency(b.id, c.id)).statusCode).toBe(200);
    expect((await addDependency(c.id, d.id)).statusCode).toBe(200);

    const response = await addDependency(d.id, a.id);

    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({ code: 'CYCLE_DETECTED' });
  });

  it('rejects a diamond whose cycle only closes at the last hop', async () => {
    const { a, f } = await diamond();

    const response = await addDependency(f.id, a.id);

    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({ code: 'CYCLE_DETECTED' });
  });

  it('accepts the same diamond of edges without the closing edge', async () => {
    const { a } = await diamond();

    const todo = await getTodo(a.id);
    expect(todo.dependencies).toHaveLength(2);
    expect(todo.blockedBy).toHaveLength(2);
  });
});

describe('todos: edges to a target Deleted out of band (HTTP seam)', () => {
  it('is ignored by the single read, the list read and the blocked filter', async () => {
    const dependency = await createTodo({ name: 'Deleted out of band' });
    const dependent = await createTodo({ name: 'Dependent' });
    await addDependency(dependent.id, dependency.id);

    // Deleting through the API removes the edge; this simulates the direct DB
    // write the read predicates defend against.
    await harness.db.pool.query(
      'update todos set deleted_at = now() where id = $1',
      [dependency.id],
    );

    const fetched = await getTodo(dependent.id);
    expect(fetched.dependencies).toEqual([]);
    expect(fetched.blocked).toBe(false);

    const listed = await harness.app.inject({
      method: 'GET',
      url: '/api/todos',
    });
    const row = (
      listed.json().todos as Array<{ id: string; dependencies: unknown[] }>
    ).find((todo) => todo.id === dependent.id);
    expect(row?.dependencies).toEqual([]);

    const blockedIds = (
      (await listBlocked(true)).json().todos as Array<{ id: string }>
    ).map((todo) => todo.id);
    expect(blockedIds).not.toContain(dependent.id);

    const unblockedIds = (
      (await listBlocked(false)).json().todos as Array<{ id: string }>
    ).map((todo) => todo.id);
    expect(unblockedIds).toContain(dependent.id);
  });

  it('is ignored by the delete-impact preview', async () => {
    const dependency = await createTodo({ name: 'To delete' });
    const other = await createTodo({ name: 'Deleted out of band' });
    const dependent = await createTodo({ name: 'Dependent' });
    await addDependency(dependent.id, dependency.id);
    await addDependency(dependent.id, other.id);

    await harness.db.pool.query(
      'update todos set deleted_at = now() where id = $1',
      [other.id],
    );

    const response = await harness.app.inject({
      method: 'GET',
      url: `/api/todos/${dependency.id}/delete-impact`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      unblocked: [{ id: dependent.id, name: 'Dependent' }],
      total: 1,
    });
  });
});

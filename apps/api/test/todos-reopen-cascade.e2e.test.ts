import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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

function transition(id: string, status: string, version: number) {
  return harness.app.inject({
    method: 'POST',
    url: `/api/todos/${id}/transitions`,
    payload: { status, version },
  });
}

function transitionImpact(id: string, to: string) {
  return harness.app.inject({
    method: 'GET',
    url: `/api/todos/${id}/transition-impact?to=${to}`,
  });
}

function editName(id: string, name: string, version: number) {
  return harness.app.inject({
    method: 'PATCH',
    url: `/api/todos/${id}`,
    payload: { name, version },
  });
}

describe('todos: reopen cascade (HTTP seam)', () => {
  it('cascades In Progress dependents transitively when a dependency reopens', async () => {
    const dependency = await createTodo({
      name: 'Dependency',
      status: 'COMPLETED',
    });
    const middle = await createTodo({ name: 'Middle', status: 'IN_PROGRESS' });
    const leaf = await createTodo({ name: 'Leaf', status: 'IN_PROGRESS' });
    await addDependency(middle.id, dependency.id);
    // The API now refuses to add an unmet dependency to an In Progress TODO, so
    // build the legacy second hop directly: the cascade must still repair it.
    await harness.db.pool.query(
      'insert into todo_dependencies (dependent_id, dependency_id) values ($1, $2)',
      [leaf.id, middle.id],
    );

    const reopened = await transition(
      dependency.id,
      'IN_PROGRESS',
      dependency.version,
    );

    expect(reopened.statusCode).toBe(200);
    expect((await getTodo(middle.id)).status).toBe('NOT_STARTED');
    expect((await getTodo(leaf.id)).status).toBe('NOT_STARTED');
  });

  it('does not cascade through a Completed dependent', async () => {
    const dependency = await createTodo({
      name: 'Dependency',
      status: 'COMPLETED',
    });
    const completed = await createTodo({
      name: 'Completed',
      status: 'COMPLETED',
    });
    const started = await createTodo({
      name: 'Started',
      status: 'IN_PROGRESS',
    });
    await addDependency(completed.id, dependency.id);
    await addDependency(started.id, completed.id);

    await transition(dependency.id, 'IN_PROGRESS', dependency.version);

    // The Completed dependent stays Completed and keeps satisfying its own
    // dependent, so the started TODO is not blocked and is left alone.
    expect((await getTodo(completed.id)).status).toBe('COMPLETED');
    expect((await getTodo(started.id)).status).toBe('IN_PROGRESS');
  });

  it('bumps the version of each cascaded dependent', async () => {
    const dependency = await createTodo({
      name: 'Dependency',
      status: 'COMPLETED',
    });
    const dependent = await createTodo({
      name: 'Dependent',
      status: 'IN_PROGRESS',
    });
    await addDependency(dependent.id, dependency.id);

    await transition(dependency.id, 'IN_PROGRESS', dependency.version);

    expect((await getTodo(dependent.id)).version).toBe(dependent.version + 1);
  });

  it('cascades when the dependency reopens to Not Started', async () => {
    const dependency = await createTodo({
      name: 'Dependency',
      status: 'COMPLETED',
    });
    const dependent = await createTodo({
      name: 'Dependent',
      status: 'IN_PROGRESS',
    });
    await addDependency(dependent.id, dependency.id);

    const response = await transition(
      dependency.id,
      'NOT_STARTED',
      dependency.version,
    );

    expect(response.statusCode).toBe(200);
    expect((await getTodo(dependent.id)).status).toBe('NOT_STARTED');
  });

  it('cascades when a completed dependency is un-archived', async () => {
    const dependency = await createTodo({
      name: 'Dependency',
      status: 'COMPLETED',
    });
    const dependent = await createTodo({
      name: 'Dependent',
      status: 'IN_PROGRESS',
    });
    await addDependency(dependent.id, dependency.id);
    const archived = await transition(
      dependency.id,
      'ARCHIVED',
      dependency.version,
    );

    await transition(dependency.id, 'IN_PROGRESS', archived.json().version);

    expect((await getTodo(dependent.id)).status).toBe('NOT_STARTED');
  });

  it('leaves Completed, Not Started and Archived dependents alone', async () => {
    const dependency = await createTodo({
      name: 'Dependency',
      status: 'COMPLETED',
    });
    const completed = await createTodo({
      name: 'Completed',
      status: 'COMPLETED',
    });
    const notStarted = await createTodo({ name: 'Not Started' });
    const archived = await createTodo({ name: 'Archived', status: 'ARCHIVED' });
    await addDependency(completed.id, dependency.id);
    await addDependency(notStarted.id, dependency.id);
    await addDependency(archived.id, dependency.id);

    await transition(dependency.id, 'IN_PROGRESS', dependency.version);

    expect((await getTodo(completed.id)).status).toBe('COMPLETED');
    expect((await getTodo(notStarted.id)).status).toBe('NOT_STARTED');
    expect((await getTodo(archived.id)).status).toBe('ARCHIVED');
  });

  it('does not cascade when a completed dependency is archived', async () => {
    const dependency = await createTodo({
      name: 'Dependency',
      status: 'COMPLETED',
    });
    const dependent = await createTodo({
      name: 'Dependent',
      status: 'IN_PROGRESS',
    });
    await addDependency(dependent.id, dependency.id);

    const archived = await transition(
      dependency.id,
      'ARCHIVED',
      dependency.version,
    );

    expect(archived.statusCode).toBe(200);
    expect((await getTodo(dependent.id)).status).toBe('IN_PROGRESS');
  });

  it('deleting a dependency removes the edge without changing a dependent status', async () => {
    const dependency = await createTodo({
      name: 'Dependency',
      status: 'COMPLETED',
    });
    const dependent = await createTodo({
      name: 'Dependent',
      status: 'IN_PROGRESS',
    });
    await addDependency(dependent.id, dependency.id);

    const deleted = await harness.app.inject({
      method: 'DELETE',
      url: `/api/todos/${dependency.id}?version=${dependency.version}`,
    });

    expect(deleted.statusCode).toBe(204);
    const updated = await getTodo(dependent.id);
    expect(updated.status).toBe('IN_PROGRESS');
    expect(updated.dependencies).toEqual([]);
  });

  describe('transition impact (dry run)', () => {
    it('reports the dependents a reopen would cascade', async () => {
      const dependency = await createTodo({
        name: 'Dependency',
        status: 'COMPLETED',
      });
      const dependent = await createTodo({
        name: 'Dependent',
        status: 'IN_PROGRESS',
      });
      await addDependency(dependent.id, dependency.id);

      const response = await transitionImpact(dependency.id, 'IN_PROGRESS');

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        affected: [
          {
            id: dependent.id,
            name: 'Dependent',
            from: 'IN_PROGRESS',
            to: 'NOT_STARTED',
          },
        ],
        total: 1,
      });
    });

    it('caps the preview and reports the full total', async () => {
      const dependency = await createTodo({
        name: 'Dependency',
        status: 'COMPLETED',
      });
      for (const name of ['A', 'B', 'C', 'D']) {
        const dependent = await createTodo({ name, status: 'IN_PROGRESS' });
        await addDependency(dependent.id, dependency.id);
      }

      const first = await transitionImpact(dependency.id, 'NOT_STARTED');
      const second = await transitionImpact(dependency.id, 'NOT_STARTED');

      const body = first.json();
      expect(body.affected).toHaveLength(3);
      expect(body.total).toBe(4);
      // Name-ordered, so repeated calls agree.
      expect(second.json()).toEqual(body);
    });

    it('agrees with the TODOs the cascade actually moves', async () => {
      const dependency = await createTodo({
        name: 'Dependency',
        status: 'COMPLETED',
      });
      const one = await createTodo({ name: 'One', status: 'IN_PROGRESS' });
      const two = await createTodo({ name: 'Two', status: 'IN_PROGRESS' });
      await addDependency(one.id, dependency.id);
      await addDependency(two.id, dependency.id);

      const preview = await transitionImpact(dependency.id, 'NOT_STARTED');
      await transition(dependency.id, 'NOT_STARTED', dependency.version);

      const previewIds = preview
        .json()
        .affected.map((entry: { id: string }) => entry.id)
        .sort();
      expect(previewIds).toEqual([one.id, two.id].sort());
      expect((await getTodo(one.id)).status).toBe('NOT_STARTED');
      expect((await getTodo(two.id)).status).toBe('NOT_STARTED');
    });

    it('is empty for a transition that does not remove satisfaction', async () => {
      const dependency = await createTodo({
        name: 'Dependency',
        status: 'COMPLETED',
      });
      const dependent = await createTodo({
        name: 'Dependent',
        status: 'IN_PROGRESS',
      });
      await addDependency(dependent.id, dependency.id);

      for (const to of ['ARCHIVED', 'COMPLETED']) {
        const response = await transitionImpact(dependency.id, to);
        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({ affected: [], total: 0 });
      }
    });

    it('is empty when no dependent is In Progress', async () => {
      const dependency = await createTodo({
        name: 'Dependency',
        status: 'COMPLETED',
      });
      const dependent = await createTodo({ name: 'Dependent' });
      await addDependency(dependent.id, dependency.id);

      const response = await transitionImpact(dependency.id, 'IN_PROGRESS');

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ affected: [], total: 0 });
    });

    it('reports the cascade for an un-archived completed dependency', async () => {
      const dependency = await createTodo({
        name: 'Dependency',
        status: 'COMPLETED',
      });
      const dependent = await createTodo({
        name: 'Dependent',
        status: 'IN_PROGRESS',
      });
      await addDependency(dependent.id, dependency.id);
      await transition(dependency.id, 'ARCHIVED', dependency.version);

      const response = await transitionImpact(dependency.id, 'IN_PROGRESS');

      expect(response.statusCode).toBe(200);
      expect(response.json().affected).toHaveLength(1);
    });

    it('rejects an unknown target Status', async () => {
      const dependency = await createTodo({ name: 'Dependency' });

      const response = await transitionImpact(dependency.id, 'DONE');

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: 'VALIDATION' });
    });

    it('returns 404 for an unknown TODO', async () => {
      const response = await transitionImpact(UNKNOWN_ID, 'IN_PROGRESS');

      expect(response.statusCode).toBe(404);
    });
  });

  describe('concurrency', () => {
    it('resolves a concurrent reopen and start without leaving both In Progress', async () => {
      const dependency = await createTodo({
        name: 'Dependency',
        status: 'COMPLETED',
      });
      const dependent = await createTodo({ name: 'Dependent' });
      await addDependency(dependent.id, dependency.id);

      await Promise.all([
        transition(dependency.id, 'IN_PROGRESS', dependency.version),
        transition(dependent.id, 'IN_PROGRESS', dependent.version),
      ]);

      // Either the start was rejected as Blocked, or the reopen cascaded it
      // back; in no interleaving may an In Progress TODO sit on an
      // unsatisfied dependency (ADR 0004).
      expect((await getTodo(dependency.id)).status).toBe('IN_PROGRESS');
      expect((await getTodo(dependent.id)).status).toBe('NOT_STARTED');
    });

    it('returns 409 when a dependent is edited at its pre-cascade version', async () => {
      const dependency = await createTodo({
        name: 'Dependency',
        status: 'COMPLETED',
      });
      const dependent = await createTodo({
        name: 'Dependent',
        status: 'IN_PROGRESS',
      });
      await addDependency(dependent.id, dependency.id);

      await transition(dependency.id, 'IN_PROGRESS', dependency.version);
      const stale = await editName(dependent.id, 'Edited', dependent.version);

      expect(stale.statusCode).toBe(409);
      expect(stale.json()).toMatchObject({ code: 'CONFLICT' });
    });
  });
});

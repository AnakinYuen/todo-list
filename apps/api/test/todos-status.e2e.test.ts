import { todoStatusLabels, type TodoStatus } from '@todo-list/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestHarness, type TestHarness } from './support/harness';

let harness: TestHarness;

const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';
const STATUSES: TodoStatus[] = [
  'NOT_STARTED',
  'IN_PROGRESS',
  'COMPLETED',
  'ARCHIVED',
];

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

function transition(id: string, status: string, version: number) {
  return harness.app.inject({
    method: 'POST',
    url: `/api/todos/${id}/transitions`,
    payload: { status, version },
  });
}

describe('todos: status lifecycle (HTTP seam)', () => {
  it('starts a TODO', async () => {
    const created = await createTodo({ name: 'Start me' });

    const response = await transition(
      created.id,
      'IN_PROGRESS',
      created.version,
    );

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: 'IN_PROGRESS',
      completedAt: null,
      version: 2,
    });
  });

  it('completes a TODO and records a completion time', async () => {
    const created = await createTodo({ name: 'Finish me' });

    const response = await transition(created.id, 'COMPLETED', created.version);

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.status).toBe('COMPLETED');
    expect(body.completedAt).not.toBeNull();
  });

  it('records a completion time when created directly as Completed', async () => {
    const created = await createTodo({
      name: 'Already done',
      status: 'COMPLETED',
    });

    expect(created.status).toBe('COMPLETED');
    expect(created.completedAt).not.toBeNull();
  });

  it('archiving a completed TODO keeps its completion time', async () => {
    const created = await createTodo({ name: 'Completed then archived' });
    const completed = await transition(
      created.id,
      'COMPLETED',
      created.version,
    );

    const archived = await transition(
      created.id,
      'ARCHIVED',
      completed.json().version,
    );

    expect(archived.statusCode).toBe(200);
    expect(archived.json()).toMatchObject({
      status: 'ARCHIVED',
      completedAt: completed.json().completedAt,
    });
  });

  it('reopening a completed TODO to Not Started clears its completion time', async () => {
    const created = await createTodo({ name: 'Reopen me' });
    const completed = await transition(
      created.id,
      'COMPLETED',
      created.version,
    );

    const reopened = await transition(
      created.id,
      'NOT_STARTED',
      completed.json().version,
    );

    expect(reopened.statusCode).toBe(200);
    expect(reopened.json()).toMatchObject({
      status: 'NOT_STARTED',
      completedAt: null,
    });
  });

  it('reopening a completed TODO to In Progress clears its completion time', async () => {
    const created = await createTodo({ name: 'Reopen to In Progress' });
    const completed = await transition(
      created.id,
      'COMPLETED',
      created.version,
    );

    const reopened = await transition(
      created.id,
      'IN_PROGRESS',
      completed.json().version,
    );

    expect(reopened.statusCode).toBe(200);
    expect(reopened.json()).toMatchObject({
      status: 'IN_PROGRESS',
      completedAt: null,
    });
  });

  it('un-archiving to Completed records a completion time', async () => {
    const archived = await createTodo({ name: 'Archived', status: 'ARCHIVED' });

    const completed = await transition(
      archived.id,
      'COMPLETED',
      archived.version,
    );

    expect(completed.statusCode).toBe(200);
    expect(completed.json().completedAt).not.toBeNull();
  });

  it('treats a repeated status request as a no-op', async () => {
    const created = await createTodo({ name: 'No-op' });

    const response = await transition(
      created.id,
      'NOT_STARTED',
      created.version,
    );

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: 'NOT_STARTED',
      version: created.version,
    });
  });

  it('rejects an unknown status', async () => {
    const created = await createTodo({ name: 'Bad target' });

    const response = await transition(created.id, 'DONE', created.version);

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'VALIDATION' });
  });

  it('returns 404 for an unknown TODO', async () => {
    const response = await transition(UNKNOWN_ID, 'IN_PROGRESS', 1);

    expect(response.statusCode).toBe(404);
  });

  it('returns 404 for a Deleted TODO', async () => {
    const created = await createTodo({ name: 'Deleted' });
    await harness.db.pool.query(
      'update todos set deleted_at = now() where id = $1',
      [created.id],
    );

    const response = await transition(
      created.id,
      'IN_PROGRESS',
      created.version,
    );

    expect(response.statusCode).toBe(404);
  });

  it('rejects a stale transition', async () => {
    const created = await createTodo({ name: 'Contended' });
    const first = await transition(created.id, 'IN_PROGRESS', created.version);
    expect(first.statusCode).toBe(200);

    const stale = await transition(created.id, 'COMPLETED', created.version);

    expect(stale.statusCode).toBe(409);
    expect(stale.json()).toMatchObject({
      code: 'CONFLICT',
      currentVersion: first.json().version,
    });
  });

  for (const from of STATUSES) {
    for (const to of STATUSES) {
      it(`moves ${todoStatusLabels[from]} to ${todoStatusLabels[to]}`, async () => {
        const created = await createTodo({ name: 'Matrix', status: from });

        const response = await transition(created.id, to, created.version);

        expect(response.statusCode).toBe(200);
        expect(response.json().status).toBe(to);
      });
    }
  }
});

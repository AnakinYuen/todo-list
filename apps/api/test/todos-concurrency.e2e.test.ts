import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestHarness, type TestHarness } from './support/harness';

let harness: TestHarness;

const weekly: Record<string, unknown> = {
  mode: 'FIXED_SCHEDULE',
  schedule: { frequency: 'WEEKLY', interval: 1, byWeekday: ['MO'] },
};

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

async function allTodos() {
  const response = await harness.app.inject({
    method: 'GET',
    url: '/api/todos?includeDeleted=true&limit=100',
  });
  expect(response.statusCode).toBe(200);
  return response.json().todos as Array<Record<string, unknown>>;
}

function transition(id: string, status: string, version: number) {
  return harness.app.inject({
    method: 'POST',
    url: `/api/todos/${id}/transitions`,
    payload: { status, version },
  });
}

function addDependency(id: string, dependsOn: string) {
  return harness.app.inject({
    method: 'POST',
    url: `/api/todos/${id}/dependencies`,
    payload: { dependsOn },
  });
}

async function edgeCount(): Promise<number> {
  const result = await harness.db.pool.query<{ count: number }>(
    'select count(*)::int as count from todo_dependencies',
  );
  return result.rows[0]?.count ?? -1;
}

describe('todos: concurrency and rollback (HTTP seam)', () => {
  it('spawns one successor when two clients complete the same occurrence at once', async () => {
    const created = await createTodo({
      name: 'Daily',
      recurrence: { mode: 'AFTER_COMPLETION', interval: 1, unit: 'DAYS' },
    });

    const [first, second] = await Promise.all([
      transition(created.id, 'COMPLETED', created.version),
      transition(created.id, 'COMPLETED', created.version),
    ]);

    expect([first.statusCode, second.statusCode].sort()).toEqual([200, 409]);
    expect(await allTodos()).toHaveLength(2);
    const completed = await getTodo(created.id);
    expect(completed.status).toBe('COMPLETED');
  });

  it('rejects one of two simultaneous cycle-forming edge additions', async () => {
    const a = await createTodo({ name: 'A' });
    const b = await createTodo({ name: 'B' });

    const [first, second] = await Promise.all([
      addDependency(a.id, b.id),
      addDependency(b.id, a.id),
    ]);

    expect([first.statusCode, second.statusCode].sort()).toEqual([200, 422]);
    expect(await edgeCount()).toBe(1);
  });

  it('deletes at most once when two clients delete the same TODO', async () => {
    const created = await createTodo({ name: 'Trash' });
    const remove = () =>
      harness.app.inject({
        method: 'DELETE',
        url: `/api/todos/${created.id}?version=${created.version}`,
      });

    const [first, second] = await Promise.all([remove(), remove()]);

    expect([first.statusCode, second.statusCode].sort()).toEqual([204, 404]);
  });

  it('rolls back a completion whose spawn collides, reporting a conflict', async () => {
    const created = await createTodo({
      name: 'Weekly sync',
      dueDate: '2027-01-04',
      recurrence: weekly,
    });
    // Squat on the exact date the successor would take.
    await harness.db.pool.query(
      'insert into todos (name, status, due_date, series_id) values ($1, $2, $3, $4)',
      ['Squatter', 'NOT_STARTED', '2027-01-11', created.seriesId],
    );

    const response = await transition(created.id, 'COMPLETED', created.version);

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: 'DUPLICATE_OCCURRENCE' });
    // The completion, its spawn and the spawned edge all rolled back.
    const after = await getTodo(created.id);
    expect(after.status).toBe('NOT_STARTED');
    expect(after.version).toBe(created.version);
    expect(await edgeCount()).toBe(0);
  });

  it('reports a due-date collision from an edit as a conflict', async () => {
    const created = await createTodo({
      name: 'Weekly sync',
      dueDate: '2027-01-04',
      recurrence: weekly,
    });
    await harness.completeOn(created.id, created.version, '2027-01-04');
    const spawned = (await allTodos()).find((todo) => todo.id !== created.id)!;

    // Move the spawned occurrence onto the original's live date.
    const response = await harness.app.inject({
      method: 'PATCH',
      url: `/api/todos/${spawned.id}`,
      payload: { dueDate: '2027-01-04', version: spawned.version },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: 'DUPLICATE_OCCURRENCE' });
  });

  it('allows one live occurrence per series and date', async () => {
    const created = await createTodo({
      name: 'Weekly sync',
      dueDate: '2027-01-04',
      recurrence: weekly,
    });
    const insert = (name: string) =>
      harness.db.pool.query(
        'insert into todos (name, status, due_date, series_id) values ($1, $2, $3, $4)',
        [name, 'NOT_STARTED', '2027-01-11', created.seriesId],
      );

    await insert('First');

    await expect(insert('Second')).rejects.toThrow();
  });

  it('frees a date once the occurrence holding it is Deleted', async () => {
    const created = await createTodo({
      name: 'Weekly sync',
      dueDate: '2027-01-04',
      recurrence: weekly,
    });
    const first = await harness.db.pool.query<{ id: string }>(
      'insert into todos (name, status, due_date, series_id) values ($1, $2, $3, $4) returning id',
      ['Old', 'NOT_STARTED', '2027-01-11', created.seriesId],
    );
    await harness.db.pool.query(
      'update todos set deleted_at = now() where id = $1',
      [first.rows[0]?.id],
    );

    await expect(
      harness.db.pool.query(
        'insert into todos (name, status, due_date, series_id) values ($1, $2, $3, $4)',
        ['New', 'NOT_STARTED', '2027-01-11', created.seriesId],
      ),
    ).resolves.toBeDefined();
  });

  it('allows many one-off TODOs on the same date', async () => {
    const insert = (name: string) =>
      harness.db.pool.query(
        'insert into todos (name, status, due_date, series_id) values ($1, $2, $3, NULL)',
        [name, 'NOT_STARTED', '2027-01-11'],
      );

    await insert('One');

    await expect(insert('Two')).resolves.toBeDefined();
  });
});

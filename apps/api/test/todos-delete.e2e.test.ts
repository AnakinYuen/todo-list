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

function del(id: string, version: number) {
  return harness.app.inject({
    method: 'DELETE',
    url: `/api/todos/${id}?version=${version}`,
  });
}

function addDependency(id: string, dependsOn: string) {
  return harness.app.inject({
    method: 'POST',
    url: `/api/todos/${id}/dependencies`,
    payload: { dependsOn },
  });
}

function deleteImpact(id: string) {
  return harness.app.inject({
    method: 'GET',
    url: `/api/todos/${id}/delete-impact`,
  });
}

describe('todos: permanent deletion (HTTP seam)', () => {
  it('deleting a TODO hides it from reads', async () => {
    const created = await createTodo({ name: 'Trash me' });

    const deleted = await del(created.id, created.version);
    expect(deleted.statusCode).toBe(204);

    const list = await harness.app.inject({ method: 'GET', url: '/api/todos' });
    expect(list.json().todos).toHaveLength(0);

    const get = await harness.app.inject({
      method: 'GET',
      url: `/api/todos/${created.id}`,
    });
    expect(get.statusCode).toBe(404);
  });

  it('includeDeleted keeps the row as an audit read', async () => {
    await createTodo({ name: 'Active' });
    const gone = await createTodo({ name: 'Gone' });
    await del(gone.id, gone.version);

    const list = await harness.app.inject({
      method: 'GET',
      url: '/api/todos?includeDeleted=true',
    });

    expect(list.statusCode).toBe(200);
    const items = list.json().todos as Array<{
      name: string;
      deletedAt: string | null;
      version: number;
    }>;
    expect(items.map((todo) => todo.name).sort()).toEqual(['Active', 'Gone']);
    expect(items.find((todo) => todo.name === 'Active')?.deletedAt).toBeNull();
    const deleted = items.find((todo) => todo.name === 'Gone');
    expect(deleted?.deletedAt).not.toBeNull();
    expect(deleted?.version).toBe(2);

    const get = await harness.app.inject({
      method: 'GET',
      url: `/api/todos/${gone.id}?includeDeleted=true`,
    });
    expect(get.statusCode).toBe(200);
  });

  it('deleting a Dependency removes the edge and unblocks its dependent', async () => {
    const dependency = await createTodo({ name: 'Get approval' });
    const dependent = await createTodo({ name: 'Ship it' });
    await addDependency(dependent.id, dependency.id);
    expect((await getTodo(dependent.id)).blocked).toBe(true);

    const deleted = await del(dependency.id, dependency.version);
    expect(deleted.statusCode).toBe(204);

    const updated = await getTodo(dependent.id);
    expect(updated.blocked).toBe(false);
    expect(updated.blockedBy).toEqual([]);
    expect(updated.dependencies).toEqual([]);
  });

  it('deleting a dependent removes its outgoing edges', async () => {
    const prerequisite = await createTodo({ name: 'Prerequisite' });
    const middle = await createTodo({ name: 'Middle' });
    const downstream = await createTodo({ name: 'Downstream' });
    await addDependency(middle.id, prerequisite.id);
    await addDependency(downstream.id, middle.id);

    await del(middle.id, middle.version);

    const updated = await getTodo(downstream.id);
    expect(updated.dependencies).toEqual([]);
    expect(updated.blocked).toBe(false);
  });

  it('lists the dependents a delete would unblock', async () => {
    const dependency = await createTodo({ name: 'Get approval' });
    const dependent = await createTodo({ name: 'Ship it' });
    await addDependency(dependent.id, dependency.id);

    const response = await deleteImpact(dependency.id);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      unblocked: [{ id: dependent.id, name: 'Ship it', status: 'NOT_STARTED' }],
      total: 1,
    });
  });

  it('does not list a dependent the Dependency already satisfied', async () => {
    const dependency = await createTodo({ name: 'Done', status: 'COMPLETED' });
    const dependent = await createTodo({ name: 'Ship it' });
    await addDependency(dependent.id, dependency.id);

    const response = await deleteImpact(dependency.id);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ unblocked: [], total: 0 });
  });

  it('agrees with the dependents the delete actually unblocks', async () => {
    const dependency = await createTodo({ name: 'Get approval' });
    const blocker = await createTodo({ name: 'Sign off' });
    const one = await createTodo({ name: 'One' });
    const two = await createTodo({ name: 'Two' });
    const stays = await createTodo({ name: 'Stays' });
    await addDependency(one.id, dependency.id);
    await addDependency(two.id, dependency.id);
    await addDependency(stays.id, dependency.id);
    await addDependency(stays.id, blocker.id);

    const preview = await deleteImpact(dependency.id);
    const previewIds = preview
      .json()
      .unblocked.map((entry: { id: string }) => entry.id)
      .sort();
    expect(previewIds).toEqual([one.id, two.id].sort());

    await del(dependency.id, dependency.version);

    expect((await getTodo(one.id)).blocked).toBe(false);
    expect((await getTodo(two.id)).blocked).toBe(false);
    expect((await getTodo(stays.id)).blocked).toBe(true);
  });

  it('does not list a dependent that another unmet Dependency still blocks', async () => {
    const dependency = await createTodo({ name: 'Get approval' });
    const other = await createTodo({ name: 'Sign off' });
    const dependent = await createTodo({ name: 'Ship it' });
    await addDependency(dependent.id, dependency.id);
    await addDependency(dependent.id, other.id);

    const response = await deleteImpact(dependency.id);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ unblocked: [], total: 0 });
  });

  it('returns an empty impact when nothing depends on the TODO', async () => {
    const lonely = await createTodo({ name: 'Lonely' });

    const response = await deleteImpact(lonely.id);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ unblocked: [], total: 0 });
  });

  it('returns 404 for the impact of an unknown TODO', async () => {
    const response = await deleteImpact(UNKNOWN_ID);

    expect(response.statusCode).toBe(404);
  });

  it('a Deleted TODO cannot be edited or transitioned', async () => {
    const created = await createTodo({ name: 'Gone' });
    await del(created.id, created.version);

    const edited = await harness.app.inject({
      method: 'PATCH',
      url: `/api/todos/${created.id}`,
      payload: { name: 'Nope', version: 2 },
    });
    expect(edited.statusCode).toBe(404);

    const transitioned = await harness.app.inject({
      method: 'POST',
      url: `/api/todos/${created.id}/transitions`,
      payload: { status: 'IN_PROGRESS', version: 2 },
    });
    expect(transitioned.statusCode).toBe(404);
  });

  it('rejects a delete without a version', async () => {
    const created = await createTodo({ name: 'No version' });

    const response = await harness.app.inject({
      method: 'DELETE',
      url: `/api/todos/${created.id}`,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'VALIDATION' });
  });

  it('rejects a delete at a stale version, leaving the TODO live', async () => {
    const created = await createTodo({ name: 'Changed' });
    const edited = await harness.app.inject({
      method: 'PATCH',
      url: `/api/todos/${created.id}`,
      payload: { name: 'Changed again', version: created.version },
    });
    expect(edited.statusCode).toBe(200);

    const response = await del(created.id, created.version);

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: 'CONFLICT' });
    expect((await getTodo(created.id)).name).toBe('Changed again');
  });

  it('rejects deleting an unknown TODO', async () => {
    const response = await del(UNKNOWN_ID, 1);

    expect(response.statusCode).toBe(404);
  });

  it('rejects deleting an already-Deleted TODO', async () => {
    const created = await createTodo({ name: 'Twice' });
    await del(created.id, created.version);

    const again = await del(created.id, created.version);

    expect(again.statusCode).toBe(404);
  });

  it('has no restore endpoint', async () => {
    const created = await createTodo({ name: 'No undo' });
    await del(created.id, created.version);

    const response = await harness.app.inject({
      method: 'POST',
      url: `/api/todos/${created.id}/restore`,
    });

    expect(response.statusCode).toBe(404);
  });
});

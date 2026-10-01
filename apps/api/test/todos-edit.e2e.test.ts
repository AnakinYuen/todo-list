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

describe('todos: detail and edit (HTTP seam)', () => {
  it('fetches a single TODO by id', async () => {
    const created = await createTodo({ name: 'Read the brief' });

    const response = await harness.app.inject({
      method: 'GET',
      url: `/api/todos/${created.id}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id: created.id,
      name: 'Read the brief',
      version: 1,
    });
  });

  it('returns 404 for an unknown TODO', async () => {
    const response = await harness.app.inject({
      method: 'GET',
      url: `/api/todos/${UNKNOWN_ID}`,
    });

    expect(response.statusCode).toBe(404);
  });

  it('returns a validation error for a malformed id', async () => {
    const response = await harness.app.inject({
      method: 'GET',
      url: '/api/todos/not-a-uuid',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'VALIDATION' });
  });

  it('edits the editable fields and bumps the version', async () => {
    const created = await createTodo({ name: 'Draft' });

    const response = await harness.app.inject({
      method: 'PATCH',
      url: `/api/todos/${created.id}`,
      payload: {
        name: 'Draft the README',
        description: 'cover setup and architecture',
        dueDate: '2027-03-15',
        priority: 'HIGH',
        version: created.version,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id: created.id,
      name: 'Draft the README',
      description: 'cover setup and architecture',
      dueDate: '2027-03-15',
      priority: 'HIGH',
      version: 2,
    });
  });

  it('clears description and due date with null', async () => {
    const created = await createTodo({
      name: 'Draft',
      description: 'text',
      dueDate: '2027-03-15',
    });

    const response = await harness.app.inject({
      method: 'PATCH',
      url: `/api/todos/${created.id}`,
      payload: { description: null, dueDate: null, version: created.version },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      description: null,
      dueDate: null,
      version: 2,
    });
  });

  it('rejects an edit with an empty name', async () => {
    const created = await createTodo({ name: 'Draft' });

    const response = await harness.app.inject({
      method: 'PATCH',
      url: `/api/todos/${created.id}`,
      payload: { name: '', version: created.version },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'VALIDATION' });
  });

  it('rejects an impossible calendar date', async () => {
    const created = await createTodo({ name: 'Draft' });

    const response = await harness.app.inject({
      method: 'PATCH',
      url: `/api/todos/${created.id}`,
      payload: { dueDate: '2027-02-30', version: created.version },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'VALIDATION' });
  });

  it('rejects an unknown Priority', async () => {
    const created = await createTodo({ name: 'Draft' });

    const response = await harness.app.inject({
      method: 'PATCH',
      url: `/api/todos/${created.id}`,
      payload: { priority: 'URGENT', version: created.version },
    });

    expect(response.statusCode).toBe(400);
  });

  it('rejects a stale write and leaves the TODO untouched', async () => {
    const created = await createTodo({ name: 'Draft' });

    const first = await harness.app.inject({
      method: 'PATCH',
      url: `/api/todos/${created.id}`,
      payload: { name: 'Draft v2', version: created.version },
    });
    expect(first.statusCode).toBe(200);

    const stale = await harness.app.inject({
      method: 'PATCH',
      url: `/api/todos/${created.id}`,
      payload: { name: 'Draft v3', version: created.version },
    });

    expect(stale.statusCode).toBe(409);
    expect(stale.json()).toMatchObject({ code: 'CONFLICT', currentVersion: 2 });

    const after = await harness.app.inject({
      method: 'GET',
      url: `/api/todos/${created.id}`,
    });
    expect(after.json()).toMatchObject({ name: 'Draft v2', version: 2 });
  });

  it('returns 404 when editing an unknown TODO', async () => {
    const response = await harness.app.inject({
      method: 'PATCH',
      url: `/api/todos/${UNKNOWN_ID}`,
      payload: { name: 'Nope', version: 1 },
    });

    expect(response.statusCode).toBe(404);
  });
});

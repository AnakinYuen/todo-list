import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestHarness, type TestHarness } from './support/harness';

let harness: TestHarness;

beforeAll(async () => {
  harness = await createTestHarness();
});

afterAll(async () => {
  await harness?.close();
});

beforeEach(async () => {
  await harness.reset();
});

describe('todos (HTTP seam)', () => {
  it('creates a TODO and lists it', async () => {
    const create = await harness.app.inject({
      method: 'POST',
      url: '/api/todos',
      payload: { name: 'Buy milk' },
    });
    expect(create.statusCode).toBe(201);
    const created = create.json();
    expect(created).toMatchObject({ name: 'Buy milk', status: 'NOT_STARTED' });
    expect(typeof created.id).toBe('string');

    const list = await harness.app.inject({
      method: 'GET',
      url: '/api/todos',
    });
    expect(list.statusCode).toBe(200);
    const items = list.json().todos;
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe('Buy milk');
  });

  it('round-trips the optional fields', async () => {
    const create = await harness.app.inject({
      method: 'POST',
      url: '/api/todos',
      payload: {
        name: 'Ship it',
        description: 'with care',
        dueDate: '2027-01-31',
        priority: 'HIGH',
        status: 'IN_PROGRESS',
      },
    });
    expect(create.statusCode).toBe(201);
    expect(create.json()).toMatchObject({
      name: 'Ship it',
      description: 'with care',
      dueDate: '2027-01-31',
      priority: 'HIGH',
      status: 'IN_PROGRESS',
    });
  });

  it('rejects a recurring TODO created already Completed', async () => {
    const res = await harness.app.inject({
      method: 'POST',
      url: '/api/todos',
      payload: {
        name: 'Daily standup',
        recurrence: { mode: 'AFTER_COMPLETION', interval: 1, unit: 'DAYS' },
        status: 'COMPLETED',
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ code: 'VALIDATION' });
  });

  it('allows a recurring TODO created in an active Status', async () => {
    const res = await harness.app.inject({
      method: 'POST',
      url: '/api/todos',
      payload: {
        name: 'Daily standup',
        recurrence: { mode: 'AFTER_COMPLETION', interval: 1, unit: 'DAYS' },
        status: 'IN_PROGRESS',
      },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      status: 'IN_PROGRESS',
      recurrence: { mode: 'AFTER_COMPLETION', interval: 1, unit: 'DAYS' },
    });
  });

  it('allows a one-off created as Completed', async () => {
    const res = await harness.app.inject({
      method: 'POST',
      url: '/api/todos',
      payload: { name: 'Backfilled', status: 'COMPLETED' },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ status: 'COMPLETED' });
  });

  it('rejects a TODO with an empty name', async () => {
    const res = await harness.app.inject({
      method: 'POST',
      url: '/api/todos',
      payload: { name: '' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('reports readiness', async () => {
    const res = await harness.app.inject({
      method: 'GET',
      url: '/api/readyz',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });
});

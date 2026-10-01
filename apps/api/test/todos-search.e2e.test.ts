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

async function createTodo(payload: Record<string, unknown>) {
  const response = await harness.app.inject({
    method: 'POST',
    url: '/api/todos',
    payload,
  });
  expect(response.statusCode).toBe(201);
  return response.json();
}

function search(q: string) {
  return harness.app.inject({
    method: 'GET',
    url: `/api/todos/search?q=${encodeURIComponent(q)}`,
  });
}

describe('todos: name search for the dependency picker (HTTP seam)', () => {
  it('matches case-insensitively on a prefix', async () => {
    await createTodo({ name: 'Get design approval' });
    await createTodo({ name: 'Ship the demo' });

    const response = await search('GET DESIGN');

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject([{ name: 'Get design approval' }]);
  });

  it('does not match a non-prefix substring', async () => {
    await createTodo({ name: 'Get design approval' });

    expect((await search('design')).json()).toEqual([]);
  });

  it('treats % and _ literally, not as wildcards', async () => {
    await createTodo({ name: 'Cover 100% of cases' });
    await createTodo({ name: 'Cover 1000 of cases' });
    await createTodo({ name: 'underscore_name' });
    await createTodo({ name: 'underscoreXname' });

    expect((await search('cover 100%')).json()).toMatchObject([
      { name: 'Cover 100% of cases' },
    ]);
    expect((await search('underscore_')).json()).toMatchObject([
      { name: 'underscore_name' },
    ]);
  });

  it('excludes Deleted TODOs', async () => {
    const created = await createTodo({ name: 'Ghost match' });
    await harness.app.inject({
      method: 'DELETE',
      url: `/api/todos/${created.id}?version=${created.version}`,
    });

    expect((await search('ghost')).json()).toEqual([]);
  });

  it('finds a one-character name by its one-character prefix', async () => {
    await createTodo({ name: 'A' });
    await createTodo({ name: 'Buy milk' });

    expect((await search('a')).json()).toMatchObject([{ name: 'A' }]);
    expect((await search('B')).json()).toMatchObject([{ name: 'Buy milk' }]);
  });

  it('rejects an empty search term', async () => {
    const response = await search('   ');

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'VALIDATION' });
  });

  it('sorts by name and caps the results', async () => {
    for (let i = 0; i < 25; i += 1) {
      await createTodo({ name: `Match ${String(i).padStart(2, '0')}` });
    }

    const body = (await search('match')).json() as Array<{ name: string }>;

    expect(body).toHaveLength(20);
    expect(body[0]?.name).toBe('Match 00');
    expect(body[19]?.name).toBe('Match 19');
  });
});

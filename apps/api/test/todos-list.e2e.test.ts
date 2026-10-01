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

interface Item {
  id: string;
  name: string;
  status: string;
  priority: string;
}

async function list(query = '') {
  const response = await harness.app.inject({
    method: 'GET',
    url: `/api/todos${query}`,
  });
  expect(response.statusCode).toBe(200);
  return response.json() as { todos: Item[]; nextCursor: string | null };
}

const names = (page: { todos: Item[] }) => page.todos.map((todo) => todo.name);

function encode(payload: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

describe('todos: filtering (HTTP seam)', () => {
  it('filters by Status', async () => {
    await createTodo({ name: 'Todo', status: 'NOT_STARTED' });
    await createTodo({ name: 'Doing', status: 'IN_PROGRESS' });
    await createTodo({ name: 'Done', status: 'COMPLETED' });

    expect(names(await list('?status=IN_PROGRESS'))).toEqual(['Doing']);
  });

  it('filters by Priority', async () => {
    await createTodo({ name: 'Low', priority: 'LOW' });
    await createTodo({ name: 'High', priority: 'HIGH' });

    expect(names(await list('?priority=HIGH'))).toEqual(['High']);
  });

  it('filters by due date range', async () => {
    await createTodo({ name: 'Early', dueDate: '2027-01-01' });
    await createTodo({ name: 'Mid', dueDate: '2027-06-01' });
    await createTodo({ name: 'Late', dueDate: '2027-12-01' });

    expect(
      names(await list('?dueAfter=2027-02-01&dueBefore=2027-07-01')),
    ).toEqual(['Mid']);
  });

  it('filters by overdue, excluding completed and archived', async () => {
    await createTodo({ name: 'Overdue', dueDate: '2000-01-01' });
    await createTodo({
      name: 'Overdue but done',
      dueDate: '2000-01-01',
      status: 'COMPLETED',
    });
    await createTodo({ name: 'Future', dueDate: '2999-01-01' });

    expect(names(await list('?overdue=true'))).toEqual(['Overdue']);
  });
});

describe('todos: sorting (HTTP seam)', () => {
  it('sorts by name ascending and descending', async () => {
    await createTodo({ name: 'charlie' });
    await createTodo({ name: 'alpha' });
    await createTodo({ name: 'bravo' });

    expect(names(await list('?sort=name&order=asc'))).toEqual([
      'alpha',
      'bravo',
      'charlie',
    ]);
    expect(names(await list('?sort=name&order=desc'))).toEqual([
      'charlie',
      'bravo',
      'alpha',
    ]);
  });

  it('sorts by due date, with undated last in both directions', async () => {
    await createTodo({ name: 'March', dueDate: '2027-03-01' });
    await createTodo({ name: 'January', dueDate: '2027-01-01' });
    await createTodo({ name: 'Undated' });

    expect(names(await list('?sort=dueDate&order=asc'))).toEqual([
      'January',
      'March',
      'Undated',
    ]);
    expect(names(await list('?sort=dueDate&order=desc'))).toEqual([
      'March',
      'January',
      'Undated',
    ]);
  });

  it('sorts by Priority', async () => {
    await createTodo({ name: 'Medium', priority: 'MEDIUM' });
    await createTodo({ name: 'Low', priority: 'LOW' });
    await createTodo({ name: 'High', priority: 'HIGH' });

    expect(names(await list('?sort=priority&order=asc'))).toEqual([
      'Low',
      'Medium',
      'High',
    ]);
  });

  it('sorts by Status in lifecycle order', async () => {
    await createTodo({ name: 'Archived', status: 'ARCHIVED' });
    await createTodo({ name: 'Not started', status: 'NOT_STARTED' });
    await createTodo({ name: 'In progress', status: 'IN_PROGRESS' });
    await createTodo({ name: 'Completed', status: 'COMPLETED' });

    expect(names(await list('?sort=status&order=asc'))).toEqual([
      'Not started',
      'In progress',
      'Completed',
      'Archived',
    ]);
  });

  it('combines a filter with a sort', async () => {
    await createTodo({ name: 'b', priority: 'HIGH' });
    await createTodo({ name: 'a', priority: 'HIGH' });
    await createTodo({ name: 'c', priority: 'LOW' });

    expect(names(await list('?priority=HIGH&sort=name&order=asc'))).toEqual([
      'a',
      'b',
    ]);
  });
});

describe('todos: keyset pagination (HTTP seam)', () => {
  it('pages through the whole list without gaps or duplicates', async () => {
    for (const name of ['a', 'b', 'c', 'd', 'e']) {
      await createTodo({ name });
    }

    const first = await list('?sort=name&order=asc&limit=2');
    expect(names(first)).toEqual(['a', 'b']);
    expect(first.nextCursor).not.toBeNull();

    const second = await list(
      `?sort=name&order=asc&limit=2&cursor=${first.nextCursor}`,
    );
    expect(names(second)).toEqual(['c', 'd']);

    const third = await list(
      `?sort=name&order=asc&limit=2&cursor=${second.nextCursor}`,
    );
    expect(names(third)).toEqual(['e']);
    expect(third.nextCursor).toBeNull();
  });

  it('pages stably while sorting by due date', async () => {
    await createTodo({ name: 'two', dueDate: '2027-02-01' });
    await createTodo({ name: 'one', dueDate: '2027-01-01' });
    await createTodo({ name: 'three', dueDate: '2027-03-01' });

    const first = await list('?sort=dueDate&order=asc&limit=2');
    const second = await list(
      `?sort=dueDate&order=asc&limit=2&cursor=${first.nextCursor}`,
    );

    expect([...names(first), ...names(second)]).toEqual([
      'one',
      'two',
      'three',
    ]);
  });

  it('pages in descending order', async () => {
    for (const name of ['a', 'b', 'c']) {
      await createTodo({ name });
    }

    const first = await list('?sort=name&order=desc&limit=1');
    expect(names(first)).toEqual(['c']);

    const second = await list(
      `?sort=name&order=desc&limit=1&cursor=${first.nextCursor}`,
    );
    expect(names(second)).toEqual(['b']);
  });

  // Every sort, both directions: the single-query order is the source of truth,
  // and keyset paging (which reads the key back into `valueOf`) must reproduce
  // it exactly. Drift between the SQL key and the row value shows up here as a
  // gap or a repeat.
  const sorts = ['name', 'dueDate', 'status', 'priority'] as const;
  const orders = ['asc', 'desc'] as const;

  async function seedTiedKeys() {
    await createTodo({
      name: 'delta',
      dueDate: '2027-02-01',
      status: 'NOT_STARTED',
      priority: 'HIGH',
    });
    await createTodo({ name: 'alpha', status: 'COMPLETED', priority: 'LOW' });
    await createTodo({
      name: 'echo',
      dueDate: '2027-01-01',
      status: 'IN_PROGRESS',
      priority: 'MEDIUM',
    });
    await createTodo({
      name: 'bravo',
      dueDate: '2027-02-01',
      status: 'NOT_STARTED',
      priority: 'HIGH',
    });
    await createTodo({ name: 'charlie', status: 'ARCHIVED', priority: 'LOW' });
  }

  async function pageThroughAll(query: string): Promise<string[]> {
    const ids: string[] = [];
    let cursor: string | null = null;
    for (let pages = 0; pages < 10; pages += 1) {
      const page = await list(
        `?${query}&limit=2${cursor ? `&cursor=${cursor}` : ''}`,
      );
      ids.push(...page.todos.map((todo) => todo.id));
      cursor = page.nextCursor;
      if (!cursor) {
        break;
      }
    }
    return ids;
  }

  it.each(
    sorts.flatMap((sort) => orders.map((order) => [sort, order] as const)),
  )('keyset-pages by %s %s without gaps or duplicates', async (sort, order) => {
    await seedTiedKeys();
    const query = `sort=${sort}&order=${order}`;
    const whole = (await list(`?${query}&limit=50`)).todos.map(
      (todo) => todo.id,
    );

    expect(await pageThroughAll(query)).toEqual(whole);
  });

  it('breaks ties on identical sort keys without dropping rows', async () => {
    await createTodo({ name: 'same' });
    await createTodo({ name: 'same' });
    await createTodo({ name: 'same' });

    const seen = new Set<string>();
    let cursor: string | null = null;
    let pages = 0;
    do {
      const query: string = `?sort=name&order=asc&limit=1${
        cursor ? `&cursor=${cursor}` : ''
      }`;
      const page = await list(query);
      for (const todo of page.todos) {
        seen.add(todo.id);
      }
      cursor = page.nextCursor;
      pages += 1;
      expect(pages).toBeLessThanOrEqual(3);
    } while (cursor);

    expect(seen.size).toBe(3);
  });

  it('rejects an undecodable cursor', async () => {
    const response = await harness.app.inject({
      method: 'GET',
      url: '/api/todos?cursor=not-a-cursor',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'VALIDATION' });
  });

  it('rejects a cursor whose id is not a UUID', async () => {
    const cursor = encode({
      key: 'a',
      id: 'not-a-uuid',
      sort: 'name',
      order: 'asc',
    });

    const response = await harness.app.inject({
      method: 'GET',
      url: `/api/todos?cursor=${cursor}`,
    });

    expect(response.statusCode).toBe(400);
  });

  it('rejects a cursor from a different sort', async () => {
    await createTodo({ name: 'a' });
    await createTodo({ name: 'b' });
    const first = await list('?sort=name&order=asc&limit=1');

    const response = await harness.app.inject({
      method: 'GET',
      url: `/api/todos?sort=dueDate&order=asc&limit=1&cursor=${first.nextCursor}`,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'VALIDATION' });
  });

  it('rejects a cursor reused with different filters', async () => {
    await createTodo({ name: 'a' });
    await createTodo({ name: 'b' });
    const first = await list('?sort=name&order=asc&limit=1');

    const response = await harness.app.inject({
      method: 'GET',
      url: `/api/todos?sort=name&order=asc&limit=1&priority=HIGH&cursor=${first.nextCursor}`,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'VALIDATION' });
  });

  it('rejects an out-of-range limit', async () => {
    const response = await harness.app.inject({
      method: 'GET',
      url: '/api/todos?limit=0',
    });

    expect(response.statusCode).toBe(400);
  });
});

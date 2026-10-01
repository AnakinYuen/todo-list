import type { RecurrenceRule, Todo } from '@todo-list/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestHarness, type TestHarness } from './support/harness';

let harness: TestHarness;

const daily: RecurrenceRule = {
  mode: 'FIXED_SCHEDULE',
  schedule: { frequency: 'DAILY', interval: 1 },
};
const weeklyMonday: RecurrenceRule = {
  mode: 'FIXED_SCHEDULE',
  schedule: { frequency: 'WEEKLY', interval: 1, byWeekday: ['MO'] },
};
const monthly31: RecurrenceRule = {
  mode: 'FIXED_SCHEDULE',
  schedule: {
    frequency: 'MONTHLY',
    interval: 1,
    monthlyAnchor: { kind: 'DAY_OF_MONTH', day: 31 },
  },
};
const lastDay: RecurrenceRule = {
  mode: 'FIXED_SCHEDULE',
  schedule: {
    frequency: 'MONTHLY',
    interval: 1,
    monthlyAnchor: { kind: 'LAST_DAY' },
  },
};
const fourthSunday: RecurrenceRule = {
  mode: 'FIXED_SCHEDULE',
  schedule: {
    frequency: 'MONTHLY',
    interval: 1,
    monthlyAnchor: { kind: 'NTH_WEEKDAY', weekday: 'SU', nth: 4 },
  },
};
const lastSunday: RecurrenceRule = {
  mode: 'FIXED_SCHEDULE',
  schedule: {
    frequency: 'MONTHLY',
    interval: 1,
    monthlyAnchor: { kind: 'LAST_WEEKDAY', weekday: 'SU' },
  },
};
const monWedFri: RecurrenceRule = {
  mode: 'FIXED_SCHEDULE',
  schedule: { frequency: 'WEEKLY', interval: 1, byWeekday: ['MO', 'WE', 'FR'] },
};
const everyThreeDays: RecurrenceRule = {
  mode: 'FIXED_SCHEDULE',
  schedule: { frequency: 'DAILY', interval: 3 },
};
const everyThreeDaysAfterCompletion: RecurrenceRule = {
  mode: 'AFTER_COMPLETION',
  interval: 3,
  unit: 'DAYS',
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

async function complete(id: string, version: number) {
  const response = await harness.app.inject({
    method: 'POST',
    url: `/api/todos/${id}/transitions`,
    payload: { status: 'COMPLETED', version },
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

describe('todos: recurrence spawn (HTTP seam)', () => {
  it('spawns the next Occurrence on completion and shares a series id', async () => {
    const created = await createTodo({
      name: 'Take vitamins',
      dueDate: '2027-01-01',
      priority: 'HIGH',
      recurrence: daily,
    });
    expect(created.seriesId).not.toBeNull();

    // Pin the completion date; the next due date is generated from it.
    await harness.completeOn(created.id, created.version, '2027-01-01');

    const todos = await allTodos();
    expect(todos).toHaveLength(2);
    const next = todos.find((todo) => todo.id !== created.id)!;
    expect(next).toMatchObject({
      name: 'Take vitamins',
      priority: 'HIGH',
      status: 'NOT_STARTED',
      dueDate: '2027-01-02',
      seriesId: created.seriesId,
      recurrence: daily,
      completedAt: null,
    });
  });

  it('does not spawn when there is no Recurrence rule', async () => {
    const created = await createTodo({
      name: 'One-off',
      dueDate: '2027-01-01',
    });

    await complete(created.id, created.version);

    expect(await allTodos()).toHaveLength(1);
  });

  it('spawns exactly once when completed twice at the same version', async () => {
    const created = await createTodo({
      name: 'Daily',
      dueDate: '2027-01-01',
      recurrence: daily,
    });
    const completed = await complete(created.id, created.version);

    const again = await harness.app.inject({
      method: 'POST',
      url: `/api/todos/${created.id}/transitions`,
      payload: { status: 'COMPLETED', version: completed.version },
    });
    expect(again.statusCode).toBe(200);

    expect(await allTodos()).toHaveLength(2);
  });

  it('does not spawn again when a completed occurrence is reopened and completed', async () => {
    const created = await createTodo({
      name: 'Daily',
      dueDate: '2027-01-01',
      recurrence: daily,
    });
    const first = await harness.completeOn(
      created.id,
      created.version,
      '2027-01-01',
    );
    const reopened = await harness.app.inject({
      method: 'POST',
      url: `/api/todos/${created.id}/transitions`,
      payload: { status: 'IN_PROGRESS', version: first.version },
    });
    expect(reopened.statusCode).toBe(200);

    const recompleted = await harness.app.inject({
      method: 'POST',
      url: `/api/todos/${created.id}/transitions`,
      payload: { status: 'COMPLETED', version: reopened.json().version },
    });

    expect(recompleted.statusCode).toBe(200);
    expect(await allTodos()).toHaveLength(2);
  });

  it('does not spawn again after a completed occurrence is archived and re-completed', async () => {
    const created = await createTodo({
      name: 'Daily',
      dueDate: '2027-01-01',
      recurrence: daily,
    });
    const first = await harness.completeOn(
      created.id,
      created.version,
      '2027-01-01',
    );
    const archived = await harness.app.inject({
      method: 'POST',
      url: `/api/todos/${created.id}/transitions`,
      payload: { status: 'ARCHIVED', version: first.version },
    });
    expect(archived.statusCode).toBe(200);

    const recompleted = await harness.app.inject({
      method: 'POST',
      url: `/api/todos/${created.id}/transitions`,
      payload: { status: 'COMPLETED', version: archived.json().version },
    });

    expect(recompleted.statusCode).toBe(200);
    expect(await allTodos()).toHaveLength(2);
  });

  it('spawns with no due date, anchoring on the completion', async () => {
    const created = await createTodo({ name: 'Daily', recurrence: daily });
    expect(created.dueDate).toBeNull();

    await harness.completeOn(created.id, created.version, '2027-01-01');

    const todos = await allTodos();
    expect(todos).toHaveLength(2);
    const next = todos.find((todo) => todo.id !== created.id)!;
    expect(next.dueDate).toBe('2027-01-02');
  });

  it('spawns a habit from the completion, ignoring the due date', async () => {
    const created = await createTodo({
      name: 'Water plants',
      dueDate: '2027-06-01',
      recurrence: everyThreeDaysAfterCompletion,
    });

    await harness.completeOn(created.id, created.version, '2027-01-01');

    const todos = await allTodos();
    const next = todos.find((todo) => todo.id !== created.id)!;
    expect(next.dueDate).toBe('2027-01-04');
    expect(next.recurrence).toEqual(everyThreeDaysAfterCompletion);
  });

  it('spawns a habit with no due date', async () => {
    const weeklyAfter: RecurrenceRule = {
      mode: 'AFTER_COMPLETION',
      interval: 1,
      unit: 'WEEKS',
    };
    const created = await createTodo({
      name: 'Cut hair',
      recurrence: weeklyAfter,
    });
    expect(created.dueDate).toBeNull();

    await harness.completeOn(created.id, created.version, '2027-01-04');

    const todos = await allTodos();
    const next = todos.find((todo) => todo.id !== created.id)!;
    expect(next.dueDate).toBe('2027-01-11');
  });

  it('does not duplicate the due date when a fixed Occurrence is completed early', async () => {
    // Due Monday 2026-10-05, completed the preceding Thursday.
    const created = await createTodo({
      name: 'Weekly sync',
      dueDate: '2026-10-05',
      recurrence: weeklyMonday,
    });

    await harness.completeOn(created.id, created.version, '2026-10-01');

    const todos = await allTodos();
    const next = todos.find((todo) => todo.id !== created.id)!;
    expect(next.dueDate).toBe('2026-10-12');
  });

  it('spawns a habit a fixed interval after a late completion', async () => {
    const created = await createTodo({
      name: 'Water plants',
      recurrence: everyThreeDaysAfterCompletion,
    });

    await harness.completeOn(created.id, created.version, '2027-01-10');

    const todos = await allTodos();
    const next = todos.find((todo) => todo.id !== created.id)!;
    expect(next.dueDate).toBe('2027-01-13');
  });

  it('does not build a backlog when a fixed Occurrence is completed late', async () => {
    const created = await createTodo({
      name: 'Weekly sync',
      dueDate: '2027-01-04',
      recurrence: weeklyMonday,
    });

    await harness.completeOn(created.id, created.version, '2027-02-15');

    const todos = await allTodos();
    expect(todos).toHaveLength(2);
    const next = todos.find((todo) => todo.id !== created.id)!;
    expect(next.dueDate).toBe('2027-02-15');
  });

  it('advances a habit past a due date the series already has', async () => {
    const created = await createTodo({
      name: 'Water plants',
      recurrence: everyThreeDaysAfterCompletion,
    });
    await harness.completeOn(created.id, created.version, '2027-01-01');
    const spawned = (await allTodos()).find((todo) => todo.id !== created.id)!;

    // Complete the spawned occurrence on the same day: the naive next date
    // (2027-01-04) already exists, so it advances one interval.
    await harness.completeOn(
      spawned.id as string,
      spawned.version as number,
      '2027-01-01',
    );

    const dueDates = (await allTodos())
      .map((todo) => todo.dueDate)
      .filter((date): date is string => typeof date === 'string')
      .sort();
    expect(dueDates).toEqual(['2027-01-04', '2027-01-07']);
  });

  it('refuses to add a Recurrence rule to a Completed TODO', async () => {
    const created = await createTodo({
      name: 'One-off',
      dueDate: '2027-01-01',
    });
    const completed = await complete(created.id, created.version);

    const response = await harness.app.inject({
      method: 'PATCH',
      url: `/api/todos/${created.id}`,
      payload: { recurrence: daily, version: completed.version },
    });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({ code: 'RECURRENCE_ON_COMPLETED' });
  });

  it('refuses to add a Recurrence to an archived-then-completed TODO', async () => {
    const created = await createTodo({
      name: 'One-off',
      dueDate: '2027-01-01',
    });
    const completed = await complete(created.id, created.version);
    const archived = await harness.app.inject({
      method: 'POST',
      url: `/api/todos/${created.id}/transitions`,
      payload: { status: 'ARCHIVED', version: completed.version },
    });
    expect(archived.statusCode).toBe(200);

    const response = await harness.app.inject({
      method: 'PATCH',
      url: `/api/todos/${created.id}`,
      payload: { recurrence: daily, version: archived.json().version },
    });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({ code: 'RECURRENCE_ON_COMPLETED' });
  });

  it('does not spawn when a live recurring Occurrence is archived', async () => {
    const created = await createTodo({
      name: 'Daily',
      dueDate: '2027-01-01',
      recurrence: daily,
    });

    const archived = await harness.app.inject({
      method: 'POST',
      url: `/api/todos/${created.id}/transitions`,
      payload: { status: 'ARCHIVED', version: created.version },
    });

    expect(archived.statusCode).toBe(200);
    expect(await allTodos()).toHaveLength(1);
  });

  it('does not spawn when a live recurring Occurrence is deleted', async () => {
    const created = await createTodo({
      name: 'Daily',
      dueDate: '2027-01-01',
      recurrence: daily,
    });

    const deleted = await harness.app.inject({
      method: 'DELETE',
      url: `/api/todos/${created.id}?version=${created.version}`,
    });
    expect(deleted.statusCode).toBe(204);

    const todos = await allTodos();
    expect(todos.map((todo) => todo.status)).toEqual(['NOT_STARTED']);
  });

  it('inherits dependencies outside the series but not in-series ones', async () => {
    const external = await createTodo({ name: 'Buy vitamins' });
    const first = await createTodo({
      name: 'Take vitamins',
      dueDate: '2027-01-01',
      recurrence: daily,
    });
    // first depends on an external TODO
    await harness.app.inject({
      method: 'POST',
      url: `/api/todos/${first.id}/dependencies`,
      payload: { dependsOn: external.id },
    });
    // Satisfy the external blocker so completion is allowed, then complete.
    const externalCompleted = await complete(external.id, external.version);
    expect(externalCompleted.status).toBe('COMPLETED');
    const current = await harness.app.inject({
      method: 'GET',
      url: `/api/todos/${first.id}`,
    });
    await complete(first.id, current.json().version);

    const todos = await allTodos();
    const next = todos.find((todo) => todo.id !== first.id)!;
    expect(
      (next.dependencies as Array<{ id: string }>).map((d) => d.id),
    ).toEqual([external.id]);
  });

  it('skips months without the anchored day', async () => {
    const created = await createTodo({
      name: 'Rent',
      dueDate: '2027-01-31',
      recurrence: monthly31,
    });

    await harness.completeOn(created.id, created.version, '2027-01-31');

    const todos = await allTodos();
    const next = todos.find((todo) => todo.id !== created.id)!;
    expect(next.dueDate).toBe('2027-03-31');
  });

  it('keeps the weekday for a weekly rule', async () => {
    // 2027-01-04 is a Monday.
    const created = await createTodo({
      name: 'Retro',
      dueDate: '2027-01-04',
      recurrence: weeklyMonday,
    });

    await harness.completeOn(created.id, created.version, '2027-01-04');

    const todos = await allTodos();
    const next = todos.find((todo) => todo.id !== created.id)!;
    expect(next.dueDate).toBe('2027-01-11');
  });

  it.each([
    ['last day of month', lastDay, '2027-01-31', '2027-02-28'],
    ['nth weekday (4th Sunday)', fourthSunday, '2027-01-24', '2027-02-28'],
    ['last weekday (last Sunday)', lastSunday, '2027-01-31', '2027-02-28'],
    ['day 31 skips short months', monthly31, '2027-01-31', '2027-03-31'],
    ['multiple weekdays', monWedFri, '2027-01-04', '2027-01-06'],
    ['every-N days', everyThreeDays, '2027-01-01', '2027-01-04'],
  ])(
    'spawns the next Occurrence for %s',
    async (_label, rule, dueDate, expected) => {
      const created = await createTodo({
        name: 'Routine',
        dueDate,
        recurrence: rule,
      });

      // Pin the completion date so the assertion does not depend on wall-clock
      // time (the next due date anchors to the completion date).
      await harness.completeOn(created.id, created.version, dueDate);

      const todos = await allTodos();
      const next = todos.find((todo) => todo.id !== created.id)!;
      expect(next.dueDate).toBe(expected);
      expect(next.recurrence).toEqual(rule);
    },
  );

  it('rejects an invalid Recurrence rule', async () => {
    const response = await harness.app.inject({
      method: 'POST',
      url: '/api/todos',
      payload: {
        name: 'Bad',
        dueDate: '2027-01-01',
        recurrence: {
          mode: 'FIXED_SCHEDULE',
          schedule: { frequency: 'WEEKLY', interval: 1, byWeekday: [] },
        },
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it('round-trips the rule and can remove it to end the series', async () => {
    const created = await createTodo({
      name: 'Daily',
      dueDate: '2027-01-01',
      recurrence: daily,
    });

    const cleared = await harness.app.inject({
      method: 'PATCH',
      url: `/api/todos/${created.id}`,
      payload: { recurrence: null, version: created.version },
    });
    expect(cleared.statusCode).toBe(200);
    expect(cleared.json().recurrence).toBeNull();

    await complete(created.id, cleared.json().version);
    expect(await allTodos()).toHaveLength(1);
  });
});

describe('todos: next occurrence preview (HTTP seam)', () => {
  const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';

  function preview(id: string, from: string) {
    return harness.app.inject({
      method: 'GET',
      url: `/api/todos/${id}/next-occurrence-preview?from=${from}`,
    });
  }

  it('previews the date a habit completion would schedule', async () => {
    const created = await createTodo({
      name: 'Water plants',
      recurrence: everyThreeDaysAfterCompletion,
    });

    const response = await preview(created.id, '2027-01-01');

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      nextDueDate: '2027-01-04',
      skipsAhead: false,
    });
  });

  it('previews the next scheduled date for a fixed rule', async () => {
    const created = await createTodo({
      name: 'Weekly sync',
      dueDate: '2027-01-04',
      recurrence: weeklyMonday,
    });

    const response = await preview(created.id, '2027-01-04');

    expect(response.json()).toEqual({
      nextDueDate: '2027-01-11',
      skipsAhead: false,
    });
  });

  it('has no next occurrence for a one-off', async () => {
    const created = await createTodo({ name: 'One-off' });

    const response = await preview(created.id, '2027-01-01');

    expect(response.json()).toEqual({ nextDueDate: null, skipsAhead: false });
  });

  it('flags a skip-ahead when the date is already in the series', async () => {
    const monthly: RecurrenceRule = {
      mode: 'AFTER_COMPLETION',
      interval: 1,
      unit: 'MONTHS',
    };
    const created = await createTodo({
      name: 'Water plants',
      dueDate: '2027-01-01',
      recurrence: monthly,
    });
    // Complete the original, spawning 2027-02-01.
    await harness.completeOn(created.id, created.version, '2027-01-01');
    const spawned = (await allTodos()).find((todo) => todo.id !== created.id)!;

    // Previewing the fresh occurrence from one interval earlier: the naive date
    // is its own due date (2027-02-01), which the series already holds, so it
    // skips to 2027-03-01.
    const response = await preview(spawned.id as string, '2027-01-01');

    expect(response.json()).toEqual({
      nextDueDate: '2027-03-01',
      skipsAhead: true,
    });
  });

  it('has no next occurrence once the occurrence has already spawned', async () => {
    const created = await createTodo({
      name: 'Water plants',
      dueDate: '2027-01-01',
      recurrence: { mode: 'AFTER_COMPLETION', interval: 1, unit: 'MONTHS' },
    });
    await harness.completeOn(created.id, created.version, '2027-01-01');

    // Re-completing a reopened occurrence spawns nothing, so there is no date.
    const response = await preview(created.id, '2027-01-01');

    expect(response.json()).toEqual({ nextDueDate: null, skipsAhead: false });
  });

  it('returns 404 for an unknown TODO', async () => {
    const response = await preview(UNKNOWN_ID, '2027-01-01');

    expect(response.statusCode).toBe(404);
  });
});

describe('todos: editing recurrence on save (HTTP seam)', () => {
  const UNKNOWN = '00000000-0000-4000-8000-000000000000';

  function patch(id: string, payload: Record<string, unknown>) {
    return harness.app.inject({
      method: 'PATCH',
      url: `/api/todos/${id}`,
      payload,
    });
  }

  async function archive(id: string, version: number): Promise<Todo> {
    const response = await harness.app.inject({
      method: 'POST',
      url: `/api/todos/${id}/transitions`,
      payload: { status: 'ARCHIVED', version },
    });
    expect(response.statusCode).toBe(200);
    return response.json() as Todo;
  }

  /** The full body the web form sends on save, with the current rule echoed. */
  function uiBody(todo: Todo, recurrence: unknown) {
    return {
      name: `${todo.name} (edited)`,
      description: todo.description,
      dueDate: todo.dueDate,
      priority: todo.priority,
      recurrence,
      version: todo.version,
    };
  }

  it('edits a completed recurring occurrence when the rule is echoed unchanged', async () => {
    const created = await createTodo({
      name: 'Daily standup',
      dueDate: '2027-01-01',
      recurrence: daily,
    });
    const completed = (await complete(created.id, created.version)) as Todo;

    const response = await patch(
      created.id,
      uiBody(completed, completed.recurrence),
    );

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ name: 'Daily standup (edited)' });
  });

  it('edits an archived-after-completion occurrence with an echoed rule', async () => {
    const created = await createTodo({
      name: 'Weekly sync',
      dueDate: '2027-01-04',
      recurrence: weeklyMonday,
    });
    const completed = (await complete(created.id, created.version)) as Todo;
    const archived = await archive(created.id, completed.version);

    const response = await patch(
      created.id,
      uiBody(archived, archived.recurrence),
    );

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ name: 'Weekly sync (edited)' });
  });

  it('changes the rule on a live (not completed) occurrence', async () => {
    const created = await createTodo({
      name: 'Daily',
      dueDate: '2027-01-01',
      recurrence: daily,
    });

    const response = await patch(created.id, {
      recurrence: weeklyMonday,
      version: created.version,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ recurrence: weeklyMonday });
  });

  it('refuses a changed rule on a completed occurrence', async () => {
    const created = await createTodo({
      name: 'Daily standup',
      dueDate: '2027-01-01',
      recurrence: daily,
    });
    const completed = await complete(created.id, created.version);

    const response = await patch(created.id, {
      recurrence: weeklyMonday,
      version: completed.version,
    });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({ code: 'RECURRENCE_ON_COMPLETED' });
  });

  it('refuses removing the rule from a completed occurrence', async () => {
    const created = await createTodo({
      name: 'Daily standup',
      dueDate: '2027-01-01',
      recurrence: daily,
    });
    const completed = await complete(created.id, created.version);

    const response = await patch(created.id, {
      recurrence: null,
      version: completed.version,
    });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({ code: 'RECURRENCE_ON_COMPLETED' });
  });

  it('returns 404 (not 422) for a rule on a Deleted TODO', async () => {
    const created = await createTodo({
      name: 'Gone',
      dueDate: '2027-01-01',
      recurrence: daily,
    });
    const deleted = await harness.app.inject({
      method: 'DELETE',
      url: `/api/todos/${created.id}?version=${created.version}`,
    });
    expect(deleted.statusCode).toBe(204);

    const response = await patch(created.id, {
      recurrence: daily,
      version: 2,
    });

    expect(response.statusCode).toBe(404);
  });

  it('returns 404 for a rule on an unknown TODO', async () => {
    const response = await patch(UNKNOWN, { recurrence: daily, version: 1 });

    expect(response.statusCode).toBe(404);
  });
});

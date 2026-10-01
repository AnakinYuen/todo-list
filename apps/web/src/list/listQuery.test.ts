import { describe, expect, it } from 'vitest';
import { DEFAULT_LIST_LIMIT, type Todo } from '@todo-list/shared';
import {
  DEFAULT_FILTERS,
  buildListParams,
  failLoad,
  initialListState,
  receivePage,
  startAppend,
  startReload,
  startReset,
  withFilters,
  type ListState,
} from './listQuery';

function todo(id: string): Todo {
  return {
    id,
    name: id,
    description: null,
    dueDate: null,
    status: 'NOT_STARTED',
    priority: 'MEDIUM',
    blocked: false,
    blockedBy: [],
    dependencies: [],
    recurrence: null,
    seriesId: null,
    version: 1,
    completedAt: null,
    deletedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function ids(state: ListState): string[] {
  return state.todos.map((entry) => entry.id);
}

describe('listQuery: params', () => {
  it('maps the default filters to params, omitting the empty ones', () => {
    const params = buildListParams(DEFAULT_FILTERS);

    expect(params).toMatchObject({
      sort: 'dueDate',
      order: 'asc',
      limit: DEFAULT_LIST_LIMIT,
    });
    expect(params.status).toBeUndefined();
    expect(params.priority).toBeUndefined();
    expect(params.overdue).toBeUndefined();
    expect(params.blocked).toBeUndefined();
    expect(params.cursor).toBeUndefined();
  });

  it('carries a cursor and turns the blocked filter into a boolean', () => {
    const params = buildListParams(
      { ...DEFAULT_FILTERS, status: 'IN_PROGRESS', blocked: 'true' },
      'cur',
    );

    expect(params.status).toBe('IN_PROGRESS');
    expect(params.blocked).toBe(true);
    expect(params.cursor).toBe('cur');
  });
});

describe('listQuery: filters', () => {
  it('merges a patch and leaves the other fields alone', () => {
    const next = withFilters(initialListState, { priority: 'HIGH' });

    expect(next.filters.priority).toBe('HIGH');
    expect(next.filters.sort).toBe('dueDate');
    expect(next.todos).toBe(initialListState.todos);
  });
});

describe('listQuery: starting a load', () => {
  it('starts a fresh load at page one with a new generation', () => {
    const before: ListState = {
      ...initialListState,
      generation: 4,
      todos: [todo('a'), todo('b')],
    };

    const { state, load } = startReset(before);

    expect(state.generation).toBe(5);
    expect(state.loading).toBe(true);
    expect(state.loadingMore).toBe(false);
    expect(state.error).toBeNull();
    expect(load).toEqual({
      generation: 5,
      target: DEFAULT_LIST_LIMIT,
      append: false,
      cursor: undefined,
    });
    // The rows stay put while the reset is in flight, so the pane does not flash.
    expect(ids(state)).toEqual(['a', 'b']);
  });

  it('reloads to the loaded page count, never below one page', () => {
    const many: ListState = {
      ...initialListState,
      generation: 1,
      todos: Array.from({ length: 30 }, (_, i) => todo(`t${i}`)),
    };
    expect(startReload(many).load.target).toBe(30);

    const few: ListState = {
      ...initialListState,
      generation: 1,
      todos: [todo('a')],
    };
    expect(startReload(few).load.target).toBe(DEFAULT_LIST_LIMIT);
  });

  it('appends only when there is a cursor and nothing is already loading', () => {
    expect(startAppend(initialListState)).toBeNull();
    expect(
      startAppend({ ...initialListState, nextCursor: 'c', loadingMore: true }),
    ).toBeNull();
    expect(
      startAppend({ ...initialListState, nextCursor: 'c', loading: true }),
    ).toBeNull();

    const started = startAppend({
      ...initialListState,
      generation: 3,
      nextCursor: 'c',
      loading: false,
    });
    if (!started) {
      throw new Error('expected an append load');
    }
    const { state, load } = started;

    expect(state.loadingMore).toBe(true);
    expect(state.generation).toBe(3);
    expect(load).toEqual({
      generation: 3,
      target: DEFAULT_LIST_LIMIT,
      append: true,
      cursor: 'c',
    });
  });
});

describe('listQuery: settling a load', () => {
  const state: ListState = {
    ...initialListState,
    generation: 5,
    todos: [todo('old')],
  };

  it('replaces the rows on a reset', () => {
    const load = {
      generation: 5,
      target: 20,
      append: false,
      cursor: undefined,
    };
    const next = receivePage(state, load, {
      todos: [todo('a'), todo('b')],
      nextCursor: 'n',
    });

    expect(ids(next)).toEqual(['a', 'b']);
    expect(next.nextCursor).toBe('n');
    expect(next.loading).toBe(false);
    expect(next.error).toBeNull();
  });

  it('appends to the rows on a load-more', () => {
    const load = { generation: 5, target: 20, append: true, cursor: 'n' };
    const next = receivePage(state, load, {
      todos: [todo('c')],
      nextCursor: null,
    });

    expect(ids(next)).toEqual(['old', 'c']);
    expect(next.nextCursor).toBeNull();
    expect(next.loadingMore).toBe(false);
  });

  it('drops a page from a superseded load', () => {
    const stale = {
      generation: 4,
      target: 20,
      append: false,
      cursor: undefined,
    };
    const next = receivePage(state, stale, {
      todos: [todo('stale')],
      nextCursor: null,
    });

    expect(next).toBe(state);
  });

  it('records a failure and clears both loading flags', () => {
    const busy: ListState = { ...state, loading: true, loadingMore: true };
    const next = failLoad(
      busy,
      { generation: 5, target: 20, append: false, cursor: undefined },
      'boom',
    );

    expect(next.error).toBe('boom');
    expect(next.loading).toBe(false);
    expect(next.loadingMore).toBe(false);
  });

  it('ignores a failure from a superseded load', () => {
    const next = failLoad(
      state,
      { generation: 1, target: 20, append: false, cursor: undefined },
      'boom',
    );

    expect(next).toBe(state);
  });
});

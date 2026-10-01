import {
  DEFAULT_LIST_LIMIT,
  type BooleanQuery,
  type ListTodosParams,
  type SortOrder,
  type Todo,
  type TodoPage,
  type TodoPriority,
  type TodoSort,
  type TodoStatus,
} from '@todo-list/shared';

/**
 * The list's filter and sort inputs, carried as one object rather than eight
 * separate state slots. This module is pure: it builds query params and moves a
 * `ListState` through the load lifecycle, and never performs a fetch.
 */
export interface ListFilters {
  status: TodoStatus | '';
  priority: TodoPriority | '';
  dueAfter: string;
  dueBefore: string;
  overdue: boolean;
  blocked: '' | BooleanQuery;
  sort: TodoSort;
  order: SortOrder;
}

export const DEFAULT_FILTERS: ListFilters = {
  status: '',
  priority: '',
  dueAfter: '',
  dueBefore: '',
  overdue: false,
  blocked: '',
  sort: 'dueDate',
  order: 'asc',
};

/** A load in flight: the generation it belongs to, and what it aims to hold. */
export interface Load {
  generation: number;
  /** Rows to hold when this load settles — the loaded count, for a reload. */
  target: number;
  append: boolean;
  cursor: string | undefined;
}

/** The next state alongside the load the caller must now perform. */
export interface Started {
  state: ListState;
  load: Load;
}

export interface ListState {
  filters: ListFilters;
  todos: Todo[];
  nextCursor: string | null;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  /** Bumped whenever a fresh load starts; a stale response is dropped. */
  generation: number;
}

export const initialListState: ListState = {
  filters: DEFAULT_FILTERS,
  todos: [],
  nextCursor: null,
  loading: true,
  loadingMore: false,
  error: null,
  generation: 0,
};

/** The `ListTodosParams` for a page, derived from the filters. */
export function buildListParams(
  filters: ListFilters,
  cursor?: string,
): Partial<ListTodosParams> {
  return {
    status: filters.status || undefined,
    priority: filters.priority || undefined,
    dueAfter: filters.dueAfter || undefined,
    dueBefore: filters.dueBefore || undefined,
    overdue: filters.overdue || undefined,
    blocked: filters.blocked === '' ? undefined : filters.blocked === 'true',
    sort: filters.sort,
    order: filters.order,
    limit: DEFAULT_LIST_LIMIT,
    cursor,
  };
}

export function withFilters(
  state: ListState,
  patch: Partial<ListFilters>,
): ListState {
  return { ...state, filters: { ...state.filters, ...patch } };
}

/** A fresh page-one load: the initial load, or after a filter/sort change. */
export function startReset(state: ListState): Started {
  return beginFresh(state, DEFAULT_LIST_LIMIT);
}

/** Re-fetch after a mutation, keeping the rows already loaded. */
export function startReload(state: ListState): Started {
  return beginFresh(state, Math.max(state.todos.length, DEFAULT_LIST_LIMIT));
}

function beginFresh(state: ListState, target: number): Started {
  const generation = state.generation + 1;
  return {
    state: {
      ...state,
      loading: true,
      loadingMore: false,
      error: null,
      generation,
    },
    load: { generation, target, append: false, cursor: undefined },
  };
}

/**
 * Append the next page. Null when there is no cursor, or a load is already in
 * flight — an append must not share a generation with a reset/reload it would
 * then interleave with.
 */
export function startAppend(state: ListState): Started | null {
  if (!state.nextCursor || state.loading || state.loadingMore) {
    return null;
  }
  return {
    state: { ...state, loadingMore: true, error: null },
    load: {
      generation: state.generation,
      target: DEFAULT_LIST_LIMIT,
      append: true,
      cursor: state.nextCursor,
    },
  };
}

/** Settle a load with its page; a superseded generation leaves the state alone. */
export function receivePage(
  state: ListState,
  load: Load,
  page: TodoPage,
): ListState {
  if (load.generation !== state.generation) {
    return state;
  }
  return {
    ...state,
    todos: load.append ? [...state.todos, ...page.todos] : page.todos,
    nextCursor: page.nextCursor,
    loading: false,
    loadingMore: false,
    error: null,
  };
}

/** Settle a load with a failure; a superseded generation leaves the state alone. */
export function failLoad(
  state: ListState,
  load: Load,
  message: string,
): ListState {
  if (load.generation !== state.generation) {
    return state;
  }
  return { ...state, loading: false, loadingMore: false, error: message };
}

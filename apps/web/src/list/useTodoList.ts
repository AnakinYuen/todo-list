import { useCallback, useEffect, useRef, useState } from 'react';
import type { Todo } from '@todo-list/shared';
import { describeError, listTodos } from '../api';
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
  type ListFilters,
  type ListState,
  type Load,
} from './listQuery';

export interface TodoList {
  todos: Todo[];
  nextCursor: string | null;
  hasMore: boolean;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  /** When the list was last successfully fetched from the server. */
  lastSyncedAt: Date | null;
  filters: ListFilters;
  setFilters: (patch: Partial<ListFilters>) => void;
  clearFilters: () => void;
  loadMore: () => Promise<void>;
  reload: () => Promise<void>;
  /** Replace one loaded row in place, e.g. from a fresh single-TODO fetch. */
  replace: (todo: Todo) => void;
}

export interface UseTodoListOptions {
  /** The fetch adapter; injectable so tests need no network. Defaults to the API. */
  list?: typeof listTodos;
}

/**
 * The list state machine: filters, keyset pagination and the loads in flight,
 * over the pure transitions in `listQuery`. Selection and the detail panel are
 * deliberately not here — they belong to the caller.
 */
export function useTodoList(options: UseTodoListOptions = {}): TodoList {
  const list = options.list ?? listTodos;
  const [state, setState] = useState<ListState>(initialListState);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  // A synchronous mirror of the state, so a load started in an event handler
  // reads the generation and filters it just wrote, not last render's. Every
  // write goes through `apply`, so the mirror cannot drift.
  const stateRef = useRef(state);

  const apply = useCallback((next: ListState): void => {
    stateRef.current = next;
    setState(next);
  }, []);

  /** Fetch a load's page(s) and settle the state — dropping a superseded load. */
  const fetchLoad = useCallback(
    async (load: Load, filters: ListFilters): Promise<void> => {
      try {
        const first = await list(buildListParams(filters, load.cursor));
        let items = first.todos;
        let cursor = first.nextCursor;
        // A reload re-fetches up to the previously loaded count; an append is
        // exactly one page. Keyset pages are fixed size, so a reload can
        // overshoot to the next boundary — more rows, never wrong ones.
        while (!load.append && cursor && items.length < load.target) {
          const page = await list(buildListParams(filters, cursor));
          items = [...items, ...page.todos];
          cursor = page.nextCursor;
        }
        const current = stateRef.current;
        const settled = receivePage(current, load, {
          todos: items,
          nextCursor: cursor,
        });
        apply(settled);
        // Only a page that is actually applied is a sync; a superseded load is
        // dropped by `receivePage` and must not move the timestamp.
        if (settled !== current) {
          setLastSyncedAt(new Date());
        }
      } catch (cause) {
        apply(failLoad(stateRef.current, load, describeError(cause)));
      }
    },
    [apply, list],
  );

  const runLoad = useCallback(
    async (kind: 'reset' | 'reload'): Promise<void> => {
      const current = stateRef.current;
      const started =
        kind === 'reset' ? startReset(current) : startReload(current);
      apply(started.state);
      await fetchLoad(started.load, started.state.filters);
    },
    [apply, fetchLoad],
  );

  useEffect(() => {
    void runLoad('reset');
  }, [runLoad]);

  const setFilters = useCallback(
    (patch: Partial<ListFilters>): void => {
      apply(withFilters(stateRef.current, patch));
      void runLoad('reset');
    },
    [apply, runLoad],
  );

  const clearFilters = useCallback((): void => {
    setFilters(DEFAULT_FILTERS);
  }, [setFilters]);

  const loadMore = useCallback(async (): Promise<void> => {
    const started = startAppend(stateRef.current);
    if (!started) {
      return;
    }
    apply(started.state);
    await fetchLoad(started.load, started.state.filters);
  }, [apply, fetchLoad]);

  const reload = useCallback((): Promise<void> => runLoad('reload'), [runLoad]);

  const replace = useCallback(
    (todo: Todo): void => {
      const current = stateRef.current;
      if (!current.todos.some((row) => row.id === todo.id)) {
        return;
      }
      apply({
        ...current,
        todos: current.todos.map((row) => (row.id === todo.id ? todo : row)),
      });
    },
    [apply],
  );

  return {
    todos: state.todos,
    nextCursor: state.nextCursor,
    hasMore: state.nextCursor !== null,
    loading: state.loading,
    loadingMore: state.loadingMore,
    error: state.error,
    lastSyncedAt,
    filters: state.filters,
    setFilters,
    clearFilters,
    loadMore,
    reload,
    replace,
  };
}

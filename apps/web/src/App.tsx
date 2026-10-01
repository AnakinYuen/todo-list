import { useEffect, useState } from 'react';
import {
  TodoPriority,
  TodoSort,
  TodoStatus,
  SortOrder,
  todoPriorityLabels,
  todoStatusLabels,
  type BooleanQuery,
  type Todo,
} from '@todo-list/shared';
import { describeError, getTodo } from './api';
import { CreateTodoDialog } from './CreateTodoDialog';
import { formatDate } from './format';
import { useTodoList } from './list/useTodoList';
import { TodoDetail } from './TodoDetail';

const sortLabels: Record<TodoSort, string> = {
  dueDate: 'Due date',
  priority: 'Priority',
  status: 'Status',
  name: 'Name',
};

const orderLabels: Record<SortOrder, string> = {
  asc: 'Ascending',
  desc: 'Descending',
};

export function App() {
  const list = useTodoList();
  const [selected, setSelected] = useState<Todo | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);
  const error = list.error ?? openError;

  // A completed list load clears an earlier "no longer exists" banner, as the
  // single-error app did before the split.
  useEffect(() => {
    if (!list.loading) {
      setOpenError(null);
    }
  }, [list.loading]);

  /** Fetch one TODO, show it, and keep its list row in sync. */
  async function loadTodo(id: string): Promise<Todo | null> {
    try {
      const todo = await getTodo(id);
      setSelected(todo);
      list.replace(todo);
      setOpenError(null);
      return todo;
    } catch (cause) {
      setOpenError(describeError(cause));
      return null;
    }
  }

  function open(id: string): void {
    void loadTodo(id);
  }

  function refreshSelected(): Promise<Todo | null> {
    return selected ? loadTodo(selected.id) : Promise.resolve(null);
  }

  /** A stale write: refresh the list and the selected TODO. */
  function onConflict(): void {
    void list.reload();
    if (selected) {
      void loadTodo(selected.id);
    }
  }

  /** The selected TODO is gone: close it and refresh the list. */
  function onGone(): void {
    setSelected(null);
    void list.reload();
  }

  function handleChanged(updated: Todo): void {
    setSelected(updated);
    list.replace(updated);
    void list.reload();
  }

  function handleDeleted(): void {
    setSelected(null);
    void list.reload();
  }

  return (
    <>
      <header className="app-header">
        <div className="app-header__inner">
          <div className="brand">
            TODO list <span>· shared</span>
          </div>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => setCreateOpen(true)}
          >
            + New TODO
          </button>
        </div>
      </header>

      <div className="toolbar">
        <div className="toolbar__inner">
          <label className="field">
            <span>Status</span>
            <select
              value={list.filters.status}
              onChange={(event) =>
                list.setFilters({
                  status: event.target.value as TodoStatus | '',
                })
              }
            >
              <option value="">All</option>
              {TodoStatus.options.map((option) => (
                <option key={option} value={option}>
                  {todoStatusLabels[option]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Priority</span>
            <select
              value={list.filters.priority}
              onChange={(event) =>
                list.setFilters({
                  priority: event.target.value as TodoPriority | '',
                })
              }
            >
              <option value="">All</option>
              {TodoPriority.options.map((option) => (
                <option key={option} value={option}>
                  {todoPriorityLabels[option]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Due after</span>
            <input
              type="date"
              value={list.filters.dueAfter}
              onChange={(event) =>
                list.setFilters({ dueAfter: event.target.value })
              }
            />
          </label>
          <label className="field">
            <span>Due before</span>
            <input
              type="date"
              value={list.filters.dueBefore}
              onChange={(event) =>
                list.setFilters({ dueBefore: event.target.value })
              }
            />
          </label>
          <label className="field">
            <span>Blocked</span>
            <select
              value={list.filters.blocked}
              onChange={(event) =>
                list.setFilters({
                  blocked: event.target.value as '' | BooleanQuery,
                })
              }
            >
              <option value="">All</option>
              <option value="true">Blocked</option>
              <option value="false">Unblocked</option>
            </select>
          </label>
          <label className="field">
            <span>Sort</span>
            <select
              value={list.filters.sort}
              onChange={(event) =>
                list.setFilters({ sort: event.target.value as TodoSort })
              }
            >
              {TodoSort.options.map((option) => (
                <option key={option} value={option}>
                  {sortLabels[option]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Order</span>
            <select
              value={list.filters.order}
              onChange={(event) =>
                list.setFilters({ order: event.target.value as SortOrder })
              }
            >
              {SortOrder.options.map((option) => (
                <option key={option} value={option}>
                  {orderLabels[option]}
                </option>
              ))}
            </select>
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={list.filters.overdue}
              onChange={(event) =>
                list.setFilters({ overdue: event.target.checked })
              }
            />
            Overdue only
          </label>
          <span className="toolbar__spacer" />
          <button
            type="button"
            className="btn btn--ghost"
            onClick={list.clearFilters}
          >
            Clear
          </button>
        </div>
      </div>

      <main className={`layout ${selected ? 'detail-open' : ''}`}>
        <section className="list-pane" aria-busy={list.loading}>
          <div className="list-pane__head">
            <h2>
              TODOs{' '}
              <span className="count">{`· ${list.todos.length} shown`}</span>
            </h2>
            <div className="sync">
              {list.lastSyncedAt ? (
                <time dateTime={list.lastSyncedAt.toISOString()}>
                  Synced {list.lastSyncedAt.toLocaleTimeString()}
                </time>
              ) : (
                <span>Not synced yet</span>
              )}
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                disabled={list.loading || list.loadingMore}
                onClick={() => void list.reload()}
                aria-label="Refresh the TODO list from the server"
              >
                Refresh
              </button>
            </div>
          </div>
          <p className="visually-hidden" role="status">
            {list.loading
              ? 'Loading TODOs'
              : `Showing ${list.todos.length} TODOs`}
          </p>
          {error ? (
            <p className="error" role="alert">
              {error}
            </p>
          ) : null}
          {list.loading && list.todos.length === 0 ? (
            <p className="muted">Loading TODOs…</p>
          ) : list.todos.length === 0 ? (
            error ? null : (
              <p className="empty">No TODOs match these filters.</p>
            )
          ) : (
            <ul className="todo-list">
              {list.todos.map((todo) => (
                <li
                  key={todo.id}
                  className={`todo-row ${todo.id === selected?.id ? 'is-selected' : ''}`}
                >
                  <button
                    type="button"
                    className="todo-row__open"
                    aria-label={`Open ${todo.name}`}
                    onClick={() => open(todo.id)}
                  >
                    <span className={`pill pill--${todo.status}`}>
                      {todoStatusLabels[todo.status]}
                    </span>
                    <span className="todo-row__main">
                      <span className="todo-row__name">{todo.name}</span>
                      <span className="todo-row__meta">
                        <span>
                          <span
                            className={`dot dot--${todo.priority.toLowerCase()}`}
                          />
                          {todoPriorityLabels[todo.priority]}
                        </span>
                        {todo.dueDate ? (
                          <span>due {formatDate(todo.dueDate)}</span>
                        ) : null}
                        {todo.recurrence ? <span>↻ repeats</span> : null}
                      </span>
                    </span>
                  </button>
                  <span className="todo-row__badges">
                    {todo.blocked ? (
                      <span className="chip-blocked">
                        Blocked by{' '}
                        {todo.blockedBy.map((dependency, index) => (
                          <span key={dependency.id}>
                            {index > 0 ? ', ' : ''}
                            <button
                              type="button"
                              aria-label={`Open blocker ${dependency.name}`}
                              onClick={() => open(dependency.id)}
                            >
                              {dependency.name}
                            </button>
                          </span>
                        ))}
                      </span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="list-more">
            {list.hasMore ? (
              <button
                type="button"
                className="btn"
                disabled={list.loadingMore || list.loading}
                onClick={() => void list.loadMore()}
              >
                {list.loadingMore ? 'Loading…' : 'Load more'}
              </button>
            ) : list.todos.length > 0 ? (
              <span className="muted-sm">All {list.todos.length} shown</span>
            ) : null}
          </div>
        </section>

        {selected ? (
          <TodoDetail
            key={selected.id}
            todo={selected}
            suspended={createOpen}
            onChanged={handleChanged}
            onConflict={onConflict}
            onGone={onGone}
            refreshSelected={refreshSelected}
            onRefreshList={() => void list.reload()}
            onClose={() => setSelected(null)}
            onDeleted={handleDeleted}
          />
        ) : null}
      </main>

      {createOpen ? (
        <CreateTodoDialog
          onCreated={() => {
            setCreateOpen(false);
            void list.reload();
          }}
          onClose={() => setCreateOpen(false)}
        />
      ) : null}
    </>
  );
}

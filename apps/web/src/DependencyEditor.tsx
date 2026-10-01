import { useEffect, useRef, useState } from 'react';
import { todoStatusLabels, type Todo, type TodoRef } from '@todo-list/shared';
import { addDependency, removeDependency, searchTodos, ApiError } from './api';
import { pickCandidates } from './dependencySearch';
import { recoveryFor } from './errorRecovery';
import { useAction } from './useAction';

interface DependencyEditorProps {
  todo: Todo;
  onChanged: (updated: Todo) => void;
  onGone: () => void;
}

const SEARCH_DEBOUNCE_MS = 250;

export function DependencyEditor({
  todo,
  onChanged,
  onGone,
}: DependencyEditorProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TodoRef[]>([]);
  const [searching, setSearching] = useState(false);
  const { run, pending, error } = useAction<'add' | 'remove'>();
  // Bumped per search; a response from an older generation is dropped.
  const generation = useRef(0);

  /** A rejected edge edit: close the panel if the TODO is gone. */
  function recover(cause: unknown): void {
    if (
      recoveryFor(cause instanceof ApiError ? cause.code : undefined) === 'gone'
    ) {
      onGone();
    }
  }

  useEffect(() => {
    // Invalidate any in-flight search on every query change — including one that
    // drops back to empty — so a stale response can never land.
    const current = generation.current + 1;
    generation.current = current;

    const term = query.trim();
    if (term.length < 1) {
      setResults([]);
      setSearching(false);
      return undefined;
    }
    setSearching(true);
    const timer = setTimeout(() => {
      void searchTodos(term)
        .then((found) => {
          if (generation.current === current) {
            setResults(found);
            setSearching(false);
          }
        })
        .catch(() => {
          if (generation.current === current) {
            setResults([]);
            setSearching(false);
          }
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const busy = pending !== null;
  const candidates = pickCandidates(results, todo);
  const searchingOrEmpty = query.trim().length >= 1;

  async function add(dependencyId: string): Promise<void> {
    await run(
      'add',
      async () => {
        onChanged(await addDependency(todo.id, dependencyId));
        setQuery('');
        setResults([]);
      },
      { onError: recover },
    );
  }

  async function remove(dependencyId: string): Promise<void> {
    await run(
      'remove',
      async () => {
        onChanged(await removeDependency(todo.id, dependencyId));
      },
      { onError: recover },
    );
  }

  return (
    <section className="panel" aria-busy={busy}>
      <h3>Dependencies</h3>
      {todo.dependencies.length === 0 ? (
        <p className="muted-sm">No dependencies yet.</p>
      ) : (
        <ul className="dep-list">
          {todo.dependencies.map((dependency) => (
            <li key={dependency.id}>
              <span className="dep-name">{dependency.name}</span>
              <span className="row-inline">
                <span className={`pill pill--${dependency.status}`}>
                  {todoStatusLabels[dependency.status]}
                </span>
                <button
                  type="button"
                  className="btn btn--sm"
                  aria-label={`Remove dependency ${dependency.name}`}
                  disabled={busy}
                  onClick={() => void remove(dependency.id)}
                >
                  Remove
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="row-inline">
        <input
          type="text"
          aria-label="Search TODOs to depend on"
          placeholder="Type the start of a name…"
          value={query}
          disabled={busy}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      {searchingOrEmpty ? (
        searching ? (
          <p className="muted-sm">Searching…</p>
        ) : candidates.length > 0 ? (
          <ul className="dep-list">
            {candidates.map((candidate) => (
              <li key={candidate.id}>
                <span className="dep-name">{candidate.name}</span>
                <span className="row-inline">
                  <span className={`pill pill--${candidate.status}`}>
                    {todoStatusLabels[candidate.status]}
                  </span>
                  <button
                    type="button"
                    className="btn btn--sm"
                    aria-label={`Add dependency ${candidate.name}`}
                    disabled={busy}
                    onClick={() => void add(candidate.id)}
                  >
                    Add
                  </button>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted-sm">No TODOs start with that.</p>
        )
      ) : null}

      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}

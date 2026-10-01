import { useState } from 'react';
import {
  TodoStatus,
  todoStatusLabels,
  type NextOccurrencePreview,
  type Todo,
  type TransitionImpactEntry,
} from '@todo-list/shared';
import {
  getNextOccurrencePreview,
  getTransitionImpact,
  transitionTodo,
  ApiError,
} from './api';
import { recoveryFor } from './errorRecovery';
import { formatDate } from './format';
import { useAction } from './useAction';

interface StatusControlsProps {
  todo: Todo;
  onChanged: (updated: Todo) => void;
  onConflict: () => void;
  onGone: () => void;
}

type Confirm =
  | {
      kind: 'cascade';
      status: TodoStatus;
      affected: TransitionImpactEntry[];
      total: number;
    }
  | {
      kind: 'recurrence';
      status: TodoStatus;
      preview: NextOccurrencePreview;
    };

/**
 * The Status segmented control. Ordinary transitions apply on click; a click
 * that would cascade over started dependents, or complete a recurring TODO,
 * asks the server for the exact effect and confirms first — the same rule the
 * write uses, so the warning cannot disagree with the outcome.
 */
export function StatusControls({
  todo,
  onChanged,
  onConflict,
  onGone,
}: StatusControlsProps) {
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const { run, pending, error } = useAction<'apply'>();
  const applying = pending !== null;

  /** A rejected write: refresh the TODO if it changed, close it if it's gone. */
  function recover(cause: unknown): void {
    const recovery = recoveryFor(
      cause instanceof ApiError ? cause.code : undefined,
    );
    if (recovery === 'conflict') {
      onConflict();
    } else if (recovery === 'gone') {
      onGone();
    }
  }

  /** The write itself, shared by a direct click and a confirmed one. */
  async function commit(status: TodoStatus): Promise<void> {
    onChanged(await transitionTodo(todo.id, { status, version: todo.version }));
    setConfirm(null);
  }

  async function apply(status: TodoStatus): Promise<void> {
    await run('apply', () => commit(status), { onError: recover });
  }

  async function onSelect(status: TodoStatus): Promise<void> {
    if (status === todo.status || applying) {
      return;
    }
    // A Blocked TODO cannot enter In Progress or Completed anyway, so skip the
    // impact read: the transition's 422 names the blockers. The one gated
    // transition that could also cascade is reopening a completed TODO to In
    // Progress; if `blocked` is stale, skipping the read would hide that
    // confirmation, so that case still runs the full path.
    const gated = status === 'IN_PROGRESS' || status === 'COMPLETED';
    const canCascade = status === 'IN_PROGRESS' && todo.completedAt !== null;
    if (todo.blocked && gated && !canCascade) {
      await apply(status);
      return;
    }
    await run(
      'apply',
      async () => {
        const { affected, total } = await getTransitionImpact(todo.id, status);
        if (affected.length > 0) {
          setConfirm({ kind: 'cascade', status, affected, total });
          return;
        }
        if (status === 'COMPLETED' && todo.recurrence && !todo.blocked) {
          const preview = await getNextOccurrencePreview(todo.id);
          if (preview.nextDueDate) {
            setConfirm({ kind: 'recurrence', status, preview });
            return;
          }
        }
        await commit(status);
      },
      { onError: recover },
    );
  }

  return (
    <section className="panel" aria-busy={applying}>
      <h3>Status</h3>
      <div className="segmented" role="radiogroup" aria-label="Status">
        {TodoStatus.options.map((status) => {
          const active = status === todo.status;
          return (
            <button
              key={status}
              type="button"
              role="radio"
              aria-checked={active}
              className={`segmented__btn ${active ? 'is-active' : ''}`}
              disabled={applying}
              onClick={() => void onSelect(status)}
            >
              {todoStatusLabels[status]}
            </button>
          );
        })}
      </div>
      {confirm ? (
        <div className="confirm" role="alertdialog">
          {confirm.kind === 'cascade' ? (
            <>
              <p>
                This change will move these started dependents back to Not
                Started:
              </p>
              <ul>
                {confirm.affected.map((entry) => (
                  <li key={entry.id}>
                    {entry.name}: {todoStatusLabels[entry.from]} →{' '}
                    {todoStatusLabels[entry.to]}
                  </li>
                ))}
              </ul>
              {confirm.total > confirm.affected.length ? (
                <p className="muted-sm">
                  Showing {confirm.affected.length} of {confirm.total}.
                </p>
              ) : null}
            </>
          ) : (
            <p>
              Completing now schedules the next occurrence for{' '}
              <strong>{formatDate(confirm.preview.nextDueDate ?? '')}</strong>
              {confirm.preview.skipsAhead
                ? ' — skipping ahead because that date already exists in this series'
                : ''}
              .
            </p>
          )}
          <div className="confirm__actions">
            <button
              type="button"
              className="btn btn--primary btn--sm"
              disabled={applying}
              onClick={() => void apply(confirm.status)}
            >
              {applying ? 'Applying…' : 'Confirm'}
            </button>
            <button
              type="button"
              className="btn btn--sm"
              disabled={applying}
              onClick={() => setConfirm(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}

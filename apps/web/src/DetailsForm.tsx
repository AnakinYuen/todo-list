import { useEffect, useState, type FormEvent } from 'react';
import {
  TodoPriority,
  todoPriorityLabels,
  type DeleteImpact,
  type Todo,
} from '@todo-list/shared';
import { deleteTodo, getDeleteImpact, updateTodo, ApiError } from './api';
import { RecurrenceEditor } from './RecurrenceEditor';
import { formOf, ruleOf, type RuleForm } from './recurrenceForm';
import { recoveryFor } from './errorRecovery';
import { useAction } from './useAction';

interface DetailsFormProps {
  todo: Todo;
  onChanged: (updated: Todo) => void;
  onDirtyChange: (dirty: boolean) => void;
  onDeleted: () => void;
  onGone: () => void;
  refreshSelected: () => Promise<Todo | null>;
  onRefreshList: () => void;
}

interface FormFields {
  name: string;
  description: string;
  dueDate: string;
  priority: TodoPriority;
  rule: RuleForm;
}

/** The fields this form owns, read off a TODO, for init, revert and dirty. */
function fieldsOf(todo: Todo): FormFields {
  return {
    name: todo.name,
    description: todo.description ?? '',
    dueDate: todo.dueDate ?? '',
    priority: todo.priority,
    rule: formOf(todo.recurrence),
  };
}

/**
 * The editable Details section. Save and Revert are explicit and disabled while
 * the form is clean; the parent uses `onDirtyChange` to guard closing.
 */
export function DetailsForm({
  todo,
  onChanged,
  onDirtyChange,
  onDeleted,
  onGone,
  refreshSelected,
  onRefreshList,
}: DetailsFormProps) {
  const [form, setForm] = useState<FormFields>(() => fieldsOf(todo));
  const [deleteImpact, setDeleteImpact] = useState<DeleteImpact | null>(null);
  const [saved, setSaved] = useState(false);
  // A stale write: the row is refreshed, and the draft is kept until the user
  // explicitly reloads the latest version.
  const [reloadOffered, setReloadOffered] = useState(false);
  const { run, pending, error, clearError } = useAction<'save' | 'delete'>();
  const busy = pending !== null;

  /**
   * A rejected write. A save conflict keeps the draft and refreshes only the
   * list (re-fetching the TODO here would rebase `version` and let the next save
   * silently overwrite the other writer); a gone TODO closes the panel.
   */
  function recover(cause: unknown): void {
    const recovery = recoveryFor(
      cause instanceof ApiError ? cause.code : undefined,
    );
    if (recovery === 'conflict') {
      setReloadOffered(true);
      onRefreshList();
    } else if (recovery === 'gone') {
      onGone();
    }
  }

  /** Discard the draft and load the server's current version into the form. */
  async function reloadLatest(): Promise<void> {
    const fresh = await refreshSelected();
    if (!fresh) {
      return;
    }
    setForm(fieldsOf(fresh));
    setReloadOffered(false);
    setSaved(false);
    clearError();
  }

  // Both sides are built by `fieldsOf`, so key order matches; string equality
  // is a sound comparison here.
  const dirty = JSON.stringify(form) !== JSON.stringify(fieldsOf(todo));

  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  useEffect(() => {
    if (!saved) {
      return undefined;
    }
    const timer = setTimeout(() => setSaved(false), 1500);
    return () => clearTimeout(timer);
  }, [saved]);

  function patch(values: Partial<FormFields>): void {
    setForm((previous) => ({ ...previous, ...values }));
  }

  function revert(): void {
    setForm(fieldsOf(todo));
    setSaved(false);
    setReloadOffered(false);
    clearError();
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    await run(
      'save',
      async () => {
        const updated = await updateTodo(todo.id, {
          name: form.name.trim(),
          description: form.description.trim() === '' ? null : form.description,
          dueDate: form.dueDate === '' ? null : form.dueDate,
          priority: form.priority,
          recurrence: ruleOf(form.rule),
          version: todo.version,
        });
        setForm(fieldsOf(updated));
        setReloadOffered(false);
        setSaved(true);
        onChanged(updated);
      },
      { onError: recover },
    );
  }

  async function onDeleteClick(): Promise<void> {
    await run(
      'delete',
      async () => {
        setDeleteImpact(await getDeleteImpact(todo.id));
      },
      { onError: recover },
    );
  }

  async function onConfirmDelete(): Promise<void> {
    await run(
      'delete',
      async () => {
        await deleteTodo(todo.id, todo.version);
        onDeleted();
      },
      { onError: recover },
    );
  }

  return (
    <form className="panel" onSubmit={onSubmit} aria-busy={busy}>
      <h3>
        Details
        {dirty ? <span className="unsaved">unsaved</span> : null}
      </h3>
      <div className="form-grid">
        <label>
          Name
          <input
            value={form.name}
            disabled={busy}
            onChange={(event) => patch({ name: event.target.value })}
            required
          />
        </label>
        <label>
          Description
          <textarea
            value={form.description}
            disabled={busy}
            onChange={(event) => patch({ description: event.target.value })}
          />
        </label>
        <label>
          Due date
          <input
            type="date"
            value={form.dueDate}
            disabled={busy}
            onChange={(event) => patch({ dueDate: event.target.value })}
          />
        </label>
        <label>
          Priority
          <select
            value={form.priority}
            disabled={busy}
            onChange={(event) =>
              patch({ priority: event.target.value as TodoPriority })
            }
          >
            {TodoPriority.options.map((option) => (
              <option key={option} value={option}>
                {todoPriorityLabels[option]}
              </option>
            ))}
          </select>
        </label>
        <RecurrenceEditor
          form={form.rule}
          onChange={(rule) => patch({ rule })}
          disabled={busy}
        />
      </div>
      {saved ? (
        <p className="saved" role="status">
          Saved.
        </p>
      ) : null}
      <div className="actions">
        <button
          type="submit"
          className="btn btn--primary"
          disabled={!dirty || busy}
        >
          {pending === 'save' ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          className="btn"
          disabled={!dirty || busy}
          onClick={revert}
        >
          Revert
        </button>
        <span className="spacer" />
        <button
          type="button"
          className="btn btn--danger"
          disabled={busy}
          onClick={() => void onDeleteClick()}
        >
          Delete
        </button>
      </div>
      {deleteImpact ? (
        <div className="danger-note" role="group" aria-label="Confirm delete">
          <p role="alert">
            This TODO will be deleted permanently. It cannot be undone.
          </p>
          {todo.recurrence && !todo.completedAt ? (
            <p>
              This is the current occurrence of a repeating series, so deleting
              it also ends the series.
            </p>
          ) : null}
          {deleteImpact.unblocked.length > 0 ? (
            <>
              <p>Deleting it removes a Dependency, so these TODOs unblock:</p>
              <ul>
                {deleteImpact.unblocked.map((entry) => (
                  <li key={entry.id}>{entry.name}</li>
                ))}
              </ul>
              {deleteImpact.total > deleteImpact.unblocked.length ? (
                <p className="muted-sm">
                  Showing {deleteImpact.unblocked.length} of{' '}
                  {deleteImpact.total}.
                </p>
              ) : null}
            </>
          ) : null}
          <div className="actions">
            <button
              type="button"
              className="btn btn--danger btn--sm"
              disabled={busy}
              onClick={() => void onConfirmDelete()}
            >
              {pending === 'delete' ? 'Deleting…' : 'Delete permanently'}
            </button>
            <button
              type="button"
              className="btn btn--sm"
              disabled={busy}
              onClick={() => setDeleteImpact(null)}
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
      {reloadOffered ? (
        <div className="actions">
          <button
            type="button"
            className="btn btn--sm"
            onClick={() => void reloadLatest()}
          >
            Reload latest version
          </button>
        </div>
      ) : null}
    </form>
  );
}

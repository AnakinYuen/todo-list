import { useState, type FormEvent } from 'react';
import { createTodo } from './api';
import { RecurrenceEditor } from './RecurrenceEditor';
import { defaultRuleForm, ruleOf, type RuleForm } from './recurrenceForm';
import { useAction } from './useAction';
import { useDialogClose } from './useDialogClose';

interface CreateTodoDialogProps {
  onCreated: () => void;
  onClose: () => void;
}

export function CreateTodoDialog({
  onCreated,
  onClose,
}: CreateTodoDialogProps) {
  const [name, setName] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [rule, setRule] = useState<RuleForm>(defaultRuleForm);
  const { run, pending, error } = useAction<'create'>();
  const creating = pending !== null;
  const { requestClose } = useDialogClose({
    onClose,
    canClose: !creating,
    escapeEnabled: !creating,
  });

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || creating) {
      return;
    }
    await run('create', async () => {
      await createTodo({
        name: trimmed,
        dueDate: dueDate || undefined,
        recurrence: ruleOf(rule),
      });
      onCreated();
    });
  }

  return (
    <div
      className="modal"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          requestClose();
        }
      }}
    >
      <div
        className="modal__card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-title"
      >
        <div className="modal__head">
          <h2 id="create-title">New TODO</h2>
          <button
            type="button"
            className="icon-btn"
            aria-label="Close"
            disabled={creating}
            onClick={requestClose}
          >
            ×
          </button>
        </div>
        <form onSubmit={onSubmit}>
          <div className="modal__body">
            <div className="form-grid">
              <label>
                Name
                <input
                  autoFocus
                  value={name}
                  placeholder="What needs doing?"
                  onChange={(event) => setName(event.target.value)}
                  required
                />
              </label>
              <label>
                Due date
                <input
                  type="date"
                  value={dueDate}
                  onChange={(event) => setDueDate(event.target.value)}
                />
              </label>
            </div>
            <RecurrenceEditor form={rule} onChange={setRule} />
            {error ? (
              <p className="error" role="alert">
                {error}
              </p>
            ) : null}
          </div>
          <div className="modal__foot">
            <button
              type="button"
              className="btn"
              disabled={creating}
              onClick={requestClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn--primary"
              disabled={creating}
            >
              {creating ? 'Adding…' : 'Add TODO'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

import { useState } from 'react';
import {
  todoPriorityLabels,
  todoStatusLabels,
  type Todo,
} from '@todo-list/shared';
import { DependencyEditor } from './DependencyEditor';
import { DetailsForm } from './DetailsForm';
import { StatusControls } from './StatusControls';
import { useDialogClose } from './useDialogClose';

interface TodoDetailProps {
  todo: Todo;
  /** True while another dialog (the create modal) owns Escape. */
  suspended?: boolean;
  onChanged: (updated: Todo) => void;
  /** The selected TODO changed elsewhere: refresh the list and the detail. */
  onConflict: () => void;
  /** The selected TODO is gone: close it and refresh the list. */
  onGone: () => void;
  /** Re-fetch the selected TODO (used by "Reload latest version"). */
  refreshSelected: () => Promise<Todo | null>;
  /** Refresh the list only (used when a save conflict keeps a draft). */
  onRefreshList: () => void;
  onClose: () => void;
  onDeleted: () => void;
}

/**
 * The selected TODO's side panel: status, dependencies and the editable
 * details. Closing with unsaved detail edits is guarded here, so `×`, Escape
 * and the backdrop share one path.
 */
export function TodoDetail({
  todo,
  suspended = false,
  onChanged,
  onConflict,
  onGone,
  refreshSelected,
  onRefreshList,
  onClose,
  onDeleted,
}: TodoDetailProps) {
  const [dirty, setDirty] = useState(false);
  const { requestClose, confirming, keepEditing } = useDialogClose({
    onClose,
    escapeEnabled: !suspended,
    needConfirm: dirty,
  });

  return (
    <>
      <aside className="detail is-open" aria-label="Selected TODO">
        <div className="detail__panel">
          <header className="detail__head">
            <div>
              <div className="detail__title">{todo.name}</div>
              <div className="detail__subtitle">
                <span className={`pill pill--${todo.status}`}>
                  {todoStatusLabels[todo.status]}
                </span>
                <span className="pill pill--priority">
                  <span className={`dot dot--${todo.priority.toLowerCase()}`} />
                  {todoPriorityLabels[todo.priority]}
                </span>
              </div>
            </div>
            <button
              type="button"
              className="icon-btn"
              aria-label="Close detail"
              onClick={requestClose}
            >
              ×
            </button>
          </header>
          <div className="detail__body">
            {confirming ? (
              <div
                className="confirm confirm--discard"
                role="alertdialog"
                aria-label="Discard unsaved changes"
              >
                <p>You have unsaved changes.</p>
                <div className="confirm__actions">
                  <button
                    type="button"
                    className="btn btn--danger btn--sm"
                    onClick={onClose}
                  >
                    Discard changes
                  </button>
                  <button
                    type="button"
                    className="btn btn--sm"
                    onClick={keepEditing}
                  >
                    Keep editing
                  </button>
                </div>
              </div>
            ) : null}
            <StatusControls
              todo={todo}
              onChanged={onChanged}
              onConflict={onConflict}
              onGone={onGone}
            />
            <DependencyEditor
              todo={todo}
              onChanged={onChanged}
              onGone={onGone}
            />
            <DetailsForm
              todo={todo}
              onChanged={onChanged}
              onDirtyChange={setDirty}
              onDeleted={onDeleted}
              onGone={onGone}
              refreshSelected={refreshSelected}
              onRefreshList={onRefreshList}
            />
          </div>
        </div>
      </aside>
      <div className="backdrop is-open" onClick={requestClose} />
    </>
  );
}

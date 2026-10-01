import { useCallback, useEffect, useState } from 'react';
import { decideClose } from './dialogClose';

export interface DialogClose {
  /** Ask to close (from the ×, the backdrop, or a Cancel button). */
  requestClose: () => void;
  /** True while a confirming close is waiting on the user. */
  confirming: boolean;
  /** Dismiss the confirm and stay open. */
  keepEditing: () => void;
}

export interface DialogCloseOptions {
  onClose: () => void;
  /** Ignore Escape while another dialog owns it. Defaults to true. */
  escapeEnabled?: boolean;
  /** Ignore close requests while a write is in flight. Defaults to true. */
  canClose?: boolean;
  /** Ask for confirmation first — e.g. unsaved edits. Defaults to false. */
  needConfirm?: boolean;
}

/**
 * One dismissal protocol for a dialog: Escape, backdrop and the × all route
 * through `requestClose`, which either closes, asks first, or is ignored.
 */
export function useDialogClose({
  onClose,
  escapeEnabled = true,
  canClose = true,
  needConfirm = false,
}: DialogCloseOptions): DialogClose {
  const [confirming, setConfirming] = useState(false);

  const requestClose = useCallback((): void => {
    const decision = decideClose({ canClose, needConfirm });
    if (decision === 'confirm') {
      setConfirming(true);
    } else if (decision === 'close') {
      onClose();
    }
  }, [canClose, needConfirm, onClose]);

  useEffect(() => {
    if (!escapeEnabled) {
      return undefined;
    }
    function onKey(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        requestClose();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [escapeEnabled, requestClose]);

  const keepEditing = useCallback((): void => setConfirming(false), []);

  return { requestClose, confirming, keepEditing };
}

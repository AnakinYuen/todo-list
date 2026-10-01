import { useCallback, useState } from 'react';
import { describeError } from './api';
import {
  beginAction,
  clearActionError,
  failAction,
  initialActionState,
  settleAction,
  type ActionState,
} from './actionState';

export interface RunOptions {
  /** Called with the thrown cause before it is formatted into `error`. */
  onError?: (cause: unknown) => void;
}

export interface Action<Key extends string> {
  /**
   * Runs `action`, marking `key` pending until it settles. A throw is caught
   * into `error` (never rethrown); success clears it. `options.onError` sees the
   * raw cause first, so a caller can react to the API error code.
   */
  run: (
    key: Key,
    action: () => Promise<void>,
    options?: RunOptions,
  ) => Promise<void>;
  pending: Key | null;
  error: string | null;
  clearError: () => void;
}

/**
 * The mutation lifecycle for a component: one pending action, one error, one
 * formatting protocol — over the pure transitions in `actionState`.
 */
export function useAction<Key extends string = string>(): Action<Key> {
  const [state, setState] = useState<ActionState<Key>>(initialActionState);

  const run = useCallback(
    async (
      key: Key,
      action: () => Promise<void>,
      options?: RunOptions,
    ): Promise<void> => {
      setState((current) => beginAction(current, key));
      try {
        await action();
        setState(settleAction);
      } catch (cause) {
        options?.onError?.(cause);
        setState((current) => failAction(current, describeError(cause)));
      }
    },
    [],
  );

  const clearError = useCallback(() => setState(clearActionError), []);

  return { run, pending: state.pending, error: state.error, clearError };
}

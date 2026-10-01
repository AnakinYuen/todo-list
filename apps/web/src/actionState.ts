/**
 * The lifecycle of the actions a component can run: at most one is in flight,
 * and the last failure is held as a message. Pure — no React, no transport — so
 * the lifecycle is testable without a DOM; `useAction` binds it to React state.
 */
export interface ActionState<Key extends string> {
  pending: Key | null;
  error: string | null;
}

export function initialActionState<Key extends string>(): ActionState<Key> {
  return { pending: null, error: null };
}

/** Starting a run drops any earlier error. */
export function beginAction<Key extends string>(
  state: ActionState<Key>,
  key: Key,
): ActionState<Key> {
  return { ...state, pending: key, error: null };
}

export function settleAction<Key extends string>(
  state: ActionState<Key>,
): ActionState<Key> {
  return { ...state, pending: null, error: null };
}

export function failAction<Key extends string>(
  state: ActionState<Key>,
  message: string,
): ActionState<Key> {
  return { ...state, pending: null, error: message };
}

/** Clears a shown error but leaves a run pending, for a caller's explicit reset. */
export function clearActionError<Key extends string>(
  state: ActionState<Key>,
): ActionState<Key> {
  return { ...state, error: null };
}

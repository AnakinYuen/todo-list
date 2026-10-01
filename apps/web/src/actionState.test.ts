import { describe, expect, it } from 'vitest';
import {
  beginAction,
  clearActionError,
  failAction,
  initialActionState,
  settleAction,
  type ActionState,
} from './actionState';

describe('actionState', () => {
  it('is idle to begin with', () => {
    expect(initialActionState()).toEqual({ pending: null, error: null });
  });

  it('begins a run as pending and drops an earlier error', () => {
    const stale: ActionState<'save' | 'delete'> = {
      pending: null,
      error: 'stale',
    };

    expect(beginAction(stale, 'save')).toEqual({
      pending: 'save',
      error: null,
    });
  });

  it('settles a successful run', () => {
    expect(settleAction({ pending: 'save', error: null })).toEqual({
      pending: null,
      error: null,
    });
  });

  it('records a failure as the given message', () => {
    const next = failAction({ pending: 'save', error: null }, 'boom');

    expect(next).toEqual({ pending: null, error: 'boom' });
  });

  it('clears a shown error without touching what is pending', () => {
    expect(clearActionError({ pending: 'save', error: 'boom' })).toEqual({
      pending: 'save',
      error: null,
    });
  });
});

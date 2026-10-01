import { describe, expect, it } from 'vitest';
import { decideClose } from './dialogClose';

describe('decideClose', () => {
  it('ignores a close request while a write is in flight', () => {
    expect(decideClose({ canClose: false, needConfirm: false })).toBe('ignore');
    expect(decideClose({ canClose: false, needConfirm: true })).toBe('ignore');
  });

  it('closes straight away when there is nothing to lose', () => {
    expect(decideClose({ canClose: true, needConfirm: false })).toBe('close');
  });

  it('asks before discarding unsaved edits', () => {
    expect(decideClose({ canClose: true, needConfirm: true })).toBe('confirm');
  });
});

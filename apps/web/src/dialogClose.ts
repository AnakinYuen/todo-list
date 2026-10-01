/**
 * What a close request should do, given whether the dialog may close at all and
 * whether it has unsaved edits to lose. Pure, so `useDialogClose` can stay a
 * thin binding over it.
 */
export type CloseDecision = 'ignore' | 'confirm' | 'close';

export function decideClose({
  canClose,
  needConfirm,
}: {
  canClose: boolean;
  needConfirm: boolean;
}): CloseDecision {
  if (!canClose) {
    return 'ignore';
  }
  return needConfirm ? 'confirm' : 'close';
}

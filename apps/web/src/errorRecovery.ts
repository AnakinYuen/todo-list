/**
 * How the UI should recover from a rejected request, decided by the API error
 * code. Pure, so the recovery policy is testable without a component.
 *
 * - `conflict` — the TODO changed elsewhere; refresh it (and the list).
 * - `gone` — the TODO no longer exists; close it and refresh the list.
 */
export type Recovery = 'conflict' | 'gone' | null;

export function recoveryFor(code: string | undefined): Recovery {
  if (code === 'CONFLICT') {
    return 'conflict';
  }
  if (code === 'NOT_FOUND') {
    return 'gone';
  }
  return null;
}

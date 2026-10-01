import type { Todo, TodoRef } from '@todo-list/shared';

/**
 * The results a dependency picker may offer: not the TODO itself, and not one it
 * already depends on. Search is discovery only — the server still runs the cycle
 * and fan-out checks when the Dependency is added.
 */
export function pickCandidates(results: TodoRef[], todo: Todo): TodoRef[] {
  return results.filter(
    (ref) =>
      ref.id !== todo.id &&
      !todo.dependencies.some((dependency) => dependency.id === ref.id),
  );
}

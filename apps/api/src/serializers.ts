import { Todo, type TodoRef } from '@todo-list/shared';
import type { TodoRow } from './db/schema';
import { unsatisfiedRefs, type DependencyRef } from './todos/dependencies';

function asRef(ref: TodoRef): TodoRef {
  return { id: ref.id, name: ref.name, status: ref.status };
}

export function toTodo(row: TodoRow, dependencies: DependencyRef[] = []): Todo {
  const blockedBy = unsatisfiedRefs(dependencies);

  return Todo.parse({
    id: row.id,
    name: row.name,
    description: row.description,
    dueDate: row.dueDate,
    status: row.status,
    priority: row.priority,
    blocked: blockedBy.length > 0,
    blockedBy,
    dependencies: dependencies.map(asRef),
    recurrence: row.recurrence ?? null,
    seriesId: row.seriesId,
    version: row.version,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

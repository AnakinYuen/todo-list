import { describe, expect, it } from 'vitest';
import type { Todo, TodoRef } from '@todo-list/shared';
import { pickCandidates } from './dependencySearch';

function todo(id: string, dependencyIds: string[] = []): Todo {
  return {
    id,
    name: id,
    description: null,
    dueDate: null,
    status: 'NOT_STARTED',
    priority: 'MEDIUM',
    blocked: false,
    blockedBy: [],
    dependencies: dependencyIds.map((dependencyId) => ({
      id: dependencyId,
      name: dependencyId,
      status: 'NOT_STARTED',
    })),
    recurrence: null,
    seriesId: null,
    version: 1,
    completedAt: null,
    deletedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function ref(id: string): TodoRef {
  return { id, name: id, status: 'NOT_STARTED' };
}

describe('pickCandidates', () => {
  it('excludes the TODO itself and its existing Dependencies', () => {
    const subject = todo('self', ['dep-a']);
    const results = [ref('self'), ref('dep-a'), ref('other')];

    expect(pickCandidates(results, subject).map((entry) => entry.id)).toEqual([
      'other',
    ]);
  });

  it('keeps every result when the TODO has no dependencies', () => {
    const results = [ref('a'), ref('b')];

    expect(pickCandidates(results, todo('self')).map((e) => e.id)).toEqual([
      'a',
      'b',
    ]);
  });
});

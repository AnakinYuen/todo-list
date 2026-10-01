import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { ApiErrorBody, TodoRef } from '@todo-list/shared';

/**
 * The domain rejections of the TODOs service, each checked against the shared
 * `ApiErrorBody` so its `code` is a member of `ErrorCode`. The full catalog is
 * `docs/errors.md`.
 */

export function notFound(): never {
  const body: ApiErrorBody = { code: 'NOT_FOUND', message: 'TODO not found' };
  throw new NotFoundException(body);
}

export function conflict(currentVersion: number): never {
  const body: ApiErrorBody = {
    code: 'CONFLICT',
    message: 'The TODO was changed by someone else',
    currentVersion,
  };
  throw new ConflictException(body);
}

export function cycle(): never {
  const body: ApiErrorBody = {
    code: 'CYCLE_DETECTED',
    message: 'That dependency would create a cycle',
  };
  throw new UnprocessableEntityException(body);
}

export function blocked(blockedBy: TodoRef[]): never {
  const body: ApiErrorBody = {
    code: 'BLOCKED_BY_DEPENDENCIES',
    message: 'This TODO is blocked by unfinished dependencies',
    blockedBy,
  };
  throw new UnprocessableEntityException(body);
}

export function dependencyLimit(limit: number): never {
  const body: ApiErrorBody = {
    code: 'DEPENDENCY_LIMIT',
    message: `A TODO may depend on at most ${limit} other TODOs`,
  };
  throw new UnprocessableEntityException(body);
}

export function recurrenceOnCompleted(): never {
  const body: ApiErrorBody = {
    code: 'RECURRENCE_ON_COMPLETED',
    message: 'A completed TODO cannot gain or change a Recurrence rule',
  };
  throw new UnprocessableEntityException(body);
}

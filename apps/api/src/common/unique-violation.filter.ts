import { type ArgumentsHost, Catch, ConflictException } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';

interface PossiblePgError {
  code?: unknown;
  cause?: unknown;
}

/** The Postgres SQLSTATE, unwrapping any driver/ORM error wrappers. */
function pgCode(error: unknown): string | undefined {
  let current = error as PossiblePgError | null;
  for (let depth = 0; depth < 5 && current; depth += 1) {
    if (typeof current.code === 'string') {
      return current.code;
    }
    current = (current.cause as PossiblePgError | null) ?? null;
  }
  return undefined;
}

/**
 * Turns a Postgres unique-violation into the structured 409 the rest of the API
 * uses, instead of a raw 500. The only unique constraint reachable through the
 * API is one live occurrence per series-date (`todos_series_due_date_key`); the
 * dedup guard normally prevents it, but an edit can still collide.
 */
@Catch()
export class UniqueViolationFilter extends BaseExceptionFilter {
  override catch(exception: unknown, host: ArgumentsHost): void {
    if (pgCode(exception) === '23505') {
      super.catch(
        new ConflictException({
          code: 'DUPLICATE_OCCURRENCE',
          message:
            'Another occurrence in this series already has that due date',
        }),
        host,
      );
      return;
    }
    super.catch(exception, host);
  }
}

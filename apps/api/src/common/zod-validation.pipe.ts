import {
  type ArgumentMetadata,
  BadRequestException,
  type PipeTransform,
} from '@nestjs/common';
import type { ZodType } from 'zod';

export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown, _metadata: ArgumentMetadata): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        code: 'VALIDATION',
        message: 'Request validation failed',
        issues: result.error.issues,
      });
    }
    return result.data;
  }
}

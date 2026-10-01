import {
  ApiBody,
  ApiParam,
  ApiResponse,
  type SchemaObject,
} from '@nestjs/swagger';
import { z } from 'zod';
import {
  AddDependencyInput,
  ApiErrorBody,
  CreateTodoInput,
  DeleteImpact,
  NextOccurrencePreview,
  Todo,
  TodoPage,
  TodoRef,
  TransitionImpact,
  TransitionTodoInput,
  UpdateTodoInput,
  type ErrorCode,
} from '@todo-list/shared';

/**
 * OpenAPI request/response schemas derived from the shared Zod contracts, so the
 * docs cannot drift from validation. Zod 4 emits JSON Schema directly; the
 * `openapi-3.0` target drops `$schema` and uses `nullable` as Swagger expects.
 */
function schemaOf(schema: z.ZodType): SchemaObject {
  return z.toJSONSchema(schema, { target: 'openapi-3.0' }) as SchemaObject;
}

const TodoSchema = schemaOf(Todo);
const TodoPageSchema = schemaOf(TodoPage);
const CreateTodoSchema = schemaOf(CreateTodoInput);
const UpdateTodoSchema = schemaOf(UpdateTodoInput);
const TransitionSchema = schemaOf(TransitionTodoInput);
const AddDependencySchema = schemaOf(AddDependencyInput);
const DeleteImpactSchema = schemaOf(DeleteImpact);
const TransitionImpactSchema = schemaOf(TransitionImpact);
const NextOccurrencePreviewSchema = schemaOf(NextOccurrencePreview);
const TodoRefListSchema = schemaOf(z.array(TodoRef));

/**
 * The one error shape (`{ code, message, ... }`), derived from the shared
 * `ApiErrorBody` so the optional fields cannot drift; the catalog of codes is
 * `docs/errors.md`.
 */
const ErrorSchema = schemaOf(ApiErrorBody);

/** A path parameter that is a TODO id. */
export function ApiIdParam(
  name = 'id',
  description = 'TODO id',
): MethodDecorator {
  return ApiParam({ name, format: 'uuid', description });
}

export function ApiTodoBody(
  which: 'create' | 'update' | 'transition' | 'dependency',
): MethodDecorator {
  const schema = {
    create: CreateTodoSchema,
    update: UpdateTodoSchema,
    transition: TransitionSchema,
    dependency: AddDependencySchema,
  }[which];
  return ApiBody({ schema });
}

export function ApiTodoResponse(
  description: string,
  status = 200,
): MethodDecorator {
  return ApiResponse({ status, description, schema: TodoSchema });
}

export function ApiTodoPageResponse(description: string): MethodDecorator {
  return ApiResponse({ status: 200, description, schema: TodoPageSchema });
}

export function ApiDeleteImpactResponse(description: string): MethodDecorator {
  return ApiResponse({ status: 200, description, schema: DeleteImpactSchema });
}

export function ApiTransitionImpactResponse(
  description: string,
): MethodDecorator {
  return ApiResponse({
    status: 200,
    description,
    schema: TransitionImpactSchema,
  });
}

export function ApiNextOccurrenceResponse(
  description: string,
): MethodDecorator {
  return ApiResponse({
    status: 200,
    description,
    schema: NextOccurrencePreviewSchema,
  });
}

export function ApiTodoRefListResponse(description: string): MethodDecorator {
  return ApiResponse({ status: 200, description, schema: TodoRefListSchema });
}

/**
 * One documented failure: the HTTP status, the `ErrorCode`(s) it carries and
 * when it is raised. Codes are typed against the shared enum so a response
 * cannot document a code the API does not define.
 */
export function ApiError(
  status: number,
  codes: ErrorCode[],
  when: string,
): MethodDecorator {
  return ApiResponse({
    status,
    description: `${codes.join(', ')} — ${when}`,
    schema: ErrorSchema,
  });
}

export function ApiValidationError(
  when = 'the request failed schema validation',
): MethodDecorator {
  return ApiError(400, ['VALIDATION'], when);
}

export function ApiNotFoundError(
  when = 'no live TODO with that id',
): MethodDecorator {
  return ApiError(404, ['NOT_FOUND'], when);
}

import { z } from 'zod';
import { RecurrenceRule } from './recurrence';

export const TodoStatus = z.enum([
  'NOT_STARTED',
  'IN_PROGRESS',
  'COMPLETED',
  'ARCHIVED',
]);
export type TodoStatus = z.infer<typeof TodoStatus>;

export const todoStatusLabels: Record<TodoStatus, string> = {
  NOT_STARTED: 'Not Started',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed',
  ARCHIVED: 'Archived',
};

export const todoPriorityLabels: Record<TodoPriority, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
};

export const TodoPriority = z.enum(['LOW', 'MEDIUM', 'HIGH']);
export type TodoPriority = z.infer<typeof TodoPriority>;

export const IsoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a YYYY-MM-DD calendar date')
  .refine(
    (value) => {
      const date = new Date(`${value}T00:00:00.000Z`);
      return (
        !Number.isNaN(date.getTime()) &&
        date.toISOString().slice(0, 10) === value
      );
    },
    { message: 'Expected a real calendar date' },
  );
export type IsoDate = z.infer<typeof IsoDate>;

const Version = z.number().int().positive();

export const Uuid = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    'Expected a UUID',
  );
export type Uuid = z.infer<typeof Uuid>;

export const CreateTodoInput = z
  .object({
    name: z.string().trim().min(1).max(200),
    description: z.string().max(2000).optional(),
    dueDate: IsoDate.optional(),
    priority: TodoPriority.optional(),
    status: TodoStatus.optional(),
    recurrence: RecurrenceRule.nullable().optional(),
  })
  // Completing a recurring TODO is what spawns its next Occurrence (ADR 0001),
  // so creation must not record one as already Completed and skip the spawn.
  .refine((value) => !(value.recurrence && value.status === 'COMPLETED'), {
    message:
      'A recurring TODO cannot be created Completed; completing it spawns the next Occurrence',
  });
export type CreateTodoInput = z.infer<typeof CreateTodoInput>;

export const UpdateTodoInput = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    description: z.string().max(2000).nullable().optional(),
    dueDate: IsoDate.nullable().optional(),
    priority: TodoPriority.optional(),
    recurrence: RecurrenceRule.nullable().optional(),
    version: Version,
  })
  .refine(
    (value) =>
      value.name !== undefined ||
      value.description !== undefined ||
      value.dueDate !== undefined ||
      value.priority !== undefined ||
      value.recurrence !== undefined,
    { message: 'At least one editable field is required' },
  );
export type UpdateTodoInput = z.infer<typeof UpdateTodoInput>;

export const TransitionTodoInput = z.object({
  status: TodoStatus,
  version: Version,
});
export type TransitionTodoInput = z.infer<typeof TransitionTodoInput>;

export const TodoRef = z.object({
  id: Uuid,
  name: z.string(),
  status: TodoStatus,
});
export type TodoRef = z.infer<typeof TodoRef>;

/** One TODO a transition would move as a knock-on effect of the transition. */
export const TransitionImpactEntry = z.object({
  id: Uuid,
  name: z.string(),
  from: TodoStatus,
  to: TodoStatus,
});
export type TransitionImpactEntry = z.infer<typeof TransitionImpactEntry>;

/** The dry-run of a transition: the TODOs applying it would cascade. */
export const TransitionImpact = z.object({
  /** Capped preview of who is affected; `total` is the full count. */
  affected: z.array(TransitionImpactEntry),
  total: z.number().int().nonnegative(),
});
export type TransitionImpact = z.infer<typeof TransitionImpact>;

/** The dry-run of a delete: the dependents whose last unmet Dependency it removes. */
export const DeleteImpact = z.object({
  /** Capped preview of who unblocks; `total` is the full count. */
  unblocked: z.array(TodoRef),
  total: z.number().int().nonnegative(),
});
export type DeleteImpact = z.infer<typeof DeleteImpact>;

/** The next due date a completion would schedule, for a recurring TODO. */
export const NextOccurrencePreview = z.object({
  nextDueDate: IsoDate.nullable(),
  /** True when the date skips past one the series already holds. */
  skipsAhead: z.boolean(),
});
export type NextOccurrencePreview = z.infer<typeof NextOccurrencePreview>;

export const AddDependencyInput = z.object({ dependsOn: Uuid });
export type AddDependencyInput = z.infer<typeof AddDependencyInput>;

export const Todo = z.object({
  id: Uuid,
  name: z.string(),
  description: z.string().nullable(),
  dueDate: IsoDate.nullable(),
  status: TodoStatus,
  priority: TodoPriority,
  blocked: z.boolean(),
  blockedBy: z.array(TodoRef),
  dependencies: z.array(TodoRef),
  recurrence: RecurrenceRule.nullable(),
  seriesId: Uuid.nullable(),
  version: z.number().int(),
  completedAt: z.string().nullable(),
  deletedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Todo = z.infer<typeof Todo>;

export const BooleanQuery = z.enum(['true', 'false']);
export type BooleanQuery = z.infer<typeof BooleanQuery>;

/**
 * The machine-readable codes the API returns in an error body
 * (`{ code, message, ... }`). The catalog — when each is raised and its HTTP
 * status — is `docs/errors.md`.
 */
export const ErrorCode = z.enum([
  'VALIDATION',
  'NOT_FOUND',
  'CONFLICT',
  'BLOCKED_BY_DEPENDENCIES',
  'CYCLE_DETECTED',
  'RECURRENCE_ON_COMPLETED',
  'DEPENDENCY_LIMIT',
  'DUPLICATE_OCCURRENCE',
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

/** The one error body shape (`{ code, message, ... }`) the API returns. */
export const ApiErrorBody = z.object({
  code: ErrorCode,
  message: z.string(),
  /** Present on CONFLICT. */
  currentVersion: z.number().int().optional(),
  /** Present on BLOCKED_BY_DEPENDENCIES. */
  blockedBy: z.array(TodoRef).optional(),
  /** Present on VALIDATION (the Zod issues). */
  issues: z.array(z.unknown()).optional(),
});
export type ApiErrorBody = z.infer<typeof ApiErrorBody>;

export const TodoSort = z.enum(['dueDate', 'priority', 'status', 'name']);
export type TodoSort = z.infer<typeof TodoSort>;

export const SortOrder = z.enum(['asc', 'desc']);
export type SortOrder = z.infer<typeof SortOrder>;

export const ListLimit = z.coerce.number().int().min(1).max(100);
export type ListLimit = z.infer<typeof ListLimit>;

/** The version a DELETE must match (as a query string), so deletion is optimistic. */
export const VersionQuery = z.coerce.number().int().positive();
export type VersionQuery = z.infer<typeof VersionQuery>;

/** A dependency-picker search term: 1–200 chars, matched as a case-insensitive literal prefix. */
export const SearchQuery = z.string().trim().min(1).max(200);
export type SearchQuery = z.infer<typeof SearchQuery>;

/** The most matches a dependency-picker search returns. */
export const SEARCH_RESULT_LIMIT = 20;

export const TodoPage = z.object({
  todos: z.array(Todo),
  nextCursor: z.string().nullable(),
});
export type TodoPage = z.infer<typeof TodoPage>;

export const DEFAULT_SORT: TodoSort = 'dueDate';
export const DEFAULT_ORDER: SortOrder = 'asc';
export const DEFAULT_LIST_LIMIT = 20;

/**
 * The most dependencies a single TODO may declare. Bounds every row's
 * dependencies/`blockedBy` payload so a page read stays small regardless of the
 * graph; the reverse direction (one TODO with many dependents) is explicitly not
 * capped and is handled by indexed fan-in reads (ticket 10).
 */
export const MAX_DEPENDENCIES_PER_TODO = 50;

export interface ListTodosParams {
  includeDeleted: boolean;
  status?: TodoStatus;
  priority?: TodoPriority;
  dueBefore?: string;
  dueAfter?: string;
  overdue: boolean;
  blocked?: boolean;
  sort: TodoSort;
  order: SortOrder;
  limit: number;
  cursor?: string;
}

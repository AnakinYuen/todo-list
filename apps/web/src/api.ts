import type {
  CreateTodoInput,
  DeleteImpact,
  ListTodosParams,
  NextOccurrencePreview,
  Todo,
  TodoPage,
  TodoRef,
  TodoStatus,
  TransitionImpact,
  TransitionTodoInput,
  UpdateTodoInput,
} from '@todo-list/shared';
const baseUrl = '/api';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | undefined,
    message: string,
    readonly body: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function blockedNames(body: unknown): string[] {
  const blockedBy = (body as { blockedBy?: unknown } | null)?.blockedBy;
  if (!Array.isArray(blockedBy)) {
    return [];
  }
  return blockedBy
    .map((ref) => (ref as { name?: unknown })?.name)
    .filter((name): name is string => typeof name === 'string');
}

function firstIssue(body: unknown): string | undefined {
  const issues = (body as { issues?: unknown } | null)?.issues;
  if (!Array.isArray(issues)) {
    return undefined;
  }
  const message = (issues[0] as { message?: unknown } | undefined)?.message;
  return typeof message === 'string' ? message : undefined;
}

/** Turns a rejected request into something the user can act on. */
export function describeError(cause: unknown): string {
  if (!(cause instanceof ApiError)) {
    return cause instanceof Error ? cause.message : String(cause);
  }
  switch (cause.code) {
    case 'CONFLICT':
      return "This TODO changed elsewhere. Your change wasn't applied.";
    case 'BLOCKED_BY_DEPENDENCIES': {
      const names = blockedNames(cause.body);
      return names.length > 0
        ? `Blocked by unfinished dependencies: ${names.join(', ')}.`
        : 'This TODO is blocked by unfinished dependencies.';
    }
    case 'CYCLE_DETECTED':
      return 'That dependency would create a cycle.';
    case 'DEPENDENCY_LIMIT':
      return 'This TODO already has the most dependencies it can have. Remove one before adding another.';
    case 'DUPLICATE_OCCURRENCE':
      return 'Another occurrence in this series already has that due date.';
    case 'RECURRENCE_ON_COMPLETED':
      return 'A completed TODO cannot gain or change a recurrence rule. Reopen it first.';
    case 'VALIDATION':
      return firstIssue(cause.body) ?? cause.message;
    case 'NOT_FOUND':
      return 'This TODO no longer exists.';
    default:
      return cause.message;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, init);
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => undefined);
    const record = (body ?? {}) as { code?: unknown; message?: unknown };
    const code = typeof record.code === 'string' ? record.code : undefined;
    const message =
      typeof record.message === 'string'
        ? record.message
        : `Request failed (${response.status})`;
    throw new ApiError(response.status, code, message, body);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export function listTodos(
  params: Partial<ListTodosParams> = {},
): Promise<TodoPage> {
  const search = new URLSearchParams();
  if (params.includeDeleted) search.set('includeDeleted', 'true');
  if (params.status) search.set('status', params.status);
  if (params.priority) search.set('priority', params.priority);
  if (params.dueAfter) search.set('dueAfter', params.dueAfter);
  if (params.dueBefore) search.set('dueBefore', params.dueBefore);
  if (params.overdue) search.set('overdue', 'true');
  if (params.blocked !== undefined) {
    search.set('blocked', String(params.blocked));
  }
  if (params.sort) search.set('sort', params.sort);
  if (params.order) search.set('order', params.order);
  if (params.limit) search.set('limit', String(params.limit));
  if (params.cursor) search.set('cursor', params.cursor);
  const query = search.toString();
  return request<TodoPage>(`/todos${query ? `?${query}` : ''}`);
}

export function getTodo(id: string): Promise<Todo> {
  return request<Todo>(`/todos/${id}`);
}

export function searchTodos(q: string): Promise<TodoRef[]> {
  return request<TodoRef[]>(`/todos/search?q=${encodeURIComponent(q)}`);
}

export function createTodo(input: CreateTodoInput): Promise<Todo> {
  return request<Todo>('/todos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function updateTodo(id: string, input: UpdateTodoInput): Promise<Todo> {
  return request<Todo>(`/todos/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function transitionTodo(
  id: string,
  input: TransitionTodoInput,
): Promise<Todo> {
  return request<Todo>(`/todos/${id}/transitions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function getTransitionImpact(
  id: string,
  to: TodoStatus,
): Promise<TransitionImpact> {
  return request<TransitionImpact>(`/todos/${id}/transition-impact?to=${to}`);
}

export function deleteTodo(id: string, version: number): Promise<void> {
  return request<void>(`/todos/${id}?version=${version}`, { method: 'DELETE' });
}

export function getDeleteImpact(id: string): Promise<DeleteImpact> {
  return request<DeleteImpact>(`/todos/${id}/delete-impact`);
}

export function getNextOccurrencePreview(
  id: string,
): Promise<NextOccurrencePreview> {
  return request<NextOccurrencePreview>(`/todos/${id}/next-occurrence-preview`);
}

export function addDependency(id: string, dependsOn: string): Promise<Todo> {
  return request<Todo>(`/todos/${id}/dependencies`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dependsOn }),
  });
}

export function removeDependency(
  id: string,
  dependencyId: string,
): Promise<Todo> {
  return request<Todo>(`/todos/${id}/dependencies/${dependencyId}`, {
    method: 'DELETE',
  });
}

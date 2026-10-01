import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiNoContentResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import {
  AddDependencyInput,
  BooleanQuery,
  CreateTodoInput,
  DEFAULT_LIST_LIMIT,
  DEFAULT_ORDER,
  DEFAULT_SORT,
  IsoDate,
  ListLimit,
  SearchQuery,
  SortOrder,
  TodoPriority,
  TodoSort,
  TodoStatus,
  TransitionTodoInput,
  UpdateTodoInput,
  Uuid,
  VersionQuery,
  type DeleteImpact,
  type NextOccurrencePreview,
  type Todo,
  type TodoPage,
  type TodoRef,
  type TransitionImpact,
} from '@todo-list/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import {
  ApiDeleteImpactResponse,
  ApiError,
  ApiIdParam,
  ApiNextOccurrenceResponse,
  ApiNotFoundError,
  ApiTodoBody,
  ApiTodoPageResponse,
  ApiTodoRefListResponse,
  ApiTodoResponse,
  ApiTransitionImpactResponse,
  ApiValidationError,
} from '../common/openapi';
import { TodosService } from './todos.service';

@ApiTags('todos')
@Controller('todos')
export class TodosController {
  constructor(private readonly todosService: TodosService) {}

  @Post()
  @ApiOperation({
    summary: 'Create a TODO',
    description:
      'A recurring TODO cannot be created already Completed — completing it is what spawns the next Occurrence.',
  })
  @ApiTodoBody('create')
  @ApiTodoResponse('The created TODO', 201)
  @ApiValidationError()
  create(
    @Body(new ZodValidationPipe(CreateTodoInput)) body: CreateTodoInput,
  ): Promise<Todo> {
    return this.todosService.create(body);
  }

  @Get()
  @ApiOperation({
    summary: 'List TODOs (filtered, sorted, keyset-paginated)',
    description:
      'One query returns the page and each TODO’s dependencies, so a row’s `blocked`/`blockedBy` share the page’s snapshot. Pass `cursor` back to fetch the next page.',
  })
  @ApiQuery({
    name: 'includeDeleted',
    required: false,
    enum: [...BooleanQuery.options],
    description: 'Audit-only: include Deleted TODOs.',
  })
  @ApiQuery({ name: 'status', required: false, enum: [...TodoStatus.options] })
  @ApiQuery({
    name: 'priority',
    required: false,
    enum: [...TodoPriority.options],
  })
  @ApiQuery({ name: 'dueBefore', required: false, type: String })
  @ApiQuery({ name: 'dueAfter', required: false, type: String })
  @ApiQuery({
    name: 'overdue',
    required: false,
    enum: [...BooleanQuery.options],
    description: 'Due before today and not Completed/Archived.',
  })
  @ApiQuery({
    name: 'blocked',
    required: false,
    enum: [...BooleanQuery.options],
    description: 'true = has an unsatisfied dependency; false = has none.',
  })
  @ApiQuery({ name: 'sort', required: false, enum: [...TodoSort.options] })
  @ApiQuery({ name: 'order', required: false, enum: [...SortOrder.options] })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({
    name: 'cursor',
    required: false,
    type: String,
    description: 'Opaque cursor from `nextCursor`; must match `sort`/`order`.',
  })
  @ApiTodoPageResponse(
    'A page of TODOs plus the next cursor (null at the end of the list)',
  )
  @ApiValidationError(
    'an unknown filter value, an out-of-range limit, or a malformed/foreign cursor',
  )
  list(
    @Query('includeDeleted', new ZodValidationPipe(BooleanQuery.optional()))
    includeDeleted?: BooleanQuery,
    @Query('status', new ZodValidationPipe(TodoStatus.optional()))
    status?: TodoStatus,
    @Query('priority', new ZodValidationPipe(TodoPriority.optional()))
    priority?: TodoPriority,
    @Query('dueBefore', new ZodValidationPipe(IsoDate.optional()))
    dueBefore?: string,
    @Query('dueAfter', new ZodValidationPipe(IsoDate.optional()))
    dueAfter?: string,
    @Query('overdue', new ZodValidationPipe(BooleanQuery.optional()))
    overdue?: BooleanQuery,
    @Query('blocked', new ZodValidationPipe(BooleanQuery.optional()))
    blocked?: BooleanQuery,
    @Query('sort', new ZodValidationPipe(TodoSort.optional())) sort?: TodoSort,
    @Query('order', new ZodValidationPipe(SortOrder.optional()))
    order?: SortOrder,
    @Query('limit', new ZodValidationPipe(ListLimit.optional())) limit?: number,
    @Query('cursor') cursor?: string,
  ): Promise<TodoPage> {
    return this.todosService.list({
      includeDeleted: includeDeleted === 'true',
      status,
      priority,
      dueBefore,
      dueAfter,
      overdue: overdue === 'true',
      blocked: blocked === undefined ? undefined : blocked === 'true',
      sort: sort ?? DEFAULT_SORT,
      order: order ?? DEFAULT_ORDER,
      limit: limit ?? DEFAULT_LIST_LIMIT,
      cursor,
    });
  }

  @Get('search')
  @ApiOperation({
    summary: 'Search TODOs by name (dependency picker)',
    description:
      'Case-insensitive, literal prefix match over live TODOs, name-ordered and capped at 20. Discovery only: adding a Dependency still runs the cycle and fan-out checks.',
  })
  @ApiQuery({
    name: 'q',
    required: true,
    type: String,
    description: 'At least 1 character; matched literally.',
  })
  @ApiTodoRefListResponse('Matching TODOs (id, name, status), name-ordered')
  @ApiValidationError('the search term is empty')
  search(
    @Query('q', new ZodValidationPipe(SearchQuery)) q: string,
  ): Promise<TodoRef[]> {
    return this.todosService.search(q);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one TODO' })
  @ApiIdParam()
  @ApiQuery({
    name: 'includeDeleted',
    required: false,
    enum: [...BooleanQuery.options],
    description: 'Audit-only: return the TODO even if Deleted.',
  })
  @ApiTodoResponse('The TODO and its dependencies')
  @ApiValidationError('the id is not a uuid')
  @ApiNotFoundError()
  get(
    @Param('id', new ZodValidationPipe(Uuid)) id: string,
    @Query('includeDeleted', new ZodValidationPipe(BooleanQuery.optional()))
    includeDeleted?: BooleanQuery,
  ): Promise<Todo> {
    return this.todosService.getById(id, includeDeleted === 'true');
  }

  @Get(':id/transition-impact')
  @ApiOperation({
    summary: 'Preview the TODOs a transition would cascade',
    description:
      'A dry run of the reopen cascade (ADR 0004): the In Progress dependents a transition would move back to Not Started. Empty when the transition removes no satisfaction. `affected` is capped at 3, name-ordered; `total` is the full count.',
  })
  @ApiIdParam()
  @ApiQuery({ name: 'to', required: true, enum: [...TodoStatus.options] })
  @ApiTransitionImpactResponse(
    'The started dependents the transition would revert (capped, plus the total)',
  )
  @ApiValidationError('invalid id or target status')
  @ApiNotFoundError()
  transitionImpact(
    @Param('id', new ZodValidationPipe(Uuid)) id: string,
    @Query('to', new ZodValidationPipe(TodoStatus)) to: TodoStatus,
  ): Promise<TransitionImpact> {
    return this.todosService.transitionImpact(id, to);
  }

  @Get(':id/next-occurrence-preview')
  @ApiOperation({
    summary: 'Preview the next Occurrence a completion schedules',
    description:
      'Empty (`nextDueDate: null`) when the TODO does not recur or already spawned its successor. `skipsAhead` is true when the series already holds that date and the schedule advanced past it.',
  })
  @ApiIdParam()
  @ApiQuery({ name: 'from', required: false, type: String })
  @ApiNextOccurrenceResponse(
    'The next due date, or null when completing writes none',
  )
  @ApiValidationError('invalid id or from date')
  @ApiNotFoundError()
  nextOccurrencePreview(
    @Param('id', new ZodValidationPipe(Uuid)) id: string,
    @Query('from', new ZodValidationPipe(IsoDate.optional())) from?: string,
  ): Promise<NextOccurrencePreview> {
    return this.todosService.nextOccurrencePreview(id, from);
  }

  @Get(':id/delete-impact')
  @ApiOperation({
    summary: 'Preview the dependents a delete would unblock',
    description:
      'The live dependents whose last unmet Dependency is this TODO, so deleting it unblocks them (ADR 0005). `unblocked` is capped at 3, name-ordered; `total` is the full count.',
  })
  @ApiIdParam()
  @ApiDeleteImpactResponse(
    'The dependents whose last unmet Dependency is this TODO (capped, plus the total)',
  )
  @ApiValidationError('the id is not a uuid')
  @ApiNotFoundError()
  deleteImpact(
    @Param('id', new ZodValidationPipe(Uuid)) id: string,
  ): Promise<DeleteImpact> {
    return this.todosService.deleteImpact(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update a TODO',
    description:
      'Optimistic: `version` must match, or the request is rejected with CONFLICT. A completed TODO cannot gain or change a Recurrence rule.',
  })
  @ApiIdParam()
  @ApiTodoBody('update')
  @ApiTodoResponse('The updated TODO')
  @ApiValidationError()
  @ApiNotFoundError()
  @ApiError(
    409,
    ['CONFLICT', 'DUPLICATE_OCCURRENCE'],
    'the version is stale, or the new due date collides with a live Occurrence in the series',
  )
  @ApiError(
    422,
    ['RECURRENCE_ON_COMPLETED'],
    'adding or changing a Recurrence rule on a completed (or archived-after-completion) TODO',
  )
  update(
    @Param('id', new ZodValidationPipe(Uuid)) id: string,
    @Body(new ZodValidationPipe(UpdateTodoInput)) body: UpdateTodoInput,
  ): Promise<Todo> {
    return this.todosService.update(id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Delete a TODO (permanent; retained for audit)',
    description:
      'Optimistic: `version` must match, or the request is rejected with CONFLICT. Marks the TODO Deleted and removes its Dependency edges in both directions, so dependents unblock. There is no restore (ADR 0005).',
  })
  @ApiIdParam()
  @ApiQuery({
    name: 'version',
    required: true,
    type: Number,
    description:
      'The version you are deleting; a stale version is rejected with CONFLICT.',
  })
  @ApiNoContentResponse({
    description:
      'Deleted; the row is retained for audit and its dependency edges are removed',
  })
  @ApiValidationError('the id is not a uuid, or version is missing/invalid')
  @ApiNotFoundError()
  @ApiError(409, ['CONFLICT'], 'the version is stale')
  async remove(
    @Param('id', new ZodValidationPipe(Uuid)) id: string,
    @Query('version', new ZodValidationPipe(VersionQuery)) version: number,
  ): Promise<void> {
    await this.todosService.delete(id, version);
  }

  @Post(':id/transitions')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Transition a TODO to a new Status',
    description:
      'Entering In Progress or Completed is gated on every dependency being Satisfied. Leaving a Satisfied state cascades In Progress dependents back to Not Started (ADR 0004). Completing a recurring TODO spawns exactly one successor.',
  })
  @ApiIdParam()
  @ApiTodoBody('transition')
  @ApiTodoResponse('The TODO in its new Status')
  @ApiValidationError()
  @ApiNotFoundError()
  @ApiError(
    409,
    ['CONFLICT', 'DUPLICATE_OCCURRENCE'],
    'the version is stale, or the spawned Occurrence would collide with a live due date in the series',
  )
  @ApiError(
    422,
    ['BLOCKED_BY_DEPENDENCIES'],
    'entering In Progress/Completed with an unsatisfied dependency',
  )
  transition(
    @Param('id', new ZodValidationPipe(Uuid)) id: string,
    @Body(new ZodValidationPipe(TransitionTodoInput)) body: TransitionTodoInput,
  ): Promise<Todo> {
    return this.todosService.transition(id, body);
  }

  @Post(':id/dependencies')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Add a Dependency to a TODO',
    description:
      'The edge is rejected if it would create a cycle, if it would leave an In Progress TODO Blocked, or if it exceeds the fan-out cap.',
  })
  @ApiIdParam()
  @ApiTodoBody('dependency')
  @ApiTodoResponse('The dependent TODO with the new Dependency')
  @ApiValidationError()
  @ApiNotFoundError('the dependent or the Dependency is missing or Deleted')
  @ApiError(
    422,
    ['CYCLE_DETECTED', 'BLOCKED_BY_DEPENDENCIES', 'DEPENDENCY_LIMIT'],
    'the edge would create a cycle, would leave an In Progress TODO Blocked, or exceeds the fan-out cap',
  )
  addDependency(
    @Param('id', new ZodValidationPipe(Uuid)) id: string,
    @Body(new ZodValidationPipe(AddDependencyInput)) body: AddDependencyInput,
  ): Promise<Todo> {
    return this.todosService.addDependency(id, body.dependsOn);
  }

  @Delete(':id/dependencies/:dependencyId')
  @ApiOperation({
    summary: 'Remove a Dependency from a TODO',
    description:
      'Removing an edge cannot create a cycle, so no graph lock is taken (ADR 0003).',
  })
  @ApiIdParam()
  @ApiIdParam('dependencyId', 'Dependency TODO id')
  @ApiTodoResponse('The dependent TODO without the Dependency')
  @ApiValidationError('an id is not a uuid')
  @ApiNotFoundError('no live TODO with the dependent id')
  removeDependency(
    @Param('id', new ZodValidationPipe(Uuid)) id: string,
    @Param('dependencyId', new ZodValidationPipe(Uuid)) dependencyId: string,
  ): Promise<Todo> {
    return this.todosService.removeDependency(id, dependencyId);
  }
}

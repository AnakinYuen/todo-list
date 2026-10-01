# 10: Scale and performance

**What to build:** A list of 10,000+ TODOs stays responsive to list, filter and
sort, and the system's known break point (a TODO with thousands of dependents) is
guarded against. The list read is also tightened to a single consistent query and
its blocking rule expressed once.

**Blocked by:** 00 (Coding standards, Prettier and ESLint), 05 (Filter, sort and pagination), 06 (Dependencies)

**Status:** shipped

- [x] Indexes cover Status, Priority, due date, series id and the dependency edge table
- [x] The list page and its `blockedBy` lookup are **one query** (see comments) — no second round trip, one snapshot
- [x] `satisfied` is a **single shared SQL predicate** used by both the `blocked` filter and the `blockedBy` read
- [x] A fan-out cap limits dependencies per TODO, and a supernode (one TODO with thousands of dependents) degrades gracefully
- [x] A seeded 10k suite asserts index scans (not sequential scans) and bounded query counts
- [x] Wall-clock latency is measured in a separate, non-gating benchmark
- [x] The 10k suite is excluded from the default fast test run

## Comments

Two correctness/quality items were folded in here, because they touch the same
list-read code this ticket is already optimising:

1. **One query for the list page and its `blockedBy`.** Today `list()` runs the
   page `SELECT`, then `serialize()` runs a second `SELECT` for `blockedBy`. Each
   statement is its own snapshot, so a dependency change between them can leave a
   page whose `blocked`/`blockedBy` reflects a different instant than its rows
   (read skew) — and it is a needless second round trip. Fold them with a
   `LEFT JOIN LATERAL ... json_agg` (or an equivalent) so the descriptors come
   back with the page, one snapshot, one call. This supersedes the earlier
   "batched `blockedBy`" wording: batching was the floor, one query is the goal.

2. **One `satisfied` predicate.** The rule "satisfied = completed and not
   deleted" is currently written twice — as SQL in the `blocked` filter
   (`hasUnsatisfiedDependency`, negated) and as TypeScript in `dependencyMap`
   (positive). They agree only by De Morgan; a future change to the rule can
   update one and leave the other, so the filter and the badge would disagree.
   Define it once as a SQL predicate and have both the filter and the list read
   use it, so TypeScript holds no copy of the rule.

Ordering note: this touches `dependencies.ts` and the list path, which tickets
08b and 09 also edit. Land it after them to avoid reworking the same code.

The list has no index on `status`/`priority`/`due_date`, and the keyset sort uses
computed expressions (`coalesce`/`case` for a uniform text key) rather than plain
columns, so `ORDER BY` cannot use those indexes. This ticket decides whether to
index, to materialise a sort key, or to accept the sort cost — measured, not
guessed. The current queries live in `apps/api/src/todos/`.

## Delivered

**Indexes (migration `0008`).** `todos_status_idx`, `todos_priority_idx`,
`todos_due_date_idx`, `todos_series_id_idx`. The edge table needed none: the
`(dependent_id, dependency_id)` PK already serves dependent and paired lookups and
`todo_dependencies_dependency_idx` serves reverse lookups.

**One query for the page and its dependencies.** `list()` selects
`getTableColumns(todos)` plus a correlated `json_agg` (`dependencyRefsJson`) that
carries each dependency's `satisfied` flag, so `blocked`/`blockedBy` come from the
same statement and snapshot as the rows. The old second `dependencyMap` fetch on
the list path is gone; the read is asserted to be a single query.

**One `satisfied` predicate.** `dependencies.ts` exports `satisfied(alias)`
(`completed_at is not null and deleted_at is null`). The `blocked` `EXISTS`, the
list aggregate, the single-row `dependencyMap`, the add-edge invariant check and
the delete-impact read all use it; the TypeScript `isSatisfied` copy is deleted.

**Fan-out cap.** `MAX_DEPENDENCIES_PER_TODO` (shared, 50) bounds a TODO's
dependencies; `addDependency` rejects a 51st distinct edge with `422
DEPENDENCY_LIMIT` (re-adding an existing edge stays a no-op). Supernodes — one
TODO with thousands of dependents — are left uncapped and served by the edge
indexes.

**Measured, not guessed.** `apps/api/scripts/benchmark.ts` seeds ~10k and times
the read paths (default sort p50 ≈ 5ms; filtered < 1ms; `blocked` ≈ 3ms). The
unfiltered sort is a sequential scan plus sort by design — the text keyset key is
computed — and at 10k that is acceptable, so no sort key was materialised. The
indexes serve the `WHERE` filters, which is where they are asserted.

**Tests.** `apps/api/test/scale/list.scale.ts` (10 tests) runs under
`vitest.scale.config.mts` via `pnpm --filter @todo-list/api test:scale`, excluded
from the fast run by its `.scale.ts` name. It asserts: one query per page,
bounded across page sizes; the `blocked` `EXISTS` and the dependency aggregate
use the edge index and never a sequential scan — the plan assertions are built
from the production `hasUnsatisfiedDependency()` / `dependencyRefsJson()`, not a
hand-copied query; the Status and due-date filters use their indexes; and the
supernode and fan-out shapes behave. `todos-dependencies.e2e.test.ts` gains the
cap test.

Verified: `pnpm lint`, `pnpm format:check`, `pnpm -r typecheck`, `pnpm -r build`,
`pnpm test`, `pnpm --filter @todo-list/api test:scale`.


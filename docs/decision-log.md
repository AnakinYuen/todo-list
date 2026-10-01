# Decision Log

## Current state

The application is implemented. `apps/api` (NestJS + Fastify + Drizzle),
`apps/web` (React + Vite) and `packages/shared` (Zod contracts) all ship source,
tests and migrations, and `docker compose up --build` runs the whole stack
against Postgres. Everything below records the decisions that produced the
shipped code; where a decision changed after implementation, the change is noted
in place.

## Stack

- **Backend: NestJS + Fastify.** NestJS supplies the module/DI/validation
  structure the brief evaluates and generates OpenAPI docs via Swagger; Fastify
  is the HTTP adapter for throughput headroom against the 10,000+ item target.
- **Database: PostgreSQL 16 + Drizzle.** Dependencies are a graph and retention is
  a tombstone, so typed SQL over a relational store fits better than a document
  store; Drizzle generates reviewable migrations.
- **Frontend: React + Vite.**
- **Contracts: Zod schemas in `packages/shared`,** the single source of truth for
  API DTOs and the UI, so the two cannot drift.
- **Deployment: one image, two entry points.** The API image only serves
  (`node dist/main.js`); migrations are a separate, one-shot invocation of the
  same image (`node dist/db/migrate.js`) — compose's `migrate` service, or a
  deploy job in production. Schema changes have a single owner, and no app
  replica can race to apply them. A GitHub Actions workflow
  (`.github/workflows/ci.yml`) runs lint, format check, typecheck, build, the
  full test suite and the 10k scale suite against a PostgreSQL service, plus a
  Docker build of the api and web images, on every push and pull request.

## How ambiguous requirements were resolved

### Recurrence (ADR 0001, ADR 0007)

Instance-based: on completion the server clones the occurrence into the next one,
and the schedule lives on the occurrence rather than on a series entity.

There are **two modes (ADR 0007)**, because habits and calendar obligations are
different problems and no single rule serves both:

- **After completion** — `{ interval, unit }` with `unit` days/weeks/months. The
  next date is `completion + interval units`; no due date is needed. This is the
  habit model ("water the plants every 3 days").
- **On a schedule** — the RFC 5545 subset Google Calendar exposes: a frequency
  (`DAILY | WEEKLY | MONTHLY`), an interval, a weekday set for weekly, and a monthly
  anchor. The four anchors are `DayOfMonth`, `LastDayOfMonth`, `NthWeekday(1–4)` and
  `LastWeekday`. The next date is the first scheduled date on or after the completion
  and strictly after the occurrence's due date (ADR 0001's rule), so the schedule
  never shifts and a late tick collapses forward instead of building a backlog. This
  is the obligation model ("team sync every Monday", "rent on the 1st").

Following RFC/Google, `DayOfMonth` **skips** months that lack that day rather than
clamping to the last day — clamping is Outlook's behaviour. (An earlier draft of
this log clamped "day 31" to Feb 28; that was wrong for Google and is corrected;
"last day of month" is now its own anchor.) There is no yearly frequency and no
end condition — a series ends when the current occurrence is completed after its
rule has been removed. Only *completing* an occurrence spawns the next; archiving
the live occurrence suspends the series (recoverable by un-archiving), deleting it
ends the series (the rule can never spawn again), while either disposition of a
past occurrence is inert.

A completed occurrence's rule can neither be **added** nor **changed** (422
`RECURRENCE_ON_COMPLETED`): its successor has already spawned from the old rule,
so a change would be inert and invisible, and only a reopen (which cascades
started dependents) can legitimately alter it. The web form sends every field on
save, so an unchanged echo is accepted.

Due dates are calendar dates (`DATE`). A rule's mode is explicit, so "does it have a
due date" never implies the behaviour. Only the next occurrence exists — there is no
future projection; completing, reopening and re-completing spawns at most one
successor, guarded by `spawnedAt`.

### Custom recurrence

`CUSTOM` is not a third mode; it is the editor over the schedule mode's fields
(frequency + interval + weekday set / monthly anchor). "Every 2 weeks on Mon and
Wed" is one schedule rule, not a new kind of recurrence. The after-completion mode
is the other option in the same editor (ADR 0007).

### Dependencies and disposition (ADR 0002)

A dependency is satisfied only by a genuine completion that has not since been
reopened. Archiving is orthogonal to outcome: a completed prerequisite stays
satisfied when archived; an unfinished one does not satisfy when archived.
Deletion is not a disposition at all — it removes the edge (ADR 0005), so there is
nothing left to satisfy. Dependencies gate entering In Progress **and** entering
Completed, so completing cannot bypass blocking. Whether a TODO is blocked is
computed on read, not stored.

### The blocking invariant (ADR 0004)

Gating is not enough: the rule "In Progress implies every dependency is
Satisfied" is a state invariant. A transition that leaves a Satisfied state for an
active one — reopening a completed TODO, or un-archiving a completed one —
cascades its In Progress dependents back to Not Started, in the same graph-locked
transaction. The cascade propagates only through reverted dependents; a Completed
dependent stays Completed and still satisfies its own dependents. Entering
Archived does not cascade, because archiving keeps a completed dependency
satisfied (ADR 0002). The invariant is enforced on transitions and on Dependency
edits: adding an unsatisfied Dependency to a TODO already In Progress is rejected
(422), because an edge edit cannot cascade. Deleting removes the edges (ADR 0005),
so it never leaves an In Progress dependent blocked — the invariant now holds for
transitions, edits and deletion. The UI confirms the cascade first, from a
server-computed impact read that shares the cascade's traversal so the warning
cannot disagree with the outcome.

### Dependency-graph enforcement (ADR 0003)

Blocking is derived on read, so a status change is a single-row write with no
propagation. Acyclicity is enforced when an edge is added: the reachability check
and the insert run in one transaction that first takes a graph-wide
`pg_advisory_xact_lock`, so two concurrent edge edits that would combine into a
cycle cannot both pass their checks (a write-skew race that optimistic versioning
cannot catch). `REPEATABLE READ` is insufficient; `SERIALIZABLE` + retry is the
rejected alternative. Blocking is not overridable — the escape is removing the
edge. A global execution order is deliberately not built; dependencies are
surfaced per row.

### Deletion and retention (ADR 0005)

Deletion is permanent to the user: `deletedAt` marks the row, it is never purged,
and there is no restore and no Deleted view. `includeDeleted` remains as an
audit-only read. Deleting a TODO also deletes its Dependency edges — both where it
is the dependent and where it is the dependency — under the graph lock, so it stops
blocking and stops being blocked. The brief's "data must not be permanently lost"
is read as *audit retention*, not recovery; mistaken deletion is recoverable only
out of band. The delete flow confirms first, states that it cannot be undone, and
lists the dependents that will unblock.

### Concurrency

One shared list, no auth (chosen deliberately). Optimistic concurrency guards
every write to a TODO's own fields — edit, transition and delete — with a version
check that returns 409 on a stale write; dependency-edge mutations are serialised
by the graph lock instead (ADR 0003), since they change the join table rather than
a row's fields. The one compound operation ("complete a recurring TODO and spawn
the next") shares that guard: two simultaneous completes of the same occurrence
both read version V, only the first `UPDATE ... WHERE version = V` writes, so one
spawn happens and the loser gets 409. A `spawnedAt` marker, set in the same write
as the completion, stops a reopen-and-recomplete or an archive-and-recomplete from
spawning a second successor (ADR 0007). A partial unique index on
`(seriesId, due date)` is defence-in-depth on top (ticket 09). No distributed
locks, no serializable everywhere, no event sourcing.

The version travels where the request can carry it: a `version` field in the JSON
body for `PATCH` and the transition `POST`, and a `?version=` query parameter for
`DELETE`, which has no reliable request-body semantics. The standards alternative
is a conditional request — emit `ETag` and send `If-Match` — which works uniformly
across verbs and enables conditional GETs, at the cost of emitting and parsing
ETags, a `412`/`428` failure contract distinct from the app's `409 CONFLICT`, and
rewriting all three write paths. For a small, always-refetching single-list UI the
query parameter reuses the existing validation and one error shape; `If-Match` is
the choice we would make if conditional requests or a public API surface were
needed.

The UI recovers from a rejected write without a manual reload: a transition
`CONFLICT` refreshes the list and the selected TODO, so both show the winner's
state; a save `CONFLICT` refreshes the list but keeps the draft and offers
"Reload latest version", so an unsaved edit can never silently overwrite the other
writer; a `NOT_FOUND` closes the panel. The list header shows the last successful
sync time and a manual Refresh — the UI refetches, there is no push.

### Scale (10,000+)

Keyset (cursor) pagination ordered by the requested sort plus `id`, server-side
filters and sorts, and **one query per page that carries its own `blockedBy`**
(the page `SELECT` aggregates its dependencies, so the blocking rule is read in
the same snapshot and TypeScript holds no copy of it). Indexes on status,
priority, due date and series id cover the filters and the recurrence scan; edge
lookups use the existing composite PK. `blocked` stays a computed `EXISTS`, now
sharing the one `satisfied` SQL predicate with the read. The dependency picker's
name search is a literal, case-insensitive **prefix** served by a
`lower(name) text_pattern_ops` btree index (`todos_name_prefix_idx`, migration
0009), so a selective prefix is an index scan — no extension needed. Prefix-only
is a deliberate trade: no mid-name or typo matching (typing `design` will not find
`Get design approval`) in exchange for a plain btree with no extension risk.

Measured, not guessed (ticket 10, `apps/api/scripts/benchmark.ts`, ~10k rows):
default due-date sort p50 ≈ 5ms (p95 ≈ 7ms), filtered list p50/p95 < 1ms, and
`blocked=true` p50 ≈ 3ms (p95 ≈ 3ms). The benchmark reports p50/p95/max; p50 is
the stable headline, and its p95 tail stays in the same order. The claim is
order-of-magnitude, not an SLO, and the non-gating local benchmark makes p95 too
noisy to assert on. The unfiltered sort is a sequential scan plus sort — the text
keyset key is computed, so the plain indexes cannot serve `ORDER BY`; at 10k that
costs single-digit milliseconds, so no sort key is materialised. A seeded,
non-gating 10k suite (`apps/api/test/scale`, run with `pnpm --filter @todo-list/api
test:scale`) asserts the deterministic part: the list is one query independent of
page size, the `blocked` filter and dependency reads use the edge index (never a
sequential scan), and the selective Status/due-date filters use their indexes. It
also covers supernodes: fan-out (dependencies per TODO) is capped, while one TODO
with thousands of dependents is served by the edge indexes and returns a finite,
index-ordered list rather than degrading.

### Time, and why there is no Clock provider

Production reads the real clock (`new Date()`) at seven sites — six in the todos
service and one in the shared version guard. Tests that assert a Recurrence due
date pin the completion time in the harness (`completeOn`) rather than freezing
the process clock: `vi.useFakeTimers`
patches the global timer wheel, so anything that awaits a timer — `pg` sockets,
pino flush, Nest bootstrap — hangs (verified). **Trigger:** when a second feature's
observable behaviour depends on "now" (reports, SLA timers, benchmarks), introduce
an injectable `Clock` and route every call site through it, so one fake clock is
shared without touching `Date`.

## Deliberately not built

- **Authentication** and multi-user accounts — nice-to-have; one shared list is a
  faster path to a working demo. Concurrency is handled without identity.
- **Real-time updates** — the UI refetches; polling/SSE is the next iteration.
- **Bulk operations**.
- A **series entity** for recurrence (ADR 0001) — the shared series id is the
  migration seam if schedule-wide editing or series reporting is needed.
- **Yearly recurrence, end conditions and exclusions** — out of the brief; see
  the note on `rrule` below for how to add them.
- A **global execution-order / "do next" view** — dependencies are surfaced per
  row; the ready set is derivable later if needed (ADR 0003).

## Verification plan

Unit (Vitest) for pure logic; integration against the `todo-list_test` database
for anything the database enforces.

Recurrence date maths is the highest-risk code, so it gets an **exhaustive,
table-driven** suite (the table doubles as the written spec): frequency ×
interval (1 and >1) × weekly weekday sets (single, multiple, wrap-around across
the week boundary) × all four monthly anchors × month lengths (28/29/30/31, leap
and non-leap, year boundary) × completion timing (early, on-time, late by several
periods). Plus invariants: the next date is strictly after the completed
occurrence, never before the completion date, and always satisfies the anchor
(lands on the chosen weekday / nth / last).

We considered using the `rrule` library as a dev-only differential oracle and
**declined**: the rule is a bounded subset that maps 1:1 onto RFC 5545 parts, so
the exhaustive table catches the same bugs without a dependency, without an
adapter, and without a `Date`-only conversion layer. `rrule` is the fallback if
recurrence grows to yearly/end conditions/exclusions.

Other cases:

- Strict gating: `Not Started → Completed` and `In Progress → Completed` rejected
  while blocked (422 with `blockedBy`).
- Cycle detection: self-edge and indirect cycles rejected; valid chains accepted,
  including the concurrent write-skew case.
- Dependency state after archive/delete: completed-then-archived satisfied;
  archived-before-completion not; reopening re-blocks; deleting removes the edge
  and unblocks the dependent.
- Spawn inheritance: fields and outside-series dependencies copied, status not.
- **Race condition:** concurrent completes spawn exactly one next occurrence;
  concurrent transitions resolved by the version check; concurrent cycle-forming
  edge creation rejected by the advisory-lock serialisation.
- **Idempotency:** a repeated complete at the same version is a no-op and spawns
  once; repeated delete is safe; reads have no write side effects.
- **Transaction rollback:** if spawning the next occurrence fails, the completion
  rolls back (and vice versa); invalid dependency creation rolls back.
- **N+1 check:** a list request is a **single** query carrying its dependencies,
  independent of page size.
- **Scale (10k):** a seeded suite (`apps/api/test/scale`, excluded from the fast
  run via `test:scale`) over ~10k TODOs asserts deterministic properties that gate
  CI — the list is one query, the `blocked` filter and dependency reads use an edge
  index rather than a sequential scan, and the Status/due-date filters use their
  indexes — plus a supernode case (one TODO with thousands of dependents) and the
  fan-out cap. Wall-clock latency is measured in a separate, non-gating benchmark
  (`scripts/benchmark.ts`), because timing assertions flake on CI runners.

## What I would do differently with more time

- Introduce the series entity and schedule-wide editing/reporting (ADR 0001's
  deferred option).
- Materialize `blocked` if the 10k profiling shows the `EXISTS` dominating.
- Add authentication and real-time updates (which also make audit trails
  possible).
- Add a "do next" / suggested-execution-order view built from the ready set.
- Adopt `rrule` if recurrence scope grows to yearly/end conditions/exclusions.
- Introduce `turbo prune` for Docker layer caching as the package count grows.

## Verified toolchain notes

- **`tsconfig.base.json`:** `target`/`lib` ES2025, `module` `node20`,
  `moduleResolution` `node16`, `strict`, `noUncheckedIndexedAccess`. Each package
  has its own `tsconfig.json` extending it (`apps/api` also `tsconfig.build.json`
  for the emit); an earlier version of this log, written before the apps existed,
  claimed there were no per-app tsconfigs.
- **`pnpm-workspace.yaml`:** `allowBuilds` permits `esbuild`, `@swc/core`,
  `@parcel/watcher` and `unrs-resolver`, and denies the telemetry-only
  `@scarf/scarf`. No `minimumReleaseAge` is configured (an earlier version of this
  log claimed one).
- **Versions:** the root `packageManager` is `pnpm@12.6.0` and `engines.node` is
  `>=22`, while the Docker base is `node:24.21-bookworm-slim` and
  `nginx:1.30-alpine`. Image tags are pinned to major.minor; the release pipeline
  should pass immutable digests via the `NODE_IMAGE`/`NGINX_IMAGE` build args.
- **`.env.example` documents the defaults.** Compose supplies `POSTGRES_*` and
  `CORS_ORIGINS`; the file records them plus `PORT`, `DATABASE_URL` and the
  optional `TEST_DATABASE_URL`.
- **`./docker/initdb/01-create-test-db.sql` creates `todo-list_test`** on the
  Postgres volume's first initialisation, so the integration tests have their own
  database.

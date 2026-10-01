# Spec: TODO list application

Status: shipped — all tickets implemented; see docs/decision-log.md
Type: spec
Slug: todo-list-app

## Problem Statement

A small team shares one list of work, and today that list can't express what the
work actually needs. There is no way to say "this routine repeats every Monday
and Wednesday", no way to say "don't start this until that is done", no way to
filter down to what is actionable right now, and no way to get an item back after
deleting it by mistake. A plain checklist either loses data, can't model these
relationships, or becomes unusable once the list grows into the thousands.

The people using the list need to capture work once, describe how it repeats and
what it depends on, see clearly what is Blocked and why, and trust that concurrent
edits and deletes won't silently destroy their data.

## Solution

A single, shared TODO list web application: a NestJS API over PostgreSQL with a
React UI, delivered as a pnpm workspace monorepo with shared contracts.

- **TODO management** — full CRUD over a TODO's name, description, due date,
  Status and Priority, with deletion that retains the row for audit rather than
  purging it.
- **Instance-based Recurrence** — each Occurrence is a real TODO; completing one
  spawns the next. A rule repeats either *after completion* (habit) or *on a fixed
  schedule* (a bounded RFC 5545 subset — daily, weekly, monthly, custom — with
  Google Calendar's monthly anchors), chosen explicitly (ADR 0007).
- **Dependencies** — a TODO can depend on others; it cannot start or be completed
  until every Dependency is Satisfied, and cycles are impossible.
- **Filtering and sorting** — by Status, Priority, due date and Blocked/
  unblocked; sorted by due date, Priority, Status or name; paginated for scale.
- **Concurrency and retention** — optimistic concurrency guards every write,
  including the complete-and-spawn compound write; an advisory lock serialises
  dependency-edge mutations; and deletion keeps an audit record (ADR 0005).

The design is recorded in `CONTEXT.md`, `docs/adr/0001`–`0007` and
`docs/decision-log.md`; the vocabulary below follows the glossary.

## User Stories

### Capturing and maintaining TODOs

1. As a list user, I want to create a TODO with a name, description, due date and Priority, so that the work is captured in one place.
2. As a list user, I want to give a TODO a Status (Not Started, In Progress, Completed, Archived), so that I can track where it is.
3. As a list user, I want to view the list of TODOs, so that I know what is outstanding.
4. As a list user, I want to open a single TODO, so that I can see all of its detail, including its Dependencies.
5. As a list user, I want to edit a TODO's name, description, due date and Priority, so that it stays accurate.
6. As a list user, I want to delete a TODO, so that it stops cluttering my list.

### Status lifecycle

7. As a list user, I want to move a TODO to In Progress, so that work in flight is visible.
8. As a list user, I want to mark a TODO Completed, so that finished work is recorded.
9. As a list user, I want to revert an In Progress TODO to Not Started, so that I can correct a mistaken start.
10. As a list user, I want to reopen a Completed TODO, so that I can resume work that turned out not to be finished.
11. As a list user, I want to Archive a TODO, so that I can take it out of the working set without deleting it.
12. As a list user, I want to un-archive a TODO, so that archived work can come back.
13. As a list user, I want to be prevented from starting a Blocked TODO, so that I cannot work out of order.
14. As a list user, I want to be told which TODOs block a Blocked TODO, so that I know what to do first.
15. As a list user, I want to be prevented from completing a Blocked TODO too, so that Dependencies cannot be bypassed.
16. As a list user, I want an on-time completion not to produce a backlog of overdue Occurences.

### Priority and due dates

17. As a list user, I want to set a Priority (Low, Medium, High), so that I can express relative importance.
18. As a list user, I want to change a TODO's due date, so that plans can shift.
19. As a list user, I want to see overdue TODOs, so that I can prioritise correctly.

### Recurrence

20. As a list user, I want to make a TODO recur daily, so that daily routines reappear without being re-created.
21. As a list user, I want a weekly Recurrence on one weekday, so that a specific weekday routine is captured.
22. As a list user, I want a weekly Recurrence on several weekdays, so that "every Mon/Wed/Fri" is one rule.
23. As a list user, I want a monthly Recurrence on a day of the month, so that "the 15th" repeats.
24. As a list user, I want a monthly Recurrence on the last day of the month, so that month-end work repeats.
25. As a list user, I want a monthly Recurrence on the nth weekday (first–fourth), so that "the fourth Sunday" repeats.
26. As a list user, I want a monthly Recurrence on the last weekday, so that "the last Sunday" repeats.
27. As a list user, I want to repeat every N days, weeks or months, so that arbitrary cadences are possible.
28. As a list user, I want completing a recurring Occurrence to create the next Occurrence automatically, so that the routine keeps going.
29. As a list user, I want to choose whether a routine repeats *after I complete it* (habits follow my pace) or *on a fixed schedule* (obligations keep their date), so that each recurrence means what I intend.
30. As a list user, I want "the 31st" to skip months without a 31st rather than silently moving to the 28th, so that the rule means what I asked for.
31. As a list user, I want to see a TODO's Recurrence rule at a glance, so that I know how it repeats.
32. As a list user, I want the next Occurrence to inherit the name, description, Priority, rule and outside-Series Dependencies but start Not Started, so that each Occurrence is a real, independent TODO.
33. As a list user, I want to stop a recurring task by removing its Recurrence rule, so that a routine can end when I no longer need it.
34. As a list user, I want Archiving the live (uncompleted) Occurrence to suspend the Series (recoverable by un-archiving), and deleting it to end the Series permanently, so that I can pause a routine but know which action is final.

### Dependencies

35. As a list user, I want to add a Dependency from one TODO to another, so that I can express prerequisites.
36. As a list user, I want to remove a Dependency, so that a requirement that no longer applies stops blocking.
37. As a list user, I want to see a Blocked badge on affected TODOs, so that I can spot them instantly.
38. As a list user, I want to see the `blockedBy` list, so that I can navigate to each blocker.
39. As a list user, I want a cycle to be rejected, so that the graph stays answerable.
40. As a list user, I want only a genuine completion to satisfy a Dependency, so that Archived and Deleted TODOs cannot masquerade as done.
41. As a list user, I want a completed prerequisite that is later Archived to keep my dependent unblocked, so that tidying up does not break my list.
42. As a list user, I want reopening a prerequisite to re-block its dependents, so that the list reflects reality.
43. As a list user, I want deleting a prerequisite to remove its Dependencies, so that dependents are not left blocked by a requirement that no longer exists.
44. As a list user, I want to be warned before a delete, and to see which dependents it will unblock, so that I understand the consequence before it is permanent.

### Filtering and sorting

45. As a list user, I want to filter by Status, so that I can see only what I need.
46. As a list user, I want to filter by Priority, so that I can focus on high-priority work.
47. As a list user, I want to filter by due date, so that I can isolate what is due or overdue.
48. As a list user, I want to filter by Blocked/unblocked, so that I can find what I can act on now.
49. As a list user, I want to sort by due date, Priority, Status or name, so that I can order the list how I think.
50. As a list user, I want to combine a filter with a sort, so that I get exactly the view I want.
51. As a list user, I want to page through a long list, so that large lists stay responsive.

### Concurrency and scale

52. As a list user, I want several people to use the same list at once without corrupting it, so that we can share one source of truth.
53. As a list user, I want a stale edit rejected with a clear conflict, so that I do not silently overwrite someone else's change.
54. As a list user, I want two simultaneous completions of the same recurring Occurrence to create exactly one next Occurrence, so that the Series does not fork.
55. As a list user, I want a list of 10,000+ TODOs to remain responsive, so that the tool stays usable at scale.

### Web UI

56. As a list user, I want a functional web UI to create, edit and delete TODOs, so that I do not need the API directly.
57. As a list user, I want UI controls for filtering and sorting, so that I can shape the view without writing queries.
58. As a list user, I want a Dependency editor and a Blocked indicator, so that I can manage prerequisites visually.
59. As a list user, I want a Recurrence editor exposing the four monthly anchors, so that I can set the rule I mean.
60. As a list user, I want a delete to be confirmed and clearly irreversible, so that I do not remove work by accident.

### API, errors and docs

61. As an API consumer, I want an OpenAPI/Swagger description, so that I can integrate without guesswork.
62. As an API consumer, I want malformed input rejected with validation errors, so that bad data never enters the list.
63. As an API consumer, I want structured error responses (e.g. `BLOCKED_BY_DEPENDENCIES` with the blockers), so that I can handle failures precisely.
64. As a list user, I want deleted data retained for audit, so that nothing is purged even though the delete is irreversible in the product.

## Implementation Decisions

- **Workspace layout.** Three packages: the API (NestJS + Fastify), the web app (React + Vite) and a shared package holding Zod schemas and TypeScript types used by both. The shared package is the single source of truth for API contracts, so validation and types cannot drift.
- **Database.** PostgreSQL with Drizzle migrations. Two tables: `todos` and the dependency join table. TODO columns include name, description, due date (calendar `DATE`, not timestamp),   Status, Priority, an optimistic-concurrency `version`, a nullable completion
  timestamp (`completedAt`), a nullable spawn-once marker (`spawnedAt`), a
  nullable soft-delete timestamp (`deletedAt`), a nullable `seriesId`, and the
  Recurrence rule fields. The dependency table stores directed edges (`dependent`, `dependency`).
- **Status state machine.** Transitions are enforced by the API, not free-form. Snippet (from the design/grilling session, trimmed to the decision-rich parts):

  ```
  Not Started → In Progress : iff every Dependency is Satisfied
  Not Started → Completed   : iff every Dependency is Satisfied; spawns next Occurrence if recurring
  Not Started → Archived    : always
  In Progress → Not Started : always
  In Progress → Completed   : iff every Dependency is Satisfied; spawns next Occurrence if recurring
  In Progress → Archived    : always
  Completed   → Not Started : reopen; clears completedAt
  Completed   → In Progress : reopen; iff every Dependency is Satisfied; clears completedAt
  Completed   → Archived    : always
  Archived    → Not Started : un-archive
  Archived    → In Progress : iff every Dependency is Satisfied
  Archived    → Completed   : iff every Dependency is Satisfied; spawns only if never spawned for this Occurrence
  any → same                : no-op
  unknown target            : 400 validation error (code VALIDATION)
  missing or Deleted TODO   : 404
  stale version             : 409
  ```

- **Dependency satisfaction.** Snippet again, because it is the crux:

  ```
  Satisfied(dependency) = dependency.completedAt != null
  Blocked(todo)         = exists an edge whose target is not Satisfied
  ```

  Archiving is orthogonal to outcome: a completed prerequisite stays Satisfied
  when Archived; an unfinished one Archived does not Satisfy. Deleting removes the
  edge entirely (ADR 0005), so there is nothing left to satisfy; the `deletedAt`
  check lingers in the query only as defence against legacy rows.
- **Blocking is computed on read**, never stored. `blocked`/`blockedBy` are derived by an indexed `EXISTS` over the edges; a Status change is a single-row write with no propagation (ADR 0003).
- **Recurrence rule shape.** A discriminated union on `mode` (ADR 0007):

  ```
  RecurrenceRule =
    | { mode: 'AFTER_COMPLETION', interval: 1..365, unit: DAYS | WEEKS | MONTHS }
    | { mode: 'FIXED_SCHEDULE', schedule: ScheduleRule }

  ScheduleRule {
    frequency: DAILY | WEEKLY | MONTHLY
    interval:  integer 1..365
    byWeekday?: Weekday[]                                        // WEEKLY only
    monthlyAnchor?: DayOfMonth(1..31) | LastDayOfMonth
                  | NthWeekday(1..4) | LastWeekday                // MONTHLY only
  }
  ```

  Anchors follow RFC 5545 / Google Calendar semantics: `DayOfMonth` skips months
  that lack the day; `LastDayOfMonth` is `BYMONTHDAY=-1`; `NthWeekday` is
  `BYDAY;BYSETPOS=n`; `LastWeekday` is `BYDAY;BYSETPOS=-1`; the week starts
  Monday. There is no yearly frequency and no end condition (ADR 0001).
- **Next Occurrence.** A Recurrence rule declares its mode (ADR 0007). Only
  completing an Occurrence spawns the next.
  - *After completion*: the next due date is `completion + interval units`
    (days/weeks/months); no due date is needed and the cadence follows when work
    actually finishes.
  - *On a schedule*: the next due date is the first scheduled date on or after the
    completion and strictly after the current Occurrence's due date, so the schedule
    never shifts and a late completion collapses forward instead of building a
    backlog.
  A Completion spawns at most once per Occurrence (`spawnedAt` guards re-opening and
  re-completing). The spawn copies name, description, Priority, rule and
  Dependencies on TODOs outside the Series; it does not copy Status or the
  completion timestamp. Occurrences share a nullable `seriesId`. A Series ends when
  the live Occurrence is completed after its rule has been removed.
- **Concurrency.** Every write to a TODO's own fields — edit, transition and
  delete — carries an optimistic `version` and returns 409 on a stale write; the
  complete-and-spawn write shares that version guard, so two completes
  of the same Occurrence spawn at most one successor, and `spawnedAt` prevents a
  reopen-and-recomplete from spawning again. A partial unique index on
  `(seriesId, due date)` is defence-in-depth (ticket 09). Dependency edge
  mutations run in a transaction that first takes a graph-wide advisory lock
  (`pg_advisory_xact_lock`) and performs the reachability check inside it, so
  concurrent edge edits cannot combine into a cycle (ADR 0003).
- **Deletion and retention.** Delete sets `deletedAt`; the row is never purged but
  there is no restore and no Deleted view (ADR 0005). Delete also removes the
  TODO's Dependency edges in both directions, under the graph lock, so dependents
  unblock. `includeDeleted` remains as an audit-only read.
- **API surface (REST, domain-named).** List/get/create/update/delete a TODO; a
  status-transition operation; a transition-impact, a delete-impact and a
  next-occurrence preview; a name search for the Dependency picker; add/remove a
  Dependency; list endpoints accept status, priority, due-date, blocked/unblocked
  filters, a sort key, and a keyset cursor. Errors carry machine-readable codes
  (`VALIDATION`, `NOT_FOUND`, `CONFLICT`, `DUPLICATE_OCCURRENCE`,
  `BLOCKED_BY_DEPENDENCIES`, `CYCLE_DETECTED`, `RECURRENCE_ON_COMPLETED`,
  `DEPENDENCY_LIMIT`).
- **Scale.** Keyset (cursor) pagination ordered by the requested sort plus `id`;
  server-side filters and sorts; **one query** per page that carries its
  `blockedBy` (one snapshot, the shared `satisfied` predicate); indexes on Status,
  Priority, due date and series id (the edge lookups use the existing composite
  PK); a name-prefix index for the Dependency picker (`lower(name)
  text_pattern_ops`, migration `0009`); a fan-out cap per TODO. `blocked` stays
  computed-on-read, measured at 10k and materialized only if it degrades.
- **Web app.** A single functional page: a filterable/sortable TODO table, a
  create/edit form with a Recurrence editor (frequency, interval, weekday set,
  monthly anchor), a Dependency editor, a Blocked badge that links to blockers, and
  a delete confirmation that names the dependents it will unblock.

## Testing Decisions

Good tests here assert **external behaviour** — what a caller or user observes —
not implementation details, so they survive refactoring. Two seams:

1. **HTTP API over the real PostgreSQL test database (`todo-list_test`).** The
   high seam for everything the system does externally, including concurrency
   (fire parallel requests) and the 10k scale checks.
2. **The pure Recurrence rule module, tested directly.** The exhaustive
   date-math table is a pure-function concern; driving it through HTTP would be
   slow and entangle date arithmetic with persistence.

Prior art: none exists yet — this establishes the convention. Vitest for both
seams, with a `todo-list_test` database created by `docker/initdb`. Test names use
the glossary's vocabulary (TODO, Occurrence, Blocked, Satisfied, Anchor).

Coverage:

- **Recurrence date maths** — an exhaustive, table-driven suite over frequency ×
  interval (1 and >1) × weekly weekday sets (single, multiple, wrap-around) × all
  four monthly anchors × month lengths (28/29/30/31, leap and non-leap, year
  boundary) × completion timing (early, on-time, late by several periods). Plus
  invariants: the next date is strictly after the completed Occurrence, never
  before the completion date, and always satisfies the Anchor. This targets the
  engine's highest-risk case: where the next due date lands when the completion
  date and the occurrence's own due date diverge.
- **Status gating** — `Not Started → Completed` and `In Progress → Completed`
  rejected while Blocked (422 with `blockedBy`); permitted once Satisfied.
- **Cycle detection** — self-edge and indirect cycles rejected; valid chains
  accepted; the concurrent write-skew case rejected via the advisory lock.
- **Dependency state after archive/delete** — completed-then-Archived stays
  Satisfied; archived-before-completion does not; reopening re-blocks; deleting
  removes the edge and unblocks the dependent.
- **Spawn inheritance** — fields and outside-Series Dependencies copied, Status
  not; suspended when the live Occurrence is Archived or Deleted.
- **Race condition** — concurrent completes spawn exactly one next Occurrence;
  concurrent transitions resolved by the version check; concurrent cycle-forming
  edge creation rejected.
- **Idempotency** — a repeated complete at the same version is a no-op and spawns
  once; repeated delete is safe; reads have no write side effects.
- **Transaction rollback** — if spawning the next Occurrence fails, the completion
  rolls back (and vice versa); invalid Dependency creation rolls back.
- **N+1 check** — a list request is one query carrying the page and its
  dependencies, independent of page size.
- **Scale (10k)** — a seeded suite (excluded from the fast run, `test:scale`)
  asserts deterministic properties that gate CI: the list is one query, the
  `blocked` and dependency reads use an index scan (not a sequential scan) and the
  query count is bounded, plus a supernode case (one TODO with thousands of
  dependents) and the fan-out cap. Wall-clock latency is measured in a separate,
  non-gating benchmark, because timing assertions flake on CI.

We considered a dev-only `rrule` differential oracle and declined: the rule maps
1:1 onto RFC 5545 parts, so the exhaustive table is the spec and catches the same
bugs without a dependency or an adapter.

## Out of Scope

- **Authentication / user accounts** — one shared list, no identity. Concurrency
  is handled without it.
- **Real-time updates** — the UI refetches; polling/SSE is a future iteration.
- **Bulk operations**.
- **A series entity** — the shared `seriesId` is the migration seam; the Series is
  implicit in this iteration.
- **Yearly recurrence, end conditions and exclusions** — out of the brief.
- **Hard delete / full erasure** — deferred. Deletion is permanent in the product
  (ADR 0005) while the row is retained for audit; a purge/redaction path is future
  work.
- **A global execution-order / "do next" view** — Dependencies are surfaced per
  row; the ready set is derivable later if wanted.
- **A `rrule` test oracle** — declined, as above.

## Further Notes

- This is the SleekFlow code-challenge deliverable. The brief is deliberately
  over-scoped, so prioritisation and the written reasoning matter as much as the
  code. The interpretation and trade-offs are recorded in `CONTEXT.md`,
  `docs/adr/0001`–`0007` and `docs/decision-log.md`; the decision log also records
  the deliberately-not-built list and what would be done differently.
- Implementation status: the workspace, Docker and TypeScript configuration, a
  GitHub Actions workflow, and
  all three packages (API, web, shared) are implemented, with the Drizzle
  migrations, `apps/web/nginx.conf` and `docker/initdb` in place; the live demo
  runs `docker compose up --build`.

# 06: Dependencies

**What to build:** A person can make one TODO depend on others. A dependent TODO
shows as Blocked, cannot be started or completed while any Dependency is not
Satisfied, and its blockers are visible. A cycle can never be created. Only a
genuine completion Satisfies a Dependency: an Archived or Deleted prerequisite
does not.

**Blocked by:** 02 (TODO detail and edit), 03 (Status lifecycle)

**Status:** shipped

- [x] A Dependency can be added and removed
- [x] A self-edge or an indirect cycle is rejected (CYCLE_DETECTED)
- [x] `blocked` and `blockedBy` are computed on read, never stored
- [x] Starting or completing a Blocked TODO is rejected (BLOCKED_BY_DEPENDENCIES, listing the blockers)
- [x] Dependency gating is active in the Status state machine
- [x] A blocked/unblocked filter is available
- [x] The web UI has a Dependency editor and a Blocked badge that links to each blocker
- [x] Integration tests cover gating, cycle rejection and the blocked filter; concurrent edge edits are verified in ticket 09

## Comments

Added a `todo_dependencies` join table (migration `0001`, cascade delete on both
ends, index on the dependency column), and `POST /api/todos/:id/dependencies`
(`{ dependsOn }`, 200, returns the dependent) and
`DELETE /api/todos/:id/dependencies/:dependencyId`.

Blocking is computed on read: every Todo now carries `blocked`, `blockedBy`
(unsatisfied dependencies) and `dependencies` (all of them). `blockedBy` joins the
edges against the dependencies' completion state
(`completedAt IS NOT NULL AND deletedAt IS NULL`), so archiving a completed
dependency keeps it satisfied while deleting one does not.

Cycle detection runs on every edge insert inside a transaction that takes a
graph-wide `pg_advisory_xact_lock` (ADR 0003), with a recursive CTE checking
whether the new dependency can already reach the dependent. Self-edges and
indirect cycles return `422 CYCLE_DETECTED`.

The status machine gates `IN_PROGRESS` and `COMPLETED` on all dependencies being
satisfied, returning `422 BLOCKED_BY_DEPENDENCIES` with the `blockedBy` list. The
list endpoint gained `blocked=true|false`, and the web UI gained a Blocked badge
(tooltip lists blockers), a blocked/unblocked filter, and a dependency editor on
the open TODO.

Verified: `pnpm lint`, `pnpm format:check`, `pnpm -r typecheck`, `pnpm -r build`,
`pnpm test` (78 tests across six suites, 11 new) — plus a `playwright-cli` walk
showing the Blocked badge, the filter, and the dependency editor, with zero
console errors.

Review follow-ups applied: the status gate now runs in the **same transaction**
as the write (taking the graph lock), closing the race where a dependency edit
could slip between the satisfaction check and the transition; `removeDependency`
no longer takes the graph lock (removing an edge cannot create a cycle);
`Todo.id`/`TodoRef.id` use the shared `Uuid`; the blocked badge now links to each
blocker; the duplicated live-row guard was extracted; and the test vocabulary
uses "dependency" rather than the glossary's avoided "prerequisite".

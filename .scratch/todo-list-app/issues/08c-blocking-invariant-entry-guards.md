# 08c: Dependency edits and creation must respect the blocking invariant

**What to build:** Two entry points can reach states the design says are
impossible. Adding a Dependency to a TODO *after* it has started leaves it
`In Progress` + `Blocked` — no transition ran, so no cascade fires. And creating a
recurring TODO directly as `Completed` records a completion without spawning the
next Occurrence, skipping the rule that advancing a Series is what completing does.
Close both where they enter.

**Blocked by:** 06 (Dependencies), 08b (Reopen cascade)

**Status:** shipped

- [x] `POST /api/todos/:id/dependencies` returns 422 `BLOCKED_BY_DEPENDENCIES` (naming the new blocker) when the dependent is In Progress and the dependency to add is unsatisfied
- [x] Adding a satisfied dependency to an In Progress dependent, and any dependency to a Not Started or Completed dependent, still succeeds
- [x] `POST /api/todos` rejects `recurrence` together with `status: COMPLETED` (400 `VALIDATION`), so creation cannot skip the spawn
- [x] Tests cover both

## Comments

Found while checking ticket 08b. `addDependency` only checked that both endpoints
exist and that the edge would not create a cycle; it never looked at the
dependent's Status. So `start D; add unmet P` returned
`{ status: 'IN_PROGRESS', blocked: true }` (verified against the API), violating
ADR 0004's invariant. Because adding an edge is not a transition, the reopen
cascade never ran.

Fix chosen: **reject the edit**, not cascade. The mistake is adding a requirement
to work already in flight; the transition gate already refuses to start blocked
work, and the edge edit refuses to produce the same outcome retroactively. The
user can revert the TODO to Not Started first if the prerequisite is genuinely
intended. Adding a dependency to a `Completed` dependent stays allowed — ADR 0004
leaves `Completed + Blocked` alone by design — and adding to a `Not Started` or
`In Progress + satisfied` dependent is unaffected.

Creation: a brand-new TODO has no dependencies, so `status: COMPLETED` at create
does **not** bypass the dependency gate. It does bypass the recurrence **spawn**, so
a recurring TODO created Completed would silently not advance its Series (while
still getting a `completedAt`). Create now rejects that one combination; a one-off
backfilled as Completed is still allowed.

Boundary since closed: this ticket left soft-deleting a completed Dependency as an
exception that could still leave an In Progress dependent blocked. Ticket 13
(ADR 0005) supersedes that — deleting now removes the Dependency edges, so
"In Progress ⇒ unblocked" holds for transitions, edits and deletion.

## Delivered

`addDependency` now reads both endpoints as full rows (sharing the `liveRow`
helper), and after the cycle check rejects the edge with 422
`BLOCKED_BY_DEPENDENCIES` when the dependent is In Progress and the new dependency
has no `completedAt`. It runs under the existing graph lock, so a concurrent
completion of the dependency cannot slip in between the check and the insert.

`CreateTodoInput` gained a refinement rejecting `recurrence` together with
`status: COMPLETED` (400 `VALIDATION`); a one-off created Completed, and any
recurring TODO created in an active Status, still succeed. The guard and the
satisfaction test reuse the canonical helpers (`unsatisfiedRefs`, `isSatisfied`)
rather than re-deriving them.

Known boundary not closed: `PATCH /api/todos/:id` can still add a `recurrence` to
an already-Completed one-off, reaching the same no-spawn state through the edit
path. This ticket named creation only, and closing the edit path needs its own
error semantics, so it is recorded rather than fixed here.

Verified: `pnpm lint`, `pnpm format:check`, `pnpm -r typecheck`, `pnpm -r build`,
`pnpm test` (138 tests across nine suites).

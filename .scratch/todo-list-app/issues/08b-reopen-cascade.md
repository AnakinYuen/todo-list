# 08b: Reopening a prerequisite cascades its started dependents

**What to build:** The rule "a dependent cannot be In Progress while a dependency
is not Satisfied" holds as a **state**, not only as a transition. Reopening a
completed prerequisite therefore pulls any started dependents back to Not Started,
and the UI warns the user which TODOs that will affect *before* they confirm.

**Blocked by:** 06 (Dependencies), 07 (Recurrence engine), 08 (Recurrence anchors and custom)

**Status:** shipped

- [x] Reopening a prerequisite (`Completed` → `In Progress` / `Not Started`) moves each dependent that is `In Progress` back to `Not Started`, transitively
- [x] A dependent that is `Completed` is left alone; only `In Progress` dependents cascade
- [x] A dependent that is `Not Started` or `Archived` is left alone
- [x] Archiving or deleting a *completed* prerequisite does not cascade (ADR 0002: archiving keeps a completed dependency satisfied)
- [x] The cascade and the reopening write run in one transaction holding the graph lock, so `In Progress ⇒ unblocked` cannot be violated by a concurrent start (write-skew)
- [x] Cascaded dependents have their `version` bumped, so a concurrent edit of one returns 409
- [x] `GET /api/todos/:id/transition-impact?to=<status>` returns the TODOs a transition would cascade (id, name, from, to), computed by the same rule as the real cascade
- [x] The web UI shows a confirmation listing the affected TODOs before applying a cascading transition
- [x] Tests cover: transitive cascade, Completed/Not Started/Archived dependents untouched, archive does not cascade, concurrent reopen vs start is resolved, and concurrent reopen vs edit returns 409

## Comments

The bug: `D` (In Progress) depends on `P`; completing `P` unblocks `D`; reopening
`P` flips `D.blocked` back to true **but leaves `D` In Progress** — a state the
dependency rule says is impossible. Enforcement guarded the transition; nothing
restored the invariant when the precondition changed.

Approach chosen: **restore the invariant** (cascade `In Progress` dependents to
`Not Started`), with an explicit UI warning so the cascade is consented to rather
than surprising. The alternative — leave the state and flag it — was rejected
because it makes the brief's rule advisory rather than true.

**Dry-run belongs on the server.** The client cannot compute the cascade without
the whole graph (the list is keyset-paginated; there is no reverse index), and a
client-side implementation would duplicate the traversal and drift from the real
cascade. The impact endpoint and the cascade share one implementation.

**Race.** This introduces a new cross-row invariant, so it must take the existing
graph-wide advisory lock (ADR 0003) for the entire reopen-and-cascade transaction.
Without it, `reopen P` and `start D` interleave under write skew and leave both In
Progress.

Out of scope: reopening a recurring Occurrence after it already spawned its next
one (does the spawned Occurrence survive?), and cascading `Completed` dependents —
recorded so the boundaries are deliberate.

## Delivered

`apps/api/src/todos/cascade.ts` holds the single rule. `removesSatisfaction` is
the precondition: the TODO currently satisfies its dependents (`completedAt` set)
and the target is an active Status. That covers reopening a completed TODO and
un-archiving a completed one; entering Archived keeps the completion, so it does
not fire. `affectedBy` is the recursive walk upstream; `cascadeTargets` is the
read-only impact; `applyReopenCascade` is the write. Both are built from the same
CTE and only touch `In Progress`, live rows.

The walk propagates only through dependents it reverts: a Completed dependent
stays Completed and keeps satisfying its own dependents, so it is not a conduit
and the cascade does not over-reach past it. `transition` now takes the graph lock
exactly when it reads the graph (entering `In Progress`/`Completed`, or when the
transition removes a satisfaction); archiving and ordinary edits do not. The
transition, its cascade and the recurring spawn share one transaction, so the
reopen/start write-skew is resolved rather than left to chance.

`GET /api/todos/:id/transition-impact?to=<status>` is the dry run the UI uses:
it returns `{ affected: [{ id, name, from, to }] }` for a reopening target and an
empty set otherwise, so the confirmation cannot disagree with the cascade.
`StatusControls` asks it before applying a transition and, when non-empty, lists
the affected TODOs with a Confirm/Cancel step instead of applying silently.

Verified: `pnpm lint`, `pnpm format:check`, `pnpm -r typecheck`, `pnpm -r build`,
`pnpm test` (132 tests across nine suites) — plus a `playwright-cli` walk of the
confirmation dialog and the resulting cascade, with zero console errors.

Review follow-ups applied: the rule is keyed on *leaving a Satisfied state*
(`completedAt` set), so un-archiving a completed dependency cascades too, closing
the invariant hole; the recursive walk now propagates only through dependents it
reverts, so a Completed dependent is no longer a conduit that over-cascades its
own started dependents; the graph lock is taken only when the transition actually
reads the graph (gate or cascade), not for every `Not Started` target; the two
live-row reads share one `liveRow` helper; `applyReopenCascade` returns nothing;
and the tests and vocabulary use "dependency" rather than the glossary's avoided
"prerequisite".

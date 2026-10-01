# 14: Completion-anchored recurrence spawn integrity

> **Partially superseded by [ADR 0007](../../../docs/adr/0007-two-recurrence-modes.md)
> (tickets 16 and 17).** The single completion-anchored *model* below is replaced by
> two explicit modes: `AFTER_COMPLETION` and `FIXED_SCHEDULE`. What this ticket
> delivered that still stands: the `spawned_at` spawn-once marker, null-`dueDate`
> support, the PATCH `RECURRENCE_ON_COMPLETED` guard, and the deleted-edge filter.
> The engine is re-cut in ticket 16.

**What to build:** Adopt [ADR 0006](../../../docs/adr/0006-completion-anchored-recurrence.md):
the next occurrence is computed from the completion date alone, ignoring the
occurrence's due date, and a recurring Occurrence spawns exactly one successor.
Reopening and re-completing must not fork the Series.

**Blocked by:** 07 (Recurrence engine), 08 (anchors and custom). Interacts with 13:
once deletion removes edges, the "deleted dependency" item below is only a
defensive filter.

**Status:** shipped

- [x] `nextOccurrence(rule, completionDate)` — the `dueDate` parameter is removed; the completion is the base
- [x] DAILY = completion + `interval` days; WEEKLY = first allowed weekday strictly after completion, weeks advanced `interval` from the completion's week; MONTHLY = `interval` months on from the completion's month with the anchor picking the day; nothing `<= completion`
- [x] MONTHLY always advances at least one month, so completing early never re-spawns the same anchor
- [x] A multi-weekday WEEKLY rule can produce several occurrences in a week, including when completed early
- [x] Completing a recurring Occurrence spawns **at most one** successor: reopen-then-re-complete, and `Completed → Archived → Completed`, do not fork the Series
- [x] `PATCH /api/todos/:id` cannot attach a `recurrence` to a Completed TODO — the edit-path twin of the create guard (08c)
- [x] A recurring TODO spawns even with no `dueDate`; the spawned Occurrence is given a concrete due date
- [x] `spawnNext` does not carry edges to Deleted targets forward (moot after 13; keep defensive)
- [x] Date-math suite re-anchored to completion (early / on-time / late at interval 1 and >1, monthly no-double-spawn, multi-weekday same week); HTTP suite for spawn-once, null-due-date spawn, and recurrence × archive/delete of the live Occurrence
- [x] Docs updated: ADR 0001 and 0006, decision log, `spec.md` story 29 and the next-occurrence section, `README.md`

## Comments

Two changes are bundled: the model switch (ADR 0006) and the spawn-once guard.

**Model switch.** Today `transition` guards on `recurrence && dueDate` and calls
`nextOccurrence(rule, occurrence.dueDate, completionDate)`; the engine anchors the
phase to `dueDate` and treats the completion as a floor. ADR 0006 removes `dueDate`
from the computation: the completion is the base, and the next date is the first the
rule generates **after** it, advanced by `interval` periods. The old engine already
had a completion floor, so this mainly re-anchors DAILY/WEEKLY/MONTHLY to the
completion date and adds the "advance at least one interval" rule that stops a
monthly anchor from re-spawning itself when completed early. `recurrence.test.ts` is
the written spec here and is rewritten; `completeOn` in the harness re-anchors too.

The consequence to state plainly in the docs: **the cadence drifts** with actual
completion times. "Every 3 days" means "3 days after I last finished", so a
chronically late completer slips. That is the point of the model.

**Spawn-once.** `transition` spawns whenever `recurrence && dueDate` with no
"already spawned" marker, so completing, reopening and completing again forks the
Series. `spec.md:152` promises "spawns only if never spawned for this Occurrence".
The `(series_id, due_date)` unique index (tickets 09/10) is not enough — a
re-complete computes a different next date. Guard with a marker on the occurrence
(e.g. a nullable `spawned_at`, or the successor id) set in the same transaction as
the spawn; that is a schema change and a migration.

**PATCH hole.** `update` mints a `seriesId` when a TODO first gains a rule
(`todos.service.ts:254-262`) without consulting Status, so a Completed one-off can be
turned into a recurring TODO that never spawned. Close it with a service-level check
(the rule may come from the existing row, so a schema refine is not enough).

**Deleted dependencies.** `spawnNext` copies edges filtered only by `seriesId`
(`todos.service.ts:401-410`). After ticket 13 removes edges on deletion this is a
defensive filter at most.

## Delivered

`nextOccurrence(rule, completionDate)` (ADR 0006): the completion is the base and
the due date no longer feeds the cadence. DAILY is completion + `interval` days;
WEEKLY advances `interval` weeks from the completion's week and takes the first
allowed weekday strictly after it; MONTHLY advances `interval` months from the
completion's month and the anchor picks the day, so a monthly rule always moves at
least one month and an early completion cannot re-spawn the same anchor. The unit
suite is rewritten around completion anchoring, including the no-double-spawn case
and an invariant that the next date is always strictly after the completion.

Spawn-once: `todos.spawned_at` (migration `0004`) is set in the same write as the
completion, and `spawnNext` runs only when it is null — so a reopen-and-recomplete,
or `Completed → Archived → Completed`, no longer forks the Series. A recurring TODO
with a null `dueDate` now spawns, anchored on its completion. `spawnNext` also skips
Deleted targets when copying edges. `update` rejects attaching a `recurrence` to a
Completed TODO with 422 `RECURRENCE_ON_COMPLETED`, the edit-path twin of the create
guard.

Docs updated: `spec.md` story 29 and the next-occurrence section, and
`README.md`.

Verified: `pnpm lint`, `pnpm format:check`, `pnpm -r typecheck`, `pnpm -r build`,
`pnpm test` (154 tests across nine suites) — plus a `playwright-cli` walk of
completing a recurring TODO and seeing the next occurrence, with zero console
errors.

Review follow-ups applied: the PATCH guard now keys on `completedAt` rather than
`status === 'COMPLETED'`, so an archived-after-completion TODO is covered too;
`RECURRENCE_ON_COMPLETED` was added to the documented error-code vocabulary; the
stale "row lock (`FOR UPDATE`) + `(seriesId, due date)` uniqueness guard" wording in
`spec.md` and the decision log was replaced with the actual optimistic-version +
`spawnedAt` mechanism; `anchorMonday` was renamed `weekStart` to avoid the glossary's
monthly-only "Anchor"; ADR 0006 names the `spawned_at` marker; and tests were added
for archiving/deleting a live recurring Occurrence and for the archived-completed
PATCH case.

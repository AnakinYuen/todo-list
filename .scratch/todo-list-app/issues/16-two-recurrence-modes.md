# 16: Two recurrence modes (after-completion and fixed-schedule)

**What to build:** Adopt [ADR 0007](../../../docs/adr/0007-two-recurrence-modes.md):
a recurrence rule declares whether it repeats *after completion* (a habit) or on a
*fixed schedule* (a calendar obligation), and the engine computes each correctly.
This replaces the single completion-anchored model from ticket 14.

**Blocked by:** 14 (keeps the `spawned_at` marker, null-`dueDate` support, and the
PATCH guard). Supersedes the model half of 14.

**Status:** shipped

- [x] `RecurrenceRule` is a discriminated union on `mode`: `AFTER_COMPLETION` (`interval`, `unit`) and `FIXED_SCHEDULE` (`frequency`, `interval`, `byWeekday?` / `monthlyAnchor?`)
- [x] `AFTER_COMPLETION`: next = completion + `interval` `unit`s (DAYS/WEEKS/MONTHS); no due date needed
- [x] `FIXED_SCHEDULE`: next = the first scheduled date on or after the completion **and** strictly after the occurrence's due date (ADR 0001's engine); late completion collapses forward, early completion holds the schedule, and no date is duplicated or moves backwards
- [x] A data migration defaults existing rules to `FIXED_SCHEDULE` (they carry calendar fields)
- [x] Spawned occurrences inherit the mode and rule; the spawn-once marker and PATCH guard still apply
- [x] Unit tests for both engines; HTTP tests for a habit completed early and late, a fixed schedule completed early and late, the duplicate regression (complete the same date early twice), and no-backlog
- [x] Docs: decision log, `spec.md` story 29 and the next-occurrence section, `README.md`

## Comments

The blend that caused the bug: ticket 14 made **all** recurrence completion-anchored,
but the rule shape still carried calendar anchors (`byWeekday`, `monthlyAnchor`).
Completing an occurrence before its own due date then computed the same upcoming
scheduled date as its successor — one `Weekly team sync` series grew three rows all
due `2026-10-05`. A single "floor at `max(completion, due)`" patch stops the
duplicate but makes a habit completed early schedule-anchored, so it does not fix
the model.

The fix is to separate the two mental models, as Things 3 / TickTick do:

- `AFTER_COMPLETION` is the habit engine: `completion + interval units`. No anchor,
  so no collision is possible, and the occurrence's due date is irrelevant.
- `FIXED_SCHEDULE` is ADR 0001's engine restored: the calendar sets the date, the
  completion only sets a floor so a late tick collapses forward instead of building
  a backlog. This is the engine that existed before ticket 14 — recover it from git
  history rather than rewriting.

An `AFTER_COMPLETION` date is a projection of the completion, so completing an
occurrence on the same day as its predecessor can re-derive a date the series
already has. `spawnNext` therefore advances an after-completion date past any due
date the series already holds, before inserting. A `(series_id, due_date)` unique
index (owned by ticket 10, not yet built) would be defence-in-depth on top of that.

## Delivered

`RecurrenceRule` is a discriminated union on `mode`: `AFTER_COMPLETION`
(`interval`, `unit`) and `FIXED_SCHEDULE` (`schedule`, the RFC 5545 subset).
`nextOccurrence(rule, completionDate, dueDate)` dispatches: after-completion counts
from the completion (months clamp to the target month's length) and ignores the due
date; fixed-schedule runs the restored ADR 0001 engine over `rule.schedule`, so a
late completion collapses forward and an early one holds the schedule without
duplicating the due date.

`0005_recurrence_modes` wraps existing rules as `FIXED_SCHEDULE` (idempotent), and
the seed uses the new shape. Spawn-once (`spawnedAt`), the PATCH guard and the
deleted-edge filter are unchanged; a recurring TODO with no due date still spawns,
fixed-schedule falling back to the completion as its anchor.

Review follow-up: `spawnNext` now advances an `AFTER_COMPLETION` date past any due
date already in the series, so completing an occurrence on the same day as its
predecessor cannot re-derive the same date.

The date-math suite covers both engines, including the early-completion duplicate
regression and month clamping.

Verified: `pnpm lint`, `pnpm format:check`, `pnpm -r typecheck`, `pnpm -r build`,
`pnpm test` (166 tests across nine suites) — plus a `playwright-cli` walk creating a
habit and a fixed schedule and completing each.

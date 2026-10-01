# Two recurrence modes: after-completion and fixed-schedule

**Status:** accepted

> **Supersedes [ADR 0006](0006-completion-anchored-recurrence.md).** It reinstates
> ADR 0001's next-date rule as the `FIXED_SCHEDULE` mode.

## Context

ADR 0006 made *all* recurrence completion-anchored. That applied a completion
trigger to rules that carry calendar anchors (`byWeekday`, `monthlyAnchor`) — which
are fixed-schedule concepts. The result was a blend, and it broke: completing an
occurrence *before* its own due date computed the same upcoming scheduled date as
its successor, so a single `Weekly team sync` series grew three rows all due
`2026-10-05`. The anchor is not the problem; blending a completion trigger with a
calendar anchor is.

Users have two genuinely different needs:

- **Flexible habits** — "water the plants every 3 days", "cut my hair every 3
  weeks": the next date is relative to when I actually finish.
- **Fixed obligations** — "team sync every Monday", "rent on the 1st": the date is
  set by the calendar, and when I tick it off is irrelevant.

No single rule expresses both without ambiguity.

## Decision

A recurrence rule declares its mode explicitly.

- **`AFTER_COMPLETION`** — `{ interval, unit }`, `unit ∈ DAYS | WEEKS | MONTHS`.
  The next date is `completion + interval units`. No calendar anchor, and the
  occurrence needs no due date. The habit model.
- **`FIXED_SCHEDULE`** — the existing calendar rule (`frequency`, `interval`,
  optional `byWeekday` / `monthlyAnchor`). The next date is the first scheduled
  date that is **on or after the completion** and **strictly after the occurrence's
  due date** (ADR 0001's engine). The schedule never shifts: a late completion
  collapses forward to the next scheduled date (no backlog), an early completion
  holds the schedule, and no date is ever duplicated or moves backwards. The
  obligation model.

Both modes keep the rest of ticket 14: only completion spawns, a `spawned_at`
marker makes it spawn at most once per occurrence, and a completed TODO's rule is
immutable — it can neither gain, change nor remove one (an unchanged echo on save
is accepted). Existing rules carry calendar fields and migrate to `FIXED_SCHEDULE`,
preserving their meaning.

## Considered Options

- **Single schedule-anchored mode (ADR 0001).** Rejected: cannot express habits, and
  early completion is ignored.
- **Single completion-anchored mode (ADR 0006).** Rejected: duplicates as above.
- **Single "floor at `max(completion, due)`" mode.** Rejected: stops the duplicate
  but forces schedule anchoring on early completion, so a habit completed early is
  held to its old due date — it stops being "after completion" precisely when the
  user gets ahead. It is one model pretending to be two.
- **Explicit per-rule mode (chosen).** Matches Things 3 / TickTick; each rule has a
  single, unambiguous meaning, and the choice is the user's.

## Consequences

- `RecurrenceRule` becomes a discriminated union on `mode`; the shared Zod schema,
  the engine and the editor change.
- Two pure engine paths, each simple: the `AFTER_COMPLETION` interval engine and the
  restored ADR 0001 engine for `FIXED_SCHEDULE`.
- A data migration defaults existing rules to `FIXED_SCHEDULE`.
- The date-math suite and the HTTP spawn suite cover both modes; `completeOn` still
  pins the completion time.
- The `(series_id, due_date)` unique index (built in ticket 09) is defence-in-depth
  rather than the deduplication mechanism.
- The UI exposes the choice; whether a due date is present no longer implies the
  mode.

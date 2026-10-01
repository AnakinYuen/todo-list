# Recurrence is completion-anchored

**Status:** superseded by [ADR 0007](0007-two-recurrence-modes.md)

> **Superseded by [ADR 0007](0007-two-recurrence-modes.md).** Completion anchoring
> is one of two modes, not the whole model. This ADR also **superseded ADR 0001's
> next-date clause**, which ADR 0007 reinstates as the `FIXED_SCHEDULE` mode. Kept
> for the record.

## Context

ADR 0001 anchored the next occurrence's phase to the occurrence's own due date,
with the completion date as a floor: "the first date the rule generates that is on
or after the completion date, and strictly after the occurrence's due date". That
is **schedule-anchored** recurrence — the cadence belongs to the calendar, so
completing early is ignored and completing late collapses forward to the floor.

The alternative is **completion-anchored** recurrence (Todoist's `every!`): the
completion date is the base and the occurrence's due date does not influence
spacing at all. Both satisfy the brief, which only asks that completing a recurring
TODO creates the next one from its schedule. The two models differ in feel, not in
correctness:

| situation | schedule-anchored | completion-anchored |
| --- | --- | --- |
| daily, due 01-10, done 01-05 | 01-11 | 01-06 |
| weekly Mon/Wed, due Wed, done Mon | next Mon | Wed (same week) |
| daily, due 01-10, done 01-15 | 01-15 | 01-16 |
| every 3 days, due 01-10, done 01-05 | 01-13 | 01-08 |

We choose completion-anchored: a routine repeats relative to when the work was
actually finished, which matches the "do it again N after I last did it" mental
model for chores and maintenance. The cost is intentional drift (a chronically late
completer slips), which is the trade we accept.

## Decision

The next occurrence is generated from the **completion date alone**:
`nextOccurrence(rule, completionDate)`. The occurrence's `dueDate` is no longer an
input to the cadence.

The precise rule: the completion date is the base; the next date is the first the
rule generates in the **period after the completion**, advanced by `interval`
periods, and never `<= completionDate`.

- **DAILY** — completion + `interval` days.
- **WEEKLY** — advance `interval` weeks from the completion's week, then take the
  first allowed weekday strictly after the completion. A multi-weekday rule can
  therefore still yield several occurrences in one week.
- **MONTHLY** — advance `interval` months from the completion's month, then the
  anchor picks the day (`DayOfMonth` still skips short months; `LastDay`,
  `NthWeekday`, `LastWeekday` unchanged). Always advancing at least one month means
  completing early can never re-spawn the same anchor.

`dueDate` becomes a descriptor of when the current occurrence is planned, not an
input to the cadence. It may be null; a spawned occurrence always gets a concrete
due date, so the series shows a date from the first hop and the existing
sort/filter behaviour is unchanged.

Only completion spawns the next occurrence; archive and delete of the live
occurrence still suspend the series. A Completion spawns at most once per
occurrence: a `spawned_at` marker is written in the same update as the completion,
so a reopen-then-recomplete (or archive-then-recomplete) finds it set and does not
fork the series.

## Considered Options

- **Keep schedule-anchored (ADR 0001).** Rejected: early completion was ignored
  while late completion collapsed forward, an inconsistency; and for routine work
  the calendar anchor is the wrong mental model.
- **Offer both per rule (Todoist's `every` and `every!`).** Rejected for v1: it
  doubles the UI and the vocabulary. Deferred — the rule shape has room for an
  `anchor: schedule | completion` field if the need appears.
- **Anchor on the completion but keep the due date as a guard against
  double-spawn.** Rejected as unnecessary: "advance at least one interval from the
  completion" already prevents the same anchor recurring, without reading the due
  date.

## Consequences

- Drift is intentional and must be documented: "every 3 days" means "3 days after I
  last finished", so late completion moves the whole schedule.
- Completing early no longer preserves an original calendar date; that is the point
  of the model.
- The "several occurrences in a week" property now holds even when completing
  early, unlike ADR 0001's engine.
- `nextOccurrence` drops its `dueDate` parameter; the exhaustive date-math suite and
  the `completeOn` test helper re-anchor to the completion date.
- A recurring TODO needs no due date to advance, which removes the "recurrence
  without a due date silently never spawns" edge case.

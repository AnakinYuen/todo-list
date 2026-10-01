# Recurrence: instance-based, materialize-next-on-complete

> **Clarified by [ADR 0007](0007-two-recurrence-modes.md):** the next-date rule
> below ("first date the rule generates on or after the completion date") is exactly
> the `FIXED_SCHEDULE` mode. ADR 0006 briefly replaced it with a single
> completion-anchored model; ADR 0007 supersedes 0006 and restores this rule as one
> of two modes. The instance-based model, the rule shape and the monthly anchors all
> stand.

## Context

The brief requires recurring TODOs and per-TODO dependencies, but leaves the
recurrence model open. We considered a rule-based (virtual occurrences) model, a
series-entity (template + occurrences) model, and adopting a full RFC 5545 engine
before choosing. The recurrence vocabulary follows Google Calendar, which is a
bounded subset of RFC 5545.

## Decision

Each occurrence of a recurring TODO is an ordinary TODO row. The occurrence rule
lives on the current occurrence. On completion the server clones the row — name,
description, priority, rule, and dependency edges to TODOs *outside* the series —
into the next occurrence, with status Not Started. The next due date is the next
date the rule generates on or after the completion date; it is *not* "occurrence
date + one interval", because a rule can match several dates in a week.

The rule is the subset of RFC 5545 that Google Calendar exposes:

- `frequency`: DAILY | WEEKLY | MONTHLY
- `interval`: integer ≥ 1 ("repeat every N")
- `byWeekday`: a weekday set — WEEKLY only
- `monthlyAnchor`: DayOfMonth(1–31) | LastDayOfMonth | NthWeekday(1–4) |
  LastWeekday — MONTHLY only

Anchors use RFC semantics: `DayOfMonth` **skips** months that lack that day (it
does not clamp); `LastDayOfMonth` is `BYMONTHDAY=-1`; `NthWeekday` is
`BYDAY=wd;BYSETPOS=n`; `LastWeekday` is `BYDAY=wd;BYSETPOS=-1`; the week starts
Monday. There is no yearly frequency and no end condition — a series ends when
the currently-open occurrence is completed after its rule has been removed.

Only *completing* an occurrence spawns the next one. Archiving the live
(uncompleted) occurrence suspends the series — no spawn — and un-archiving
restores it. Deleting the live occurrence ends the series permanently (ADR 0005:
deletion is permanent), since the deleted rule can never spawn again; archiving or
deleting an already-spawned past occurrence has no effect on the chain.

Occurrences of one series share a nullable series id; there is no series entity.

## Considered Options

- **Rule-based / virtual occurrences.** Rejected: the brief makes each blockable
  unit a real TODO, so a virtual occurrence has no row for a dependency edge.
- **Series entity (template + occurrence rows).** Deferred: more machinery, and
  neither schedule-wide editing nor series reporting is required yet. The shared
  series id is the migration seam.
- **Full RFC 5545 via the `rrule` library, or storing RRULE strings.** Rejected:
  the rule is a bounded subset, and the library is `Date`-based while our model is
  calendar-date-only, which would reintroduce the timezone handling we designed
  out. Revisit if yearly, end conditions or exclusions ever appear.
- **Clamping `DayOfMonth` in short months (Outlook).** Rejected in favour of the
  RFC/Google skip behaviour; "last day of month" is a separate anchor.

## Consequences

- Status and dependencies are independent per occurrence.
- Only the next occurrence exists — no future projection — and editing a rule
  affects only the current occurrence. A week may contain several occurrences.
- Only completion advances a series; archiving the live occurrence suspends it
  (recoverable by un-archiving), deleting it ends the series (ADR 0005), and
  either disposition of a past occurrence is inert.
- Due dates are calendar dates (`DATE`), so no timezone maths is involved.
- The rule maps 1:1 onto RFC 5545 parts, so it can be verified with an exhaustive,
  table-driven test suite without an external oracle (see the decision log).
- The series id is a grouping tag, not an entity; moving to a series entity later
  is a backfill, not a rewrite.

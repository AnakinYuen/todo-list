# 07: Recurrence engine — daily, weekly (one weekday), monthly (day of month)

**What to build:** A person can give a TODO a Recurrence rule, and completing it
creates the next Occurrence automatically. The next due date is the first date the
rule generates on or after the completion date, so finishing late does not build
up a backlog. Each Occurrence is a real, independent TODO that shares a series id
with the others.

**Blocked by:** 00 (Coding standards, Prettier and ESLint), 03 (Status lifecycle)

**Status:** shipped

- [x] A Recurrence rule (frequency, interval) can be set and is validated
- [x] Completing a recurring Occurrence creates the next Occurrence as Not Started, carrying the name, description, Priority and rule
- [x] The next due date is the first rule date on or after the completion date
- [x] Occurrences of one rule share a series id; only completing spawns the next
- [x] Exhaustive, table-driven date-math tests for daily, weekly (one weekday) and monthly day-of-month
- [x] The web UI has a Recurrence editor

## Comments

The rule is the bounded RFC 5545 subset from ADR 0001, stored as a `jsonb`
column: `{ frequency, interval, byWeekday?, monthlyAnchor? }` (a Zod
discriminated union in `packages/shared`). `todos` gained `recurrence` and
`series_id` (migration `0002`); creating a recurring TODO mints a `seriesId`.

The date math lives in a pure module (`nextOccurrence(rule, dueDate,
completionDate)`) with its own exhaustive unit tests — the second agreed test
seam. It is computed from the occurrence's own due date so a monthly anchor is
preserved, and lands on the first rule date on or after the completion date.

Completing a recurring Occurrence runs inside the transition transaction: it
clones the row (name, description, Priority, rule, same `seriesId`, Status Not
Started) and copies dependency edges whose target is **outside** the series.
Because the clone happens in the same transaction as the status write, a
same-version repeat is a no-op and spawns once. `CreateTodoInput`/`UpdateTodoInput`
accept `recurrence`, so setting or clearing it is an ordinary edit; clearing it
ends the series. The web UI gained a Recurrence editor (frequency, interval,
weekday set, monthly anchor) on create and edit, and the list shows "repeats".

Verified: `pnpm lint`, `pnpm format:check`, `pnpm -r typecheck`, `pnpm -r build`,
`pnpm test` (95 tests across eight suites; 9 pure date-math + 9 HTTP) — plus a
`playwright-cli` walk creating a daily TODO, completing it, and seeing the next
Occurrence spawn with the same series id, with zero console errors.

Review follow-ups applied: the weekly interval math used `Math.round` on the week
distance, which phase-shifted multi-week rules starting mid-week — now
`Math.floor` from the occurrence's own Monday; the spawn now passes the
**updated** row so it anchors on the completion that just happened, not a stale
one; adding a rule to an existing TODO now mints a `seriesId` so its occurrences
share one; the web create form sends a due date with a rule (a rule needs an
anchor); a dead, never-enforced uniqueness constraint name was removed; and the
date-math suite was extended across all four monthly anchors, leap/February,
the year boundary, multiple weekdays, week-boundary wrap-around, and the
multi-week phase case.

# 08: Recurrence anchors and custom interval

**What to build:** A person can express the monthly rules people actually mean —
the last day of the month, the nth weekday, or the last weekday — plus weekly
rules on several weekdays at once, and an arbitrary every-N-days/weeks/months
cadence. Following Google Calendar / RFC 5545, a day-of-month rule skips months
that lack that day rather than clamping.

**Blocked by:** 00 (Coding standards, Prettier and ESLint), 07 (Recurrence engine)

**Status:** shipped

- [x] Monthly anchors: last day of month, nth weekday (first–fourth) and last weekday
- [x] A day-of-month rule skips short months instead of clamping
- [x] Weekly rules accept multiple weekdays, including the wrap-around case
- [x] Every-N days / weeks / months works
- [x] Exhaustive date-math tests cover month lengths, leap years and the year boundary
- [x] The web UI picker exposes the anchors and the interval

## Comments

Delivered with ticket 07: the rule union in `packages/shared` carries all four
monthly anchors, a weekday set, and an every-N interval, and the UI picker
exposes them. The engine already computed these, so this ticket was chiefly
proving them: the date-math suite covers all four anchors, leap/February, the
year boundary, multiple weekdays, week-boundary wrap-around, and multi-week
phase; and the HTTP suite now spawns a next Occurrence for each anchor and
cadence (last day, nth weekday, last weekday, day-31 skip, multi-weekday,
every-N days).

Verified: `pnpm lint`, `pnpm format:check`, `pnpm -r typecheck`, `pnpm -r build`,
`pnpm test` (109 tests across eight suites).

Review follow-ups applied: the HTTP spawn tests no longer depend on wall-clock
time (they pin `completedAt` to the occurrence's due date, since that is what the
next due date anchors to), so they will not rot once real time passes the
fixtures; and the date-math suite was extended to every-N-months, nth-weekday
1–4, last-day/last-weekday across the year boundary and a leap February, and a
30-day-month skip. The engine itself was unchanged.

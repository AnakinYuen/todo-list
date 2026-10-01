# 18: Surface backend rejections and recurrence outcomes in the UI

**What to build:** The UI stops hiding what the backend decided. A rejected action
shows the reason the API already sent, and completing a recurring TODO shows the
date it will schedule next — including when the dedup guard skips ahead.

**Blocked by:** 16 (recurrence modes and the dedup guard), 09 (the error codes).

**Status:** shipped

- [x] `ApiError` carries the response `code`, `message` and body instead of discarding them
- [x] `describeError` explains `CONFLICT`, `BLOCKED_BY_DEPENDENCIES` (naming the blockers), `CYCLE_DETECTED`, `RECURRENCE_ON_COMPLETED`, `VALIDATION` (first issue) and `NOT_FOUND`
- [x] `GET /api/todos/:id/next-occurrence-preview?from=<date>` returns the next due date a completion would schedule, and whether it skips past a date the series already holds
- [x] `StatusControls` shows that date before completing a recurring TODO, and flags a skip-ahead
- [x] Tests cover the preview endpoint (habit, fixed, one-off, skip-ahead, 404) and the UI is walked with `playwright-cli`

## Comments

Two symptoms, one root cause each.

**Opaque 4xx.** `apps/web/src/api.ts` builds `new ApiError(status, \`Request failed
(${status})\`)` and throws the JSON body away; `describeError` only special-cases
409. Every structured rejection the API sends (`BLOCKED_BY_DEPENDENCIES`,
`CYCLE_DETECTED`, `RECURRENCE_ON_COMPLETED`, `VALIDATION`, `NOT_FOUND`) collapses to
"Request failed (4xx)". Fix the transport to keep `{ code, message, ... }` and map
the codes to sentences, naming blockers for `BLOCKED_BY_DEPENDENCIES` and the first
issue for `VALIDATION`.

**Invisible recurrence outcome.** Completing a recurring TODO writes a new due date
that depends on the completion date and, for the dedup guard, on what the series
already holds. The user only sees it afterwards. Add a read-only preview endpoint
that runs the same `nextOccurrence` + dedup path as `spawnNext`, and show its date
in the status controls before applying. Because it shares the rule, the hint cannot
disagree with the write. `from` defaults to today and exists so tests are not
wall-clock dependent.

Out of scope: a full "series timeline" view; this is a one-line hint, not a
rewrite of the list.

## Delivered

`ApiError` now carries `status`, `code`, `message` and the parsed body; `request`
reads the JSON error response instead of discarding it. `describeError` maps
`CONFLICT`, `BLOCKED_BY_DEPENDENCIES` (naming the blockers from `blockedBy`),
`CYCLE_DETECTED`, `RECURRENCE_ON_COMPLETED`, `VALIDATION` (first `issues[].message`)
and `NOT_FOUND` to sentences. All four call sites already render via
`describeError`, so the reason now shows up.

`GET /api/todos/:id/next-occurrence-preview?from=<date>` returns
`{ nextDueDate, skipsAhead }`, computed by the same `nextOccurrence` + dedup path
as `spawnNext`; `from` defaults to today and exists so tests are deterministic.
`StatusControls` shows the date before completing a recurring TODO and flags a
skip-ahead.

Verified: `pnpm lint`, `pnpm format:check`, `pnpm -r typecheck`, `pnpm -r build`,
`pnpm test` (172 tests across nine suites) — plus a `playwright-cli` walk showing
"Blocked by unfinished dependencies: Get design approval." on a rejected start and
"Completing now schedules the next occurrence for 2027-01-11." before completing the
weekly sync.

Review follow-up: the preview now honours the spawn-once guard — an occurrence that
already spawned (or a non-recurring one) previews `null`, so the hint can no longer
promise a successor the write won't create. The skip-ahead test was rebuilt around a
freshly spawned occurrence, and the hint is suppressed for a Blocked TODO.

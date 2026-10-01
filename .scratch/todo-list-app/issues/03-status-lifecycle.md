# 03: Status lifecycle

**What to build:** A person can move a TODO through its lifecycle — start it,
complete it, revert a mistaken start, reopen a completed TODO, Archive it and
un-archive it — and only the valid transitions are accepted. Dependency gating is
not yet active (dependencies arrive in ticket 06).

**Blocked by:** 00 (Coding standards, Prettier and ESLint), 02 (TODO detail and edit)

**Status:** shipped

- [x] Transitions permitted by the state machine are accepted; invalid or unknown targets are rejected
- [x] Reopening a Completed TODO clears its completion time
- [x] Archiving and un-archiving work
- [x] Requesting the current Status again is a no-op; a missing or Deleted TODO is a 404
- [x] The web UI exposes the transitions
- [x] Integration tests cover the transition matrix (including the now-invalid cases)

## Comments

Added `POST /api/todos/:id/transitions` (`{ status, version }`, `200 OK`), which
applies the lifecycle state machine. The transition graph is complete — every
Status is reachable from every other (Archive is reversible, Completed can be
reopened) — so the only rejected target is an unknown Status value, which the
Zod pipe returns as `400 { code: 'VALIDATION' }`. (The spec's earlier "422 for an
unknown target" is realised as a 400 validation error, consistent with the other
input validation; spec and decision log now say 400.)

Completion semantics: entering Completed records `completedAt`; archiving a
completed TODO **preserves** it (archiving is orthogonal to outcome, ADR 0002);
reopening to Not Started or In Progress clears it. A same-Status request is a
no-op that returns the current row unchanged. Optimistic concurrency applies
(stale `version` → 409 `CONFLICT`). The web UI shows the available transitions for
the selected TODO.

Verified: `pnpm lint`, `pnpm format:check`, `pnpm -r typecheck`, `pnpm -r build`,
`pnpm test` (39 tests across three suites, including the 16-case matrix), plus a
smoke run of the built server against the devcontainer `db` confirming
complete → archive (completion kept) → reopen (completion cleared) → no-op →
unknown-status → stale → 404.

Review follow-ups applied: the web UI now exposes **every** transition (a target
Status selector) instead of a hand-written subset, removing the duplicated state
machine from the UI; `create` records `completedAt` when a TODO is created
directly as Completed; the guarded-update logic is shared between edit and
transition, so a raced conflict reports the database's actual `currentVersion`
rather than the caller's stale one; and tests cover the Deleted-404 and the
Completed → In Progress reopen path.

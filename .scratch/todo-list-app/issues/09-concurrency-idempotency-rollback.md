# 09: Concurrency, idempotency and rollback hardening

**What to build:** Several people can use the shared list at once and nothing
corrupts. Two people completing the same recurring Occurrence at the same moment
produce exactly one next Occurrence; two people adding edges that would combine
into a cycle are prevented; a repeated action is harmless; and a failure part-way
through leaves no half-done state.

**Blocked by:** 00 (Coding standards, Prettier and ESLint), 06 (Dependencies), 07 (Recurrence engine), 08b (Reopen cascade)

**Status:** shipped

- [x] Complete-and-spawn runs in one transaction under the optimistic version guard (no separate row lock — see Comments); simultaneous completes create exactly one next Occurrence, backed by a uniqueness guard on series id and due date
- [x] Concurrent cycle-forming edge creation is rejected via the advisory lock (the write-skew race)
- [x] Repeating a complete at the occurrence's *current* version is a no-op and spawns once (an old version is a 409); repeating a delete is safe
- [x] If spawning the next Occurrence fails, the completion rolls back (and vice versa)
- [x] The optimistic conflict (409) is confirmed across all edit paths
- [x] Race, idempotency and rollback tests run at the HTTP seam with parallel requests

## Comments

Most of this was already true by the time the ticket was reached; this ticket
pinned it down and added the one missing piece.

**No `SELECT ... FOR UPDATE`.** An earlier plan called for a row lock on the
complete-and-spawn write. The optimistic version guard already does the job more
simply: two completes of the same occurrence both read version V, only one
`UPDATE ... WHERE version = V` writes, and the loser gets 409 before spawning. A
row lock would be a second mechanism for the same guarantee.

**Spawn uniqueness.** `todos_series_due_date_key` is a partial unique index on
`(series_id, due_date) WHERE series_id IS NOT NULL AND deleted_at IS NULL`
(migration `0007`). The predicate matches the dedup guard's "live occurrence"
notion, so a Deleted occurrence frees its date; `NULL` series rows (one-offs) are
excluded. It sits on top of the version guard and the after-completion dedup guard.

**Conflicts are structured.** A unique violation surfaces as `409
DUPLICATE_OCCURRENCE` through a small exception filter rather than a raw 500, so an
edit that moves an occurrence onto a sibling's date is reported, not crashed.

**Concurrent cycles.** `addDependency` already serialises on the graph-wide
advisory lock; two simultaneous edges that would combine into a cycle resolve to
one 200 and one `422 CYCLE_DETECTED`.

**Parallel and rollback tests.** `todos-concurrency.e2e.test.ts` fires real
parallel requests: double-complete (one 200, one 409, one successor), double delete
(one 204, one 404), double cycle-forming edge (one edge survives), plus the forced
spawn conflict (409, and the completion rolls back), the edit collision, and the
index's live-only and one-off behaviour.

Verified: `pnpm lint`, `pnpm format:check`, `pnpm -r typecheck`, `pnpm -r build`,
`pnpm test` (180 tests across ten suites).

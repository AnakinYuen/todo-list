# 13: Deletion is permanent and removes dependency edges

**What to build:** Adopt [ADR 0005](../../../docs/adr/0005-deletion-is-permanent.md).
`DELETE` removes a TODO from the user's world permanently — the row is kept only
as an audit tombstone — and removes its Dependency edges so its dependents unblock.
Remove restore and the Deleted view, and warn in the UI before the irreversible
delete.

**Blocked by:** none — supersedes the restore half of 04 and builds on 08b (impact
preview + graph lock) and 08c (invariant entry guards).

**Status:** shipped

- [x] `DELETE /api/todos/:id` runs in one graph-locked transaction: set `deletedAt`, bump `version`, and delete every edge where the TODO is `dependent` or `dependency`; still 204, still 404 for unknown/already-Deleted
- [x] Deleting a Dependency unblocks its dependents (the edge is gone, so it is not in `blockedBy`); deleting a dependent also removes its outgoing edges
- [x] `Satisfied(dependency) = completed_at IS NOT NULL`; the `deleted_at IS NULL` clause stays only as defence against legacy rows / direct writes
- [x] A migration deletes existing edges that point at already-Deleted TODOs, before the predicate is simplified
- [x] `includeDeleted` remains as an audit-only read (no UI); no code path restores
- [x] Remove `POST /api/todos/:id/restore` and the Deleted view / restore action from the web UI
- [x] Deleting a Dependency computes a server-side impact preview of the dependents that will unblock, and the UI lists them (mirror of ADR 0004's `transition-impact`)
- [x] The web delete flow requires confirmation and states the deletion cannot be undone
- [x] Tests cover: delete removes edges and unblocks dependents; delete removes outgoing edges; `Satisfied` no longer depends on deletion; restore is gone (404); the impact preview matches what the delete does
- [x] Docs updated: decision log, `spec.md` (user stories 40/43 and the soft-delete section), `README.md`; drop the 08b/08c "delete is an exception" boundary notes

## Comments

ADR 0005. The current model — recoverable soft delete plus "deleted never
satisfies" — leaves a reachable `In Progress` + `Blocked` state when a completed
prerequisite is deleted, and pays the whole soft-delete tax for an undo we do not
want. Deleting the edges removes that boundary: `In Progress ⇒ unblocked` then
holds for transitions, edits **and** deletion, so ADR 0004 no longer needs the
delete caveat.

Retention stays: the row is kept for audit (`deletedAt`, `includeDeleted` read),
but restore is not a product capability — that is the brief's "data must not be
permanently lost" read as audit retention rather than recovery.

**UI (explicit):** deletion is irreversible, so the delete action must confirm
first and say plainly that it cannot be undone. When the TODO is a dependency of
others, that same prompt lists the dependents that will unblock. This is the
delete-side counterpart to the reopen cascade's confirmation.

## Delivered

`softDelete` now runs in one graph-locked transaction: it marks `deletedAt`, bumps
`version`, then deletes every edge touching the TODO in either direction. `restore`
and the `POST /:id/restore` route are gone; `includeDeleted` stays as the audit
read. `Satisfied` keeps its `deletedAt` clause as defence, but no live edge can now
point at a Deleted row.

`GET /api/todos/:id/delete-impact` returns `{ unblocked: [TodoRef] }` — the live
dependents whose last unmet Dependency is this TODO — computed by the same rule the
delete performs. The web UI's Delete button asks for that impact and shows a
confirmation that says the delete cannot be undone and lists the TODOs that will
unblock; there is no Deleted view any more.

A `0003_remove_edges_to_deleted` migration deletes any legacy edges that pointed at
already-Deleted TODOs.

Docs updated: decision log, `spec.md` (stories 43/44/60/64, API and soft-delete
sections), `README.md`, and the 08c boundary note.

Verified: `pnpm lint`, `pnpm format:check`, `pnpm -r typecheck`, `pnpm -r build`,
`pnpm test` (144 tests across nine suites) — plus a `playwright-cli` walk of the
delete confirmation and the resulting unblock, with zero console errors.

Review follow-ups applied: the migration is generated with
`drizzle-kit generate --custom` so it carries a `0003_snapshot.json` (the hand-added
journal entry alone would have collided with the next `generate`); `deleteImpact`
returns through `DeleteImpact.parse` rather than a hand-built shape; the service
method is renamed `delete` to match ADR 0005's vocabulary; the impact spec gained
tests for the already-satisfied Dependency and for preview-equals-delete; and the
stale `Satisfied` snippet in `spec.md`, ADR 0002's recovery wording and the
decision log's "filter" phrasing were corrected.

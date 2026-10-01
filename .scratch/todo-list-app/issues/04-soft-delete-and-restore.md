# 04: Soft delete, Deleted view and restore

> **Superseded by [ADR 0005](../../../docs/adr/0005-deletion-is-permanent.md):**
> restore and the Deleted view are removed. Deletion is permanent to the user; the
> row is retained for audit only. The `deletedAt` mechanics below remain, but the
> restore/Deleted-view half is no longer the design.

**What to build:** A person can delete a TODO and have it disappear from the
list, but nothing is permanently lost: a Deleted view shows removed TODOs and a
restore returns one to the active list.

**Blocked by:** 02 (TODO detail and edit)

**Status:** shipped

- [x] Deleting a TODO hides it from normal reads
- [x] An `includeDeleted` read returns Deleted TODOs
- [x] Restoring a Deleted TODO returns it to the active list
- [x] The web UI has a Deleted view with a restore action
- [x] Integration tests cover: delete hides, includeDeleted shows, restore reinstates

## Comments

`DELETE /api/todos/:id` soft-deletes (`deletedAt`, version bump) and returns 204;
re-deleting or deleting an unknown TODO is 404. `POST /api/todos/:id/restore`
clears `deletedAt` (200); restoring an active TODO is a no-op. List and get accept
`includeDeleted=true`. The web UI gained a "Show Deleted" view listing Deleted
TODOs with a Restore action, and a Delete action on the open TODO.

Note: query validation uses a named `@Query('includeDeleted')` param with
`@ApiQuery`, because a Zod-typed `@Query()` DTO crashes the Swagger explorer
(it tries to introspect a model type that TypeScript erases).

Verified: `pnpm lint`, `pnpm format:check`, `pnpm -r typecheck`, `pnpm -r build`,
`pnpm test` (49 tests across four suites, 7 new) — plus a `playwright-cli` walk
through create → delete → Deleted view → restore with screenshots and zero
console errors.

Review follow-ups applied: the Swagger query enum derives from the shared
`IncludeDeleted` schema rather than re-listing the values; the visibility filter
is one `visible(includeDeleted)` predicate shared by list and get; `restore` is a
single guarded UPDATE (`WHERE deletedAt IS NOT NULL`) rather than a read-then-
write; a Deleted TODO is asserted to reject edits and transitions (404); and the
`includeDeleted` test now asserts active TODOs remain and the version bumped.

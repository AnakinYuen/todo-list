# Deletion is permanent: audit-retained, and removes dependency edges

**Status:** accepted

## Context

The brief requires that "Data should not be permanently lost when a TODO is
deleted" (`code-challenge.md`). ADR 0002 and ticket 04 read that as *recoverable*
deletion: the row is retained, a Deleted view exposes it, and restore returns it.
Two consequences followed that this decision rejects:

- A deleted Dependency never satisfies, so dependents stay Blocked until someone
  removes the edge or restores and re-completes the target. Deleting a *completed*
  prerequisite therefore revokes satisfaction and leaves an In Progress dependent
  Blocked — a reachable state that ADR 0004's invariant calls impossible.
- The product pays the full soft-delete tax (a `deletedAt` filter on every read, a
  Deleted view, restore, tests) to offer an undo we do not want as the point of
  deletion.

This ADR reinterprets the retention requirement as **audit retention, not
recovery**, and makes deletion a genuine removal with respect to the dependency
graph.

## Decision

- **Deletion is permanent to the user.** `DELETE` marks `deletedAt`; the row is
  never purged. There is no restore endpoint and no Deleted view. `includeDeleted`
  stays as an audit-only read (no UI) so the retained rows remain inspectable.
- **Deleting a TODO removes its Dependency edges.** In one transaction under the
  graph lock, every edge with the TODO as `dependent` or `dependency` is deleted.
  A deleted TODO is never a dangling edge and never appears in `blockedBy`. It is
  not a prerequisite that failed — it is a requirement that no longer exists — so
  its dependents *unblock*.
- **`Satisfied` no longer consults deletion.** With no edge pointing at a deleted
  TODO, `Satisfied(dependency) = dependency.completedAt != null`. The
  `deletedAt IS NULL` clause is kept only as defence against legacy rows and direct
  DB writes.
- **Archive is unchanged.** Archiving a completed TODO keeps it satisfied;
  archiving an unfinished one does not. Archive is a disposition; deletion is a
  removal.
- **Deletion is a graph write with fan-out.** It takes the graph lock, and the UI
  confirms the dependents whose last unmet Dependency is the one being deleted —
  the mirror of ADR 0004's reopen impact.

## Considered Options

- **Keep recoverable soft delete (ADR 0002 / ticket 04).** Rejected: recovery is
  not the goal; it leaves a reachable `In Progress + Blocked` state and makes
  deletion silently *increase* blocking.
- **Hard delete.** Rejected: the brief still asks that data not be permanently
  lost, so the tombstone stays. Both FKs already cascade on a real delete, so edge
  removal would be identical either way.
- **Mark edges removed but keep them (edge audit).** Rejected: the audit subject is
  the TODO, not its edges; retaining dead edges complicates every read for no gain.
- **Keep dependents Blocked but allow restore.** Rejected: that is the current
  model, and the reason this ADR exists.

## Consequences

- ADR 0002's "deleted never satisfies" and "dependents stay blocked" are
  superseded; its Archive clauses stand.
- ADR 0004's stated boundary disappears: deleting never leaves an In Progress
  dependent Blocked, so `In Progress ⇒ unblocked` now holds for transitions, edits
  *and* deletion. The 08b/08c boundary notes are dropped.
- Removed: `POST /api/todos/:id/restore`, the Deleted view, and the restore tests.
  `includeDeleted` remains for audit.
- Existing rows may carry edges to Deleted TODOs; a migration deletes them before
  the predicate is simplified.
- Tests: "does not satisfy a dependency that is deleted" becomes "deleting a
  Dependency removes the edge and unblocks the dependent".
- Risk: deletion permanently removes requirements and unblocks work. Mitigated by
  the confirmation dialog, and by the tombstone for out-of-band recovery.
- Deleting the live (uncompleted) occurrence of a recurring series ends the
  series: with no restore, the rule on the deleted row never spawns again. This
  supersedes ADR 0001's "recoverable by restoring it" for the delete case.
  Archiving stays the reversible pause, and the delete confirmation names the
  series it ends.

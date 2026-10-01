# Dependency satisfaction: completion, not disposition

> **Superseded in part by [ADR 0005](0005-deletion-is-permanent.md):** deletion is
> permanent and *removes* dependency edges, so "a deleted target never satisfies"
> and "dependents stay blocked" no longer hold. Everything else here stands.

## Context

The brief says a dependent cannot enter In Progress until all its dependencies
are "Completed". It also defines Archived and soft-delete as separate
dispositions, leaving open whether those states satisfy a dependency and whether
*completing* (rather than *starting*) is gated.

## Decision

A dependency is satisfied only when its target has been completed and has not
since been reopened or soft-deleted. Archiving a completed target keeps it
satisfied; archiving an uncompleted target does not. A deleted target never
satisfies. Dependencies gate both entering In Progress and entering Completed —
completing cannot be used to bypass blocking. Whether a TODO is blocked is
computed on read from its dependency edges, not stored.

## Considered Options

- **Treat Archived as satisfying** — rejected: archiving an unfinished
  prerequisite would silently unblock dependents, the same integrity hole as
  delete.
- **Live-status satisfaction (`status == COMPLETED`)** — rejected: archiving a
  completed prerequisite would re-block its dependents. We key on a completion
  time instead, which archiving does not erase.
- **Gate only In Progress (literal brief)** — rejected: `Not Started → Completed`
  would bypass blocking entirely, making dependencies unenforced.
- **Materialized `blocked` column** — deferred: correct but needs invalidation
  across the graph on every status, archive, delete and edge change.
  Computed-on-read self-corrects at 10k until profiling says otherwise.

## Consequences

- Archive is a safe disposition: it never pretends work was done. (Deletion is
  superseded by ADR 0005 — it removes the edge rather than merely failing to
  satisfy it.)
- Reopening a prerequisite immediately re-blocks its dependents, because
  `blocked` is computed on read.
- Unblocking a dependent from an abandoned prerequisite needs an explicit
  action — remove the edge, or complete the prerequisite.
- List reads pay a dependency `EXISTS`; indexes must cover it, and at 10k+ the
  query is profiled and materialization revisited if it degrades.

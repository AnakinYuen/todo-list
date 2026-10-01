# Dependency graph: computed blocking and serialised edge writes

## Context

Dependencies form a directed graph that must stay acyclic. Whether a TODO is
blocked is needed on every read, and concurrent edge edits can create a cycle even
when each edit is individually valid — a write-skew anomaly that single-row
optimistic concurrency cannot catch.

## Decision

- **Blocking is computed on read, never stored.** `blocked` / `blockedBy` are
  derived by an indexed `EXISTS` over the dependency edges and the dependencies'
  completion state. A status change is therefore a single-row write; dependents
  reflect it on their next read, with no propagation.
- **Cycle checks run on every edge mutation, serialised by a graph-wide
  `pg_advisory_xact_lock`.** The mutation and the reachability check happen in one
  transaction at the default `READ COMMITTED`; the advisory lock is what makes the
  check sound against write skew. The lock is taken only for dependency-edge
  mutations — ordinary edits (status, name, due date) are unaffected.
- **Blocking is not overridable.** Removing the edge explicitly is the only
  escape; an audited force-start is deferred.
- **No global ordering.** The graph has no global execution order; the ready set
  (`blocked = false AND status ≠ Completed`) is derivable if a "do next" view is
  ever wanted.

## Considered Options

- **`SERIALIZABLE` + retry** instead of the advisory lock: correct, but adds SSI
  reasoning and a retry loop to every caller. The advisory lock is simpler and
  edge writes are rare.
- **`REPEATABLE READ`**: rejected — it prevents lost updates but still permits
  write skew, so acyclicity can break.
- **Materialised `blocked` column**: deferred — it needs graph-wide propagation
  on every status change; computed-on-read self-corrects and is profiled at 10k.

## Consequences

- Acyclicity is guaranteed at the moment of edge creation.
- Reads pay a small indexed `EXISTS`; the list endpoint reads a page and its
  dependencies in one query.
- Dependency-edge mutations are serialised; ordinary edits are not.
- The edge table stays the source of truth, so a ready-set or execution-order view
  is additive if it is ever needed.

# Blocking is a state invariant, not only a transition guard

## Context

ADR 0002 established that a TODO cannot *enter* In Progress or Completed while a
dependency is unsatisfied. It said nothing about what happens when a prerequisite
*leaves* Completed after a dependent has already started.

Observed: `D` is In Progress and depends on `P`. `P` is completed, unblocking
`D`. `P` is then reopened. `D.blocked` correctly flips back to true (it is
computed on read), but `D` remains In Progress — a state the brief's rule says is
impossible. Enforcement guarded entry; nothing restored the invariant when the
precondition changed.

## Decision

The rule holds as an invariant: **`In Progress` implies every dependency is
Satisfied.** When a TODO leaves a Satisfied state for an active status — reopening
a completed TODO, or un-archiving one that was completed — every dependent that is
In Progress is moved back to Not Started. The cascade propagates only through
dependents it actually reverts: a Completed dependent stays Completed and keeps
satisfying its own dependents, so it is not a conduit, and reversing finished work
is far more surprising than reverting started work. Entering Archived does not
cascade, because archiving keeps a completed dependency satisfied (ADR 0002).
Deleting a completed dependency is deliberately left non-cascading.

The reopen and its cascade run in one transaction that holds the graph-wide
advisory lock from ADR 0003, because the pair is a new cross-row invariant and
would otherwise be violated by write skew (reopen and start interleaving).

The UI warns before a cascading transition: a dedicated impact read reports which
TODOs would be affected, computed by the same rule as the cascade so the warning
cannot disagree with the outcome.

## Considered Options

- **Leave the state and flag it** (In Progress + Blocked, no cascade). Rejected:
  it makes the rule advisory; the system would hold states it claims are
  impossible, and every later feature (filters, "do next") would inherit them.
- **Block the reopen** while a dependent is In Progress. Rejected: reopening is a
  legitimate correction; refusing it pushes the user to work around the tool.
- **Compute the warning in the client.** Rejected: the client has only a page of
  the graph, so it would need the whole list, and it would duplicate the cascade
  rule and drift from it.

## Consequences

- Reopening a prerequisite is a write with a bounded fan-out over its dependents,
  not a single-row update.
- Cascaded dependents have their version bumped, so a concurrent edit of one
  returns 409.
- A user can see a Not Started task they had started revert; the confirmation
  dialog is what makes that acceptable.
- Reopening a recurring occurrence after it already spawned its next one is
  resolved by ADR 0007: the spawned successor survives, and re-completing the
  occurrence cannot spawn a second one (`spawnedAt`).

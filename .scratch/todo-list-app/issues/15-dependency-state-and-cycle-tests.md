# 15: Dependency state and cycle test gaps

**What to build:** Close the dependency edge cases the suite does not exercise: an
Archived-but-never-completed dependency must not satisfy, and cycle detection must
hold beyond the minimal three-node case.

**Blocked by:** 06 (Dependencies). Coordinate with 13 (which rewrites the delete
state tests) and 09 (which owns the concurrent-cycle race).

**Status:** shipped

- [x] An Archived TODO that was **never completed** does not satisfy: a dependent stays Blocked with it in `blockedBy`
- [x] A Completed-then-Archived dependency still satisfies (existing test kept as a regression)
- [x] Cycle detection rejects a longer cycle (four or more nodes) and a "diamond" of edges that only closes at the last hop, not just the three-node chain
- [x] Self-edge rejection stays covered
- [x] The concurrent cycle-forming write-skew race is cross-referenced to 09 (not duplicated here)

## Comments

Cycles and archive semantics are the dependency rules with the most non-obvious
interactions, so they are the ones that need explicit, non-minimal coverage rather
than a single happy-path case.

Current coverage is thin. `todos-dependencies.e2e.test.ts` proves a self-edge and a
single three-node indirect cycle (`:105-125`); there is no longer or wider cycle. It
proves Completed-then-Archived stays satisfied (`:162-170`) and Deleted does not
satisfy (`:172-182`), but **Archived-before-completion is claimed in ADR 0002 and
the decision log and never tested** — the exact "unfinished prerequisite archived
must not silently unblock dependents" rule. That case is unaffected by ADR 0005, so
it belongs here rather than in 13.

After 13 lands, the "deleted dependency" tests change from *blocked* to *edge
removed / unblocked*; this ticket should not duplicate that work — it covers the
Archive axis and cycle depth only.

## Delivered

Test-only; no production change.

**Archive axis** (`todos-dependencies.e2e.test.ts`, "archived dependencies"):
an Archived-before-completion dependency leaves the dependent `blocked` with it
in `blockedBy` and a start attempt 422 `BLOCKED_BY_DEPENDENCIES`; completing that
Archived dependency then unblocks the dependent. The existing
Completed-then-Archived-stays-satisfied test is untouched as the regression.

**Cycle depth** ("cycle detection beyond the three-node chain"): a four-node
linear cycle is rejected; a converging diamond `A→B→D→F` / `A→C→E→F` whose
closing `F→A` would form a four-node cycle through either path is rejected (the
intermediate edges are asserted, so the diamond is really built); and the same
diamond without the closing edge is accepted, asserted by the two dependencies
`A` carries. The self-edge case stays in the existing suite.

The concurrent cycle-forming write-skew race is covered by
`todos-concurrency.e2e.test.ts` (ticket 09) and is deliberately not duplicated
here.


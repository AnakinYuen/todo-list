# TODO List

A single, shared list of TODOs that more than one person can work on at once.
This context covers the TODO lifecycle, recurrence, and the dependencies between
items.

## Language

**TODO**:
The unit of work — name, description, due date, status and priority — and the
unit of CRUD, filtering and sorting.
_Avoid_: Task, item, card, ticket

### Lifecycle

**Status**:
Where a TODO sits in its lifecycle: Not Started, In Progress, Completed,
Archived.
_Avoid_: State, phase

**Priority**:
A TODO's relative importance: Low, Medium, High.
_Avoid_: Urgency, severity, rank

**Archived**:
A TODO removed from the active working set but retained. Archiving is a
disposition, not an outcome: a TODO archived before completion is abandoned and
does not satisfy dependencies; one archived after completion keeps that
completion.
_Avoid_: Deleted, closed, done

### Recurrence

**Recurrence**:
A TODO's schedule — how often, and on which dates — for producing its next
occurrence once it is completed. A TODO with no recurrence is a one-off;
removing the schedule from the current occurrence ends the series.
_Avoid_: Repeat, cycle

**Anchor**:
The part of a monthly recurrence that fixes which date it lands on: a day of the
month, the last day, the nth weekday, or the last weekday.
_Avoid_: Base date

**Occurrence**:
One member of a series — a complete, independent TODO with its own status and
dependencies.
_Avoid_: Instance, repeat

**Series**:
The set of occurrences produced by a single recurrence schedule. The schedule
lives on the current occurrence and is carried to the next one on completion.
_Avoid_: Template, batch

**One-off**:
A TODO that does not recur; it is a series of one and has no next occurrence.
_Avoid_: Single task, ad-hoc, standalone

### Dependencies

**Dependency**:
A directed link from a dependent TODO to a TODO it requires. The dependent
cannot enter In Progress or Completed until every dependency is satisfied.
_Avoid_: Blocker (for the edge itself), prerequisite, parent/child

**Satisfied** (dependency):
A dependency is satisfied only when its target has been completed and has not
since been reopened. Archiving a completed target leaves it satisfied; archiving
an uncompleted target does not satisfy it. Deleting a target removes the
dependency itself, so there is nothing left to satisfy.
_Avoid_: Met, resolved

**Blocked**:
A TODO with at least one unsatisfied dependency. Its `blockedBy` names the
unsatisfied dependencies.
_Avoid_: Waiting, gated, stuck

**Fan-out cap**:
The most dependencies one TODO may declare, which bounds every TODO's
`dependencies`/`blockedBy` payload. It limits the *out* direction only; the
number of dependents pointing at a TODO is not capped.
_Avoid_: Depth limit, dependency quota

**Supernode**:
A TODO with an unusually large number of dependents. Reads over its edges stay
index-bounded, so it degrades gracefully rather than being forbidden.
_Avoid_: Hub, hotspot

### Retention

**Deleted**:
A TODO removed permanently from the working set: hidden from all normal reads,
retained only as an audit record, and no longer a Dependency of or on anything.
Restoring is not a product capability.
_Avoid_: Removed, trashed, archived (Archived is a distinct disposition)

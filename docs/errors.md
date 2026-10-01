# Error catalog

Every failure returns the same shape — a machine-readable `code`, a human
`message`, and any code-specific fields:

```json
{ "code": "BLOCKED_BY_DEPENDENCIES", "message": "…", "blockedBy": [ … ] }
```

Codes are defined once in `packages/shared` (`ErrorCode`), documented in Swagger
on each endpoint, and raised by the API. Validation is the shared Zod schema
through the validation pipe; the graph/state rules are raised in `TodosService`.

| Code | HTTP | Raised when | Extra fields |
| --- | --- | --- | --- |
| `VALIDATION` | 400 | A path/query/body fails its shared Zod schema, an out-of-range `limit`, a malformed/foreign `cursor`, a missing/invalid `version` on DELETE, or an empty search term. | `issues` (Zod issues) |
| `NOT_FOUND` | 404 | No live TODO for the id (unknown, or Deleted), a Dependency that is missing/Deleted, or the dependent row is gone. | — |
| `CONFLICT` | 409 | An optimistic `version` is stale on PATCH, transition or DELETE. | `currentVersion` |
| `DUPLICATE_OCCURRENCE` | 409 | A write would collide with the series-date unique index: an edit moves an Occurrence onto a sibling's live due date, or a completion's spawn lands on one. | — |
| `BLOCKED_BY_DEPENDENCIES` | 422 | Entering In Progress/Completed while a dependency is unsatisfied, or adding an unsatisfied Dependency to an In Progress TODO. | `blockedBy` (the unsatisfied `{ id, name, status }` refs) |
| `CYCLE_DETECTED` | 422 | Adding a Dependency that would make the graph cyclic (self-edge included). | — |
| `RECURRENCE_ON_COMPLETED` | 422 | Adding or changing a Recurrence rule on a TODO that is completed (or archived after completion). An unchanged echo is allowed; reopen it first to change it. | — |
| `DEPENDENCY_LIMIT` | 422 | Adding a Dependency beyond the fan-out cap (`MAX_DEPENDENCIES_PER_TODO`). | — |

## Notes

- **Blocking is a read, not a write.** `blocked`/`blockedBy` are computed on every
  read; `BLOCKED_BY_DEPENDENCIES` is returned only by the operations that would
  *create* an impossible state (a gated transition, or an edge edit on an In
  Progress TODO) — see ADR 0004. A Completed TODO that becomes blocked is a
  deliberate, allowed state.
- **Deletion does not raise `BLOCKED_BY_DEPENDENCIES`.** Deleting removes the
  TODO's edges instead, so it never leaves a dependent blocked (ADR 0005).
- **Concurrency.** Writes carry an optimistic `version`; a stale one is
  `CONFLICT`, not a lock error. Dependency-edge mutations are serialised by a
  graph-wide advisory lock, so two edges that would combine into a cycle resolve
  to one success and one `CYCLE_DETECTED` (ADR 0003).

# 02: TODO detail and edit

**What to build:** A person can open a single TODO, see its full detail, and edit
its name, description, due date or Priority. Two people editing the same TODO at
once cannot silently overwrite each other — the second write is rejected with a
conflict.

**Blocked by:** 01 (Walking skeleton)

**Status:** shipped

- [x] Fetching a single TODO returns it, or 404 when it does not exist
- [x] Editing name, description, due date or Priority succeeds; malformed values are rejected with a validation error
- [x] A stale write (based on an old version) is rejected with a conflict (409)
- [x] The web UI opens a TODO and edits it
- [x] Integration tests cover fetch, edit, validation and the conflict case

## Comments

Implemented `GET /api/todos/:id` (404 when missing, 400 for a malformed id) and
`PATCH /api/todos/:id` with optimistic concurrency: the body carries the
`version` the client read, the update runs `WHERE id = ? AND version = ?` and
bumps the version, and a mismatch returns `409 { code: 'CONFLICT', currentVersion }`.
`UpdateTodoInput` in the shared contract requires `version` and at least one
editable field; `null` clears description or due date. The web UI opens a TODO
(fetching the latest by id), edits name/description/due date/Priority, and shows a
conflict message on 409.

Extracted a shared test harness (`test/support/harness.ts`) and made Vitest run
test files serially, since the integration suites share one test database.

Verified: `pnpm -r typecheck`, `pnpm -r build`, `pnpm test` (14 tests green across
two suites), plus a smoke run of the built server against the devcontainer `db`
(get/patch/stale-conflict/404/400 all behave).

Review follow-ups applied: the shared `IsoDate` now rejects impossible calendar
dates (e.g. `2027-02-30`), which previously would have reached Postgres and
surfaced as a 500 rather than a validation error; the malformed-id path now
returns the same `code: 'VALIDATION'` shape as body validation; the Priority
options are read from the shared contract; and the duplicated not-found body was
extracted.

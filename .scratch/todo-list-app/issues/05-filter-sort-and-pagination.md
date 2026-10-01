# 05: Filter, sort and keyset pagination

**What to build:** A person can narrow the list by Status, Priority or due date,
order it by due date, Priority, Status or name, combine a filter with a sort, and
page through a long list without the result shifting under them.

**Blocked by:** 02 (TODO detail and edit), 03 (Status lifecycle), 04 (Soft delete)

**Status:** shipped

- [x] Filter by Status, Priority and due date (including overdue)
- [x] Sort by due date, Priority, Status and name
- [x] Filters and sort combine; results page by cursor rather than offset
- [x] The web UI exposes filter and sort controls and paging
- [x] Integration tests cover each filter, each sort, and pagination stability

## Comments

`GET /api/todos` now returns a page — `{ items, nextCursor }` — and accepts
`status`, `priority`, `dueBefore`, `dueAfter`, `overdue`, `sort`
(`dueDate|priority|status|name`), `order` (`asc|desc`), `limit` (1–100, default
20), `cursor`, and `includeDeleted`.

Keyset pagination uses a text sort key so one comparison covers every sort:
names as-is, due dates as `YYYY-MM-DD` (undefined dates as a sentinel that sorts
last either way), and enums as fixed ranks (`todo_status`/`todo_priority` order).
The cursor is base64url JSON `{ k, id }`; each page adds
`(key > k) OR (key = k AND id > id)` (asc) with `id` as the stable tie-break.
`overdue` means `dueDate < current_date` and Status not Completed/Archived.

The list response shape changed from an array to a page, so the earlier suites
were updated; the web UI gained Status/Priority/Sort/Order controls, an "Overdue
only" filter, and a "Load more" button.

Verified: `pnpm lint`, `pnpm format:check`, `pnpm -r typecheck`, `pnpm -r build`,
`pnpm test` (63 tests across five suites, 14 new) — plus a `playwright-cli` walk
showing the controls and a name-descending sort, with zero console errors.

Review follow-ups applied: the cursor is validated (its `id` must be a UUID) and
is bound to the `sort`/`order` it was issued for, so a stale or reused cursor is
rejected with 400 rather than producing a wrong page or a 500; the SQL rank
`case` expressions are derived from the same rank maps the JS side uses (one
source of truth); the contract defaults (`sort`, `order`, `limit`) and the list
params type live in `packages/shared`; the stale `TodoList` export was removed
and the page field renamed to `todos`; the web UI gained the `dueAfter`/
`dueBefore` inputs; and tests now cover the `id` tie-break, descending
pagination, and the two cursor-rejection paths.

# 12: Docs and deployment verification

**What to build:** A reviewer can clone the repository, run `docker compose up
--build`, seed demo data, and understand every behaviour — including recurrence
and dependency edge cases and the error responses — from the OpenAPI docs and the
README.

**Blocked by:** 01, 02, 03, 04, 05, 06, 07, 08, 09, 10, 11 (all other tickets)

**Status:** shipped

- [x] OpenAPI/Swagger documents every endpoint, including recurrence and dependency edge cases and the error codes
- [x] The README setup and local-development steps are verified against a clean `docker compose up --build` plus seed
- [x] The error catalog is documented: VALIDATION, NOT_FOUND, CONFLICT, BLOCKED_BY_DEPENDENCIES, CYCLE_DETECTED
- [x] `CONTEXT.md`, the ADRs and `docs/decision-log.md` are consistent with the shipped behaviour
- [x] An end-to-end smoke run passes on a clean machine

## Delivered

Test-only? No — docs, OpenAPI metadata and two Docker fixes.

**OpenAPI.** Request/response schemas are now derived from the shared Zod
contracts (`z.toJSONSchema(..., { target: 'openapi-3.0' })`), so the docs cannot
drift from validation: `apps/api/src/common/openapi.ts` exposes the schemas,
path-parameter docs, request-body docs and per-status error responses, and every
endpoint in `todos.controller.ts` / `health.controller.ts` carries them.
`ErrorCode` and `ApiErrorBody` were added to `packages/shared` as the single code
vocabulary and error shape; `ApiError` takes `ErrorCode[]`, so a response cannot
document a code the API does not define. The generated document was checked: 9
paths / 12 operations, each with its params, bodies and status codes; same-status
code groups (e.g. the three dependency 422s) are documented in one response,
since OpenAPI keys responses by status.

**Error catalog.** `docs/errors.md` lists every code, its HTTP status, the extra
body fields (`currentVersion`, `blockedBy`, `issues`) and the rules (blocking is
read-time; deletion removes edges; concurrency is optimistic versioning).

**README and configuration.** `README.md` rewritten: no more "implementation
pending" banner, correct layout/statuses, the compose and dev flows, the script
list (`test:scale`, `benchmark`, `db:*`, seed), an endpoint table, a corrected
concurrency note (optimistic versioning + advisory lock — there is **no** row
lock), and links to `docs/errors.md`. `.env.example` documents `POSTGRES_*`,
`DATABASE_URL`, `PORT`, `CORS_ORIGINS` and `TEST_DATABASE_URL`. The stale
"Current state" and toolchain notes in `docs/decision-log.md`, and the
implementation-status note in `spec.md`, are corrected; `CONTEXT.md`'s Dependency
entry now gates entering In Progress **or** Completed, matching ADR 0002.

**Deployment fixes found by actually running compose.**
- `.dockerignore`'s `*.tsbuildinfo` only matched the context root, so
  `packages/shared/tsconfig.tsbuildinfo` was copied into the image and
  incremental `tsc` skipped emitting `dist` — the web build then failed to
  resolve `@todo-list/shared`. Changed to `**/*.tsbuildinfo`.
- The web image's healthcheck hit `http://localhost/`, which resolves to `::1`
  in the nginx alpine image while nginx listens only on IPv4, so the container
  reported unhealthy. Changed to `http://127.0.0.1/`.

**Verified.** Clean `docker compose up --build`: db healthy → migrate exits 0 →
api healthy → web healthy. `--profile tools run --rm seed` seeded 5 demo TODOs.
Smoke-run through nginx at `http://localhost:8080`: the SPA loaded, listed the
seeded TODOs, opened a detail, and completing the recurring "Weekly team sync"
showed the next-occurrence confirm (11 Jan 2027) and spawned exactly one
successor. Console clean. `docs-json` served at `/api/docs`. Stack torn down and
the volume removed afterwards.

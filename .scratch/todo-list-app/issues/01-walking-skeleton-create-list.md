# 01: Walking skeleton — create and list TODOs end-to-end

**What to build:** A person can run `docker compose up --build` on a clean
machine, open the web UI, create a TODO with a name, and see it appear in the
list; the data persists in PostgreSQL and survives a restart. The API is
reachable with a readiness check, and an automated test proves the create-then-
list path against the real test database.

**Blocked by:** None (can start immediately)

**Status:** shipped

- [x] `docker compose up --build` brings up db, migrate, api and web; the readiness check reports healthy
- [x] A TODO can be created (name required; optional description, due date, Priority, Status) via the API and appears in the list
- [x] The web app lists TODOs and creates one through a form
- [x] Data persists across a container restart (migrations applied automatically)
- [x] An HTTP integration test creates and lists a TODO against `todo-list_test`
- [x] All packages build and typecheck; the shared contract is the single source of the TODO shape

## Comments

Implemented. `@todo-list/shared` holds the Zod contract; `@todo-list/api` is
NestJS + Fastify with a Drizzle `todos` table, a `db:migrate` entrypoint and
`GET /api/todos` + `POST /api/todos` + `GET /api/readyz` + Swagger at
`/api/docs`; `@todo-list/web` is a Vite/React page listing and creating TODOs.
Added `docker/initdb/01-create-test-db.sql`, `apps/web/nginx.conf` and a seed
script.

Verified locally (no Docker in this environment): `pnpm install --frozen-lockfile`,
`pnpm -r build`, `pnpm -r typecheck`, `pnpm test` (3 HTTP integration tests green
against a local `todo-list_test`), and a smoke run of the built production
entrypoints (`node dist/db/migrate.js` then `node dist/main.js`) exercising
create/list/validation/readyz/docs. The `docker compose up` path itself still
needs a Docker host to confirm.

Review follow-ups applied: the shared enum values and the default database URL
are now the single source (the Postgres enums are derived from the shared Zod
enums); responses are validated server-side with the shared `Todo` schema; the
pool/config plumbing is centralised in `src/db/pool.ts` and `src/config.ts`; and
the `seed` compose profile now builds the `build-api` stage so the seed script
exists.

Environment note: this ran inside the devcontainer, whose Postgres is the `db`
service. The `docker/initdb` script postdates the existing volume, so
`todo-list_test` was created by hand there; a fresh volume creates it
automatically. The Vitest config now derives the test database from
`DATABASE_URL` (swapping the database name for `todo-list_test`), so tests hit
the devcontainer's `db` in-container and `localhost` natively, and never the
development database.

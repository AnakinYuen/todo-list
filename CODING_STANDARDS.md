# Coding Standards

How code in this repository is written. The mechanical parts are enforced by
tooling; the rest is judgement, and the review's Standards axis checks against
this document.

## Enforced by tooling

- **Formatting — Prettier.** `pnpm format` / `pnpm format:check`. Do not argue
  about whitespace, quotes or line width; the config decides.
- **Linting — ESLint (flat config) + typescript-eslint.** `pnpm lint`. The
  ruleset is deliberately small and high-signal, not an opinionated framework.
- **Types — TypeScript strict.** `tsconfig.base.json` sets `strict`,
  `noUncheckedIndexedAccess` and `noImplicitOverride`. `pnpm typecheck` builds the
  shared package first, then checks every package.

## Judgement calls

- **Speak the domain's language.** Use the terms defined in `CONTEXT.md`
  (TODO, Status, Priority, Dependency, Blocked, Deleted, Archived, Recurrence,
  Occurrence, Series, Anchor) and avoid the synonyms the glossary lists under
  _Avoid_. Respect the decisions in `docs/adr/`; if you must contradict one,
  surface it rather than silently overriding.
- **One source of truth for contracts.** `packages/shared` owns the Zod schemas
  and types for the API contract. Derive from them (enum values, option lists,
  input shapes) instead of re-declaring the same vocabulary in the API or the UI.
- **One error shape.** Failures return `{ code, message, ... }` with a
  machine-readable `code` (`VALIDATION`, `NOT_FOUND`, `CONFLICT`,
  `BLOCKED_BY_DEPENDENCIES`, `CYCLE_DETECTED`, `RECURRENCE_ON_COMPLETED`,
  `DEPENDENCY_LIMIT`, `DUPLICATE_OCCURRENCE`). Validate input with the shared
  Zod schemas through the validation pipe — no ad-hoc parsing.
- **Concurrency by version.** Every write — edit, transition and delete — carries
  an optimistic `version` and rejects stale writes with 409. Do not add locks or
  transactions without a correctness reason (see ADR 0003).
- **Tests assert behaviour, not implementation.** Test at the agreed seams — the
  HTTP API over the real test database, and the pure modules directly (the API's
  recurrence; the web's list and action lifecycles) — so tests survive
  refactoring. Name tests with the glossary's vocabulary.
- **Modules change for one reason.** Prefer deep modules with small interfaces;
  keep framework wiring (controllers) thin and logic in services.
- **Comments earn their place.** Explain _why_, never _what_. No commented-out
  code.

## Commands

```bash
pnpm lint          # ESLint
pnpm format        # Prettier, write
pnpm format:check  # Prettier, check
pnpm typecheck     # build shared, then type-check all packages
pnpm test          # integration tests
pnpm -r build      # build all packages
pnpm dev           # API + web dev servers
```

## Not enforced yet

Type-aware ESLint rules (e.g. `no-floating-promises`), import ordering, commit
hooks, and CI gating are deliberately deferred; they are reasonable next steps,
not current rules.

# 00: Prefactor — coding standards, Prettier and ESLint

**What to build:** Establish the repository's coding standards as a short written
document, and enforce the mechanical parts with tooling, so every later change is
formatted and linted the same way and code review has a concrete standard to
check against. The editor config and devcontainer already assume Prettier and
ESLint but neither is installed.

**Blocked by:** None (can start immediately)

**Status:** shipped

- [x] `CODING_STANDARDS.md` documents what tooling enforces vs judgement calls, and points at `CONTEXT.md` vocabulary and the ADRs
- [x] Prettier is configured (config + ignore) with scripts; the existing source is formatted
- [x] ESLint (flat config, TypeScript) is configured with a minimal, high-signal ruleset and a `lint` script
- [x] `pnpm lint` and `pnpm format:check` pass
- [x] Every package still typechecks, builds and tests green after the reformat

## Comments

Prefactor inserted before the remaining feature tickets, because a repo-wide
reformat is cheapest while the codebase is small and would otherwise pollute
every subsequent diff.

Deliberately minimal: dev-only dependencies, no CI gating, and a small ruleset
rather than an opinionated framework. `pnpm deploy --prod` keeps these tools out
of the runtime images.

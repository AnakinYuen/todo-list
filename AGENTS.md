# TODO list

## Agent skills

### Issue tracker

Issues and specs live as markdown files under `.scratch/<feature-slug>/`. See
`docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`,
`ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: root `CONTEXT.md` + `docs/adr/`. See `docs/agents/domain.md`.

## Commands

- `pnpm lint` / `pnpm format` / `pnpm format:check` — ESLint and Prettier (root)
- `pnpm typecheck` — builds the shared package, then type-checks every package
- `pnpm test` — integration tests against the derived test database
- `pnpm -r build` — build every package
- `pnpm dev` — API + web dev servers

Conventions live in `CODING_STANDARDS.md`.

## Long-running processes

Start dev servers, watchers and browser sessions in the background and **stop
them before you finish a task** — `pnpm dev` binds ports 8000 (API) and 5173
(web), which the user may be using. Leaving one running causes an
`EADDRINUSE` for whoever starts next.

```bash
nohup pnpm dev >/tmp/opencode/dev.log 2>&1 & echo $!   # record the PID
# ... verify ...
fuser -k 8000/tcp 5173/tcp                             # or: kill <pid>
playwright-cli close-all                               # close browser sessions
```

- This image has no `ps`, `ss` or `pkill`; inspect `/proc/*/cmdline` or use
  `fuser` to find and kill listeners.
- Never leave a server, watcher or browser session running when a task is done.


# syntax=docker/dockerfile:1.7
# ==============================================================================
# Multi-stage build for the pnpm monorepo (NestJS API + React web + shared pkg).
#
#   development -> dev container (hot reload, full toolchain)
#   build       -> compiles shared + api (used to derive the deploy artifacts)
#   api         -> hardened production runtime for the NestJS API (pnpm deploy)
#   web         -> nginx serving the built React SPA + reverse-proxying /api
#
# Image tags are pinned to major.minor for local DX (auto-picks upstream patch
# and CVE fixes). CI/release pipeline should pin immutable digests instead, e.g.:
#   --build-arg NODE_IMAGE=node@sha256:... --build-arg NGINX_IMAGE=nginx@sha256:...
# ==============================================================================
ARG NODE_IMAGE=node:24.21-bookworm-slim
ARG NGINX_IMAGE=nginx:1.30-alpine
ARG OPENCODE_IMAGE=openeuler/opencode:1.18.30-oe2403sp4

# ==============================================================================
# Base: shared platform for every Node stage
# ==============================================================================
FROM ${NODE_IMAGE} AS base

ENV PNPM_HOME=/pnpm \
    PATH="/pnpm:$PATH" \
    CI=true

# Corepack is bundled with Node; pin pnpm from the root package.json
# `packageManager` field so local, CI and Docker resolve the same version.
RUN corepack enable

WORKDIR /repo

# ==============================================================================
# Dependencies: cached layer for the full monorepo lockfile
# ==============================================================================
FROM base AS deps

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml .npmrc tsconfig.base.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/

RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile

# ==============================================================================
# opencode CLI: source image for the standalone binary copied into development.
# ==============================================================================
FROM ${OPENCODE_IMAGE} AS opencode_source

# ==============================================================================
# Development: targeted by .devcontainer (source is bind-mounted at runtime)
# ==============================================================================
FROM base AS development

# Locale: the slim base has no en_US.UTF-8, which makes psql and friends emit
# "Setting locale failed" warnings. C.UTF-8 ships with glibc, so no generation.
ENV LANG=C.UTF-8 \
    LC_ALL=C.UTF-8 \
    PLAYWRIGHT_BROWSERS_PATH=/opt/ms-playwright \
    PLAYWRIGHT_MCP_BROWSER=chromium \
    NODE_PATH=/usr/local/lib/node_modules

RUN apt-get update && apt-get install --yes --no-install-recommends \
    bash \
    ca-certificates \
    curl \
    fonts-dejavu-core \
    git \
    jq \
    postgresql-client \
    sudo \
    && rm -rf /var/lib/apt/lists/*

# Browser automation for agent-driven UI checks: the Playwright CLI (driven by
# the vendored `playwright-cli` skill) plus its Chromium build and the system
# libraries Chromium needs. Browsers live in the image so they survive container
# recreation, and the directory stays writable so the CLI can add a browser if
# its bundled Playwright ever bumps the Chromium revision. Deliberately not part
# of the app's dependency graph.
RUN npm install --global @playwright/cli@latest \
    && playwright-cli install-browser chromium --with-deps \
    && chmod --recursive a+rwX /opt/ms-playwright

# Configure an unprivileged non-root developer user (UID/GID 1001).
# Pre-create the XDG dirs as dev: otherwise Docker creates the bind-mount
# target's parents (/home/dev/.local) as root and the dev user cannot write its
# state/cache.
RUN groupadd --gid 1001 dev \
    && useradd --uid 1001 --gid 1001 --create-home --shell /bin/bash dev \
    && echo 'dev ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/dev \
    && chmod 0440 /etc/sudoers.d/dev \
    && mkdir -p /workspaces/todo-list \
    && chown -R dev:dev /workspaces/todo-list \
    && mkdir -p /home/dev/.local/share /home/dev/.local/state /home/dev/.cache \
    && chown -R dev:dev /home/dev/.local /home/dev/.cache

WORKDIR /workspaces/todo-list

# Inject OpenCode binary directly from the explicit tag/digest stage
COPY --from=opencode_source /usr/local/bin/opencode /usr/local/bin/opencode

USER dev

# Pre-populate the dependency tree into the workspace path so the first
# `pnpm install` inside the container is a fast no-op reconcile.
COPY --from=deps --chown=dev:dev /repo/ ./

CMD ["sleep", "infinity"]

# ==============================================================================
# Build stages
#
# Each app is copied and compiled in its own stage so Docker's cache is
# invalidated per-app: editing `apps/web` no longer rebuilds the API and vice
# versa. Source folders are separate COPY sources, so their layers are
# independent. `build-shared` is shared because both apps depend on it.
# ==============================================================================
FROM deps AS build-shared

COPY packages/shared ./packages/shared
RUN pnpm --filter @todo-list/shared build

FROM build-shared AS build-api

COPY apps/api ./apps/api
RUN pnpm --filter @todo-list/api build

# Self-contained production bundle for the API: no symlinks escaping the
# folder, dev dependencies stripped.
RUN pnpm --filter @todo-list/api deploy --prod /repo/apps/api/deploy

FROM build-shared AS build-web

COPY apps/web ./apps/web
RUN pnpm --filter @todo-list/web build

# ==============================================================================
# API runtime: self-contained artifact produced by `pnpm deploy`
# ==============================================================================
FROM base AS api

ENV NODE_ENV=production \
    PORT=8000

# `/deploy` is created by `pnpm deploy --prod` during `build-api`: dist + a real
# (non-symlinked) production node_modules + drizzle migrations. The runtime image
# never needs pnpm or the monorepo source.
COPY --from=build-api /repo/apps/api/deploy /app

RUN groupadd --gid 1001 nodejs \
    && useradd --uid 1001 --gid nodejs --create-home --shell /usr/sbin/nologin appuser \
    && chown -R appuser:nodejs /app

USER appuser
WORKDIR /app
EXPOSE 8000

# This image serves only. Migrations are a separate invocation of the same
# artifact — `node dist/db/migrate.js` — run once before the service starts
# (compose's one-shot `migrate` service, or a deploy job), so N app replicas can
# never race to migrate.
CMD ["node", "dist/main.js"]

# ==============================================================================
# Web runtime: static React build served by nginx, reverse-proxying /api
# ==============================================================================
FROM ${NGINX_IMAGE} AS web

COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build-web /repo/apps/web/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=10s --timeout=3s --retries=5 \
    CMD wget -qO- http://127.0.0.1/ >/dev/null 2>&1 || exit 1

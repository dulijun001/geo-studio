#!/usr/bin/env bash
#
# PM2 invokes this wrapper to start the Next.js standalone server.
# Why a wrapper: PM2 doesn't natively load .env files; we need them
# exported as real shell env so Next reads them at runtime.

set -euo pipefail

ROOT=/opt/geo-studio

# Load production env. `set -a` auto-exports every variable defined.
if [[ -f "${ROOT}/.env.production" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "${ROOT}/.env.production"
  set +a
else
  echo "FATAL: ${ROOT}/.env.production missing" >&2
  exit 1
fi

# Bind to localhost — Caddy reverse-proxies from :8443 / :443.
# Never expose Next directly to the public IP.
export NODE_ENV=production
export HOSTNAME=127.0.0.1
export PORT=3000

# Standalone build path (next.config.mjs `output: 'standalone'`).
# pnpm monorepo + outputFileTracingRoot puts server.js under apps/web.
exec node "${ROOT}/apps/web/.next/standalone/apps/web/server.js"

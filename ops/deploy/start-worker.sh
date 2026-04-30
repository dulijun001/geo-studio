#!/usr/bin/env bash
#
# PM2 invokes this wrapper to start the worker process (pg-boss + trackers).

set -euo pipefail

ROOT=/opt/geo-studio

if [[ -f "${ROOT}/.env.production" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "${ROOT}/.env.production"
  set +a
else
  echo "FATAL: ${ROOT}/.env.production missing" >&2
  exit 1
fi

export NODE_ENV=production

# Worker 用 tsx 直接跑 ts(避免维护两套 build)。生产同样跑 tsx,启动稍慢
# 但单进程常驻,启动一次后无影响,换来维护简单。
exec "${ROOT}/node_modules/.bin/tsx" "${ROOT}/apps/worker/src/index.ts"

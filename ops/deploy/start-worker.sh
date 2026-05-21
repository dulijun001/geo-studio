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
#
# xvfb-run: GEO tracker (doubao-web / yuanbao-web / deepseek-web) 跑 headful
# Chrome 模拟真人,反爬性能比 headless 更稳。ECS 没桌面环境,用 xvfb 提供
# 虚拟 X server。-a = pick free display num;--server-args 给一个大屏防止
# popup 被裁(豆包登录窗有时 1100×900)。
exec xvfb-run -a --server-args="-screen 0 1280x900x24" \
  "${ROOT}/apps/worker/node_modules/.bin/tsx" "${ROOT}/apps/worker/src/index.ts"

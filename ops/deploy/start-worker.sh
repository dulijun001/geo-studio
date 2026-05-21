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

# V1.11.4e (2026-05-21):固定 DISPLAY=:99 共享 Xvfb,不再用 xvfb-run wrapper。
#
# 根因:xvfb-run 每次启动随机分配新 display 号(:1001/:1002/…),CloakBrowser
# fingerprint seed 跟 display / 进程关联,每次 worker reload 都换新 device 指纹。
# 豆包看到 "同 cookie 但新设备"→ 当未登录处理,brand-review / RAG 类题全 fail。
#
# 修法:启动前确保 Xvfb :99 long-running 跑着(setsid + nohup,boot 时启)。
# 同 display 复用 = 同 fingerprint seed = 跨重启豆包识别为同一设备。
# 同 noVNC 调试 session 共享 :99 → 你扫码登录的 cookie 直接给 worker 用。
#
# Xvfb :99 不在,自动起;在了就直接用。
if ! pgrep -f "Xvfb :99" >/dev/null 2>&1; then
  echo "[start-worker] Xvfb :99 not running, starting..."
  nohup Xvfb :99 -screen 0 1280x900x24 -ac >/var/log/xvfb99.log 2>&1 </dev/null &
  sleep 2
fi

export DISPLAY=:99

exec "${ROOT}/apps/worker/node_modules/.bin/tsx" "${ROOT}/apps/worker/src/index.ts"

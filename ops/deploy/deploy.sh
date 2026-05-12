#!/usr/bin/env bash
###############################################################################
# deploy.sh — 后续每次部署 / 更新代码
#
# 在 ECS 上运行:
#   bash /opt/geo-studio/ops/deploy/deploy.sh
#
# 也可以本地 ssh 触发:
#   ssh ubuntu@47.98.131.138 'bash /opt/geo-studio/ops/deploy/deploy.sh'
###############################################################################
set -euo pipefail

ROOT=/opt/geo-studio
cd ${ROOT}

echo "[deploy] === $(date '+%Y-%m-%d %H:%M:%S') ==="

# 1. 拉代码
git fetch origin
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)
if [[ "$LOCAL" == "$REMOTE" ]]; then
  echo "[deploy] HEAD 已是最新 ($LOCAL),跳过"
  exit 0
fi
git pull --ff-only origin main

# 2. 依赖差异(lockfile 没变就跳过)
if git diff --name-only "$LOCAL" "$REMOTE" | grep -qE '(pnpm-lock\.yaml|package\.json)$'; then
  echo "[deploy] 依赖变更,pnpm install"
  pnpm install --frozen-lockfile
else
  echo "[deploy] lockfile 未变,跳过 install"
fi

# 3. Migration(只在 packages/db/src/schema 或 supabase/migrations 变了时跑)
if git diff --name-only "$LOCAL" "$REMOTE" | grep -qE '(supabase/migrations/|packages/db/src/schema/)'; then
  echo "[deploy] schema 变更,执行 migration"
  pnpm db:migrate
fi

# 4. Web build
pnpm --filter @geo/web build

# 4.5. 把静态资源 + public 推到 standalone — Next standalone build 不会自动
# copy 这两个目录,缺了就 CSS / 图标 / icon-png 全部 404,页面渲染裸 HTML.
# 用 rsync --delete 保持 standalone 内的 static 跟最新 build 一致, public
# 目录如果不存在(已经清空)就跳过.
rsync -a --delete apps/web/.next/static/ apps/web/.next/standalone/apps/web/.next/static/
if [[ -d apps/web/public ]] && [[ -n "$(ls -A apps/web/public 2>/dev/null)" ]]; then
  rsync -a --delete apps/web/public/ apps/web/.next/standalone/apps/web/public/
fi

# 5. PM2 zero-downtime reload
pm2 reload ${ROOT}/ops/deploy/ecosystem.config.cjs --update-env

# 6. 健康检查
sleep 4
if curl -fsS http://127.0.0.1:3000/api/health >/dev/null; then
  echo "[deploy] ✓ web 健康"
else
  echo "[deploy] ✗ web 没起,看日志:pm2 logs geo-web --lines 50"
  exit 1
fi

echo "[deploy] DONE。当前 HEAD: $(git rev-parse --short HEAD)"

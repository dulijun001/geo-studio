#!/usr/bin/env bash
###############################################################################
# rsync-to-ecs.sh — 从你 Mac 推代码到 ECS(没建 git remote 时用)
#
# 在你本地 Mac 跑,不在 ECS 跑。
#
# 第一次:
#   bash ops/deploy/rsync-to-ecs.sh first
# 后续(快,只传变更):
#   bash ops/deploy/rsync-to-ecs.sh
###############################################################################
set -euo pipefail

ECS_USER="${ECS_USER:-root}"             # 阿里云 Ubuntu 默认 root,除非创建时改了
ECS_HOST="${ECS_HOST:-47.98.131.138}"
ECS_PATH="${ECS_PATH:-/opt/geo-studio}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_ed25519}"

if [[ ! -f "$SSH_KEY" ]]; then
  echo "FATAL: SSH key not found at $SSH_KEY"
  echo "  set SSH_KEY=/path/to/your/key  or  ssh-keygen 一个新的"
  exit 1
fi

MODE="${1:-incremental}"

# 第一次:确保 ECS 目标目录存在
if [[ "$MODE" == "first" ]]; then
  echo "[rsync] 第一次,创建 ${ECS_PATH}"
  ssh -i "$SSH_KEY" "${ECS_USER}@${ECS_HOST}" "sudo mkdir -p ${ECS_PATH} && sudo chown -R ${ECS_USER}:${ECS_USER} ${ECS_PATH}"
fi

# rsync 排除清单 — 以防把 .next、node_modules 等大目录传上去(ECS 自己 build)
EXCLUDES=(
  --exclude=node_modules
  --exclude=.next
  --exclude=.turbo
  --exclude=dist
  --exclude=.cache
  --exclude=.git/objects/pack
  --exclude=.env
  --exclude=.env.local
  --exclude=.env.bak.before-migration
  --exclude=.env.production
  --exclude=.env.production.local
  --exclude=secrets.local.md
  --exclude=.claude
  --exclude=/tmp
  --exclude=playwright-mcp-output
  --exclude='*.log'
)

echo "[rsync] 推到 ${ECS_USER}@${ECS_HOST}:${ECS_PATH}"
rsync -avz --delete --progress \
  -e "ssh -i ${SSH_KEY} -o StrictHostKeyChecking=accept-new" \
  "${EXCLUDES[@]}" \
  "$(pwd)/" \
  "${ECS_USER}@${ECS_HOST}:${ECS_PATH}/"

echo ""
echo "[rsync] DONE。"
echo ""
if [[ "$MODE" == "first" ]]; then
  echo "下一步在 ECS 上跑(SSH 进去):"
  echo "  bash ${ECS_PATH}/ops/deploy/install.sh"
else
  echo "下一步在 ECS 上跑(SSH 进去或一行命令):"
  echo "  ssh -i ${SSH_KEY} ${ECS_USER}@${ECS_HOST} 'cd ${ECS_PATH} && bash ops/deploy/deploy.sh'"
fi

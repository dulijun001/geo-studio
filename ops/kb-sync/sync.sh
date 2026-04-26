#!/usr/bin/env bash
# GEO Studio 知识库 → ECS 单次同步
# 被 watch.sh / launchd 调用,也可手动执行(force-sync)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

SRC="${KB_SRC:-$HOME/Workspace/songshu-knowledge-base/}"
DST="${KB_DST:-root@121.196.228.102:/opt/kb/松鼠/}"
KEY="${KB_SSH_KEY:-$HOME/.ssh/geo-studio-ecs.pem}"
EXCLUDE_FILE="$SCRIPT_DIR/rsync-excludes"
LOG="${KB_LOG:-$HOME/Library/Logs/geo-studio-kb-sync.log}"
LOCK_DIR="/tmp/geo-studio-kb-sync.lock"

mkdir -p "$(dirname "$LOG")"

ts() { date '+%Y-%m-%d %H:%M:%S'; }

# 防并发(POSIX 通用,mkdir 是原子操作)— 上次还没跑完时直接退出
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  # 检查锁是否陈旧(> 10 min,可能 sync 进程死了)
  if [ -d "$LOCK_DIR" ] && [ "$(find "$LOCK_DIR" -maxdepth 0 -mmin +10)" ]; then
    echo "[$(ts)] stale lock detected, removing" >> "$LOG"
    rmdir "$LOCK_DIR" 2>/dev/null
    mkdir "$LOCK_DIR" 2>/dev/null
  else
    echo "[$(ts)] another sync in progress, skipping" >> "$LOG"
    exit 0
  fi
fi
trap 'rmdir "$LOCK_DIR" 2>/dev/null' EXIT

{
  echo "[$(ts)] sync start  src=$SRC  dst=$DST"
  if [ ! -d "$SRC" ]; then
    echo "[$(ts)] ERROR: source not found, aborting"
    exit 1
  fi
  rsync -az --delete --max-delete=10 \
    --exclude-from="$EXCLUDE_FILE" \
    -e "ssh -i $KEY -o StrictHostKeyChecking=no -o ConnectTimeout=10" \
    "$SRC" "$DST"
  rc=$?
  if [ $rc -eq 25 ]; then
    echo "[$(ts)] WARN: --max-delete=10 limit exceeded, sync REJECTED — manual investigation required"
  elif [ $rc -ne 0 ]; then
    echo "[$(ts)] ERROR: rsync exit=$rc"
  else
    # 写 sentinel:ECS 端 watchdog 用这个判断"距上次同步多久",避免靠 md mtime 误报
    HOST_PORT="${DST%%:*}"
    ssh -i "$KEY" -o StrictHostKeyChecking=no -o ConnectTimeout=10 "$HOST_PORT" \
      "date +%s > /opt/kb/last-sync.timestamp" 2>/dev/null || true
    echo "[$(ts)] sync done OK"
  fi
  exit $rc
} >> "$LOG" 2>&1

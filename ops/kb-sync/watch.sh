#!/usr/bin/env bash
# GEO Studio 知识库 fswatch 守护
# 30s 防抖 — 文件保存后等 30s 再 rsync,避免连续编辑触发多次同步
# 由 launchd 拉起,KeepAlive=true 保证常驻
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

SRC="${KB_SRC:-$HOME/Workspace/songshu-knowledge-base/}"
LOG="${KB_LOG:-$HOME/Library/Logs/geo-studio-kb-sync.log}"
FSWATCH="${FSWATCH_BIN:-/opt/homebrew/bin/fswatch}"

mkdir -p "$(dirname "$LOG")"

ts() { date '+%Y-%m-%d %H:%M:%S'; }

if [ ! -x "$FSWATCH" ]; then
  echo "[$(ts)] FATAL: fswatch not found at $FSWATCH" >> "$LOG"
  exit 1
fi

if [ ! -d "$SRC" ]; then
  echo "[$(ts)] WARN: src $SRC missing, watcher idling (will retry on next launchd respawn)" >> "$LOG"
  sleep 60
  exit 0
fi

echo "[$(ts)] watcher started  src=$SRC  latency=30s" >> "$LOG"

# 启动时先做一次同步,保证启动后立刻拉齐
"$SCRIPT_DIR/sync.sh" || true

# fswatch -l 30: 30 秒批处理窗口(防抖)
# --event 限定:只关心创建/更新/删除/重命名,忽略文件属性变化
# --exclude:filesystem-level 排除,不传给 sync.sh
exec "$FSWATCH" -r -l 30 \
  --event=Updated --event=Created --event=Removed --event=Renamed \
  --exclude='\.DS_Store$' \
  --exclude='\.sync-conflict' \
  --exclude='/\.git/' \
  "$SRC" | while read -r changed_path; do
    echo "[$(ts)] change detected: $changed_path" >> "$LOG"
    "$SCRIPT_DIR/sync.sh" || true
  done

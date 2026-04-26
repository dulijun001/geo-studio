#!/usr/bin/env bash
# ECS 端:每日 03:00 给 /opt/kb/松鼠 打 snapshot
# 用 rsync --link-dest 实现 hardlink 增量备份(只占新增文件的空间)
# 保留 7 天,超过自动清理
# 部署:见 install-ecs.sh
set -euo pipefail

KB_ROOT="${KB_ROOT:-/opt/kb/松鼠}"
SNAP_ROOT="${SNAP_ROOT:-/opt/kb/snapshots}"
LOG="${LOG:-/opt/kb/logs/snapshot.log}"
KEEP_DAYS=7

mkdir -p "$SNAP_ROOT" "$(dirname "$LOG")"

ts() { date '+%Y-%m-%d %H:%M:%S'; }
TODAY=$(date '+%Y-%m-%d')
DEST="$SNAP_ROOT/$TODAY"

# 找最近一次 snapshot 作为 link-dest 基准(增量 hardlink)
LATEST=$(ls -1d "$SNAP_ROOT"/*/ 2>/dev/null | sort | tail -1)

{
  echo "[$(ts)] snapshot start  dest=$DEST  base=${LATEST:-none}"

  if [ -z "${LATEST:-}" ]; then
    rsync -a "$KB_ROOT/" "$DEST/"
  else
    rsync -a --link-dest="${LATEST%/}" "$KB_ROOT/" "$DEST/"
  fi

  # 清理超过 KEEP_DAYS 天的快照
  find "$SNAP_ROOT" -mindepth 1 -maxdepth 1 -type d -mtime "+$KEEP_DAYS" -exec rm -rf {} + 2>/dev/null || true

  echo "[$(ts)] snapshot done  size=$(du -sh "$DEST" | cut -f1)  total=$(du -sh "$SNAP_ROOT" | cut -f1)  count=$(ls -1 "$SNAP_ROOT" | wc -l)"
} >> "$LOG" 2>&1

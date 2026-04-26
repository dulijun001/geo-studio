#!/usr/bin/env bash
# ECS 端:监控知识库同步健康度
# 每小时跑一次,检查 last sync age + 文件数异常
# 异常时写到告警 log,后续 GEO Studio 后台 / 邮件订阅会读
set -euo pipefail

KB_ROOT="${KB_ROOT:-/opt/kb/松鼠}"
SENTINEL="${SENTINEL:-/opt/kb/last-sync.timestamp}"
LOG="${LOG:-/opt/kb/logs/watchdog.log}"
ALERT="${ALERT:-/opt/kb/logs/alerts.log}"
WARN_AGE_HOURS=24
CRIT_AGE_HOURS=72
MIN_MD_COUNT=100   # 少于这个就报警(防误删)

mkdir -p "$(dirname "$LOG")" "$(dirname "$ALERT")"

ts() { date '+%Y-%m-%d %H:%M:%S'; }

if [ ! -d "$KB_ROOT" ]; then
  echo "[$(ts)] CRITICAL kb root missing: $KB_ROOT" | tee -a "$LOG" >> "$ALERT"
  exit 1
fi

COUNT=$(find "$KB_ROOT" -name "*.md" -type f | wc -l)
if [ "$COUNT" -lt "$MIN_MD_COUNT" ]; then
  LINE="[$(ts)] CRITICAL md_count=$COUNT < $MIN_MD_COUNT (suspicious mass deletion)"
  echo "$LINE" | tee -a "$LOG" >> "$ALERT"
  exit 1
fi

# sentinel:Mac 端 sync.sh 每次成功 rsync 后写入的 unix timestamp
if [ ! -f "$SENTINEL" ]; then
  LINE="[$(ts)] WARN  md_count=$COUNT  sentinel missing — sync never ran or failed"
  echo "$LINE" | tee -a "$LOG" >> "$ALERT"
  exit 0
fi

LAST=$(cat "$SENTINEL")
NOW=$(date +%s)
AGE_SEC=$(( NOW - LAST ))
AGE_H=$(( AGE_SEC / 3600 ))

LEVEL="OK"
if [ "$AGE_H" -ge "$CRIT_AGE_HOURS" ]; then
  LEVEL="CRITICAL"
elif [ "$AGE_H" -ge "$WARN_AGE_HOURS" ]; then
  LEVEL="WARN"
fi

LINE="[$(ts)] $LEVEL  md_count=$COUNT  last_sync_age=${AGE_H}h"
echo "$LINE" >> "$LOG"

if [ "$LEVEL" != "OK" ]; then
  echo "$LINE" >> "$ALERT"
fi

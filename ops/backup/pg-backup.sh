#!/bin/bash
#
# geo-studio 生产库定时备份。
#
# 背景:2026-07 阿里云 ECS 释放导致全量历史数据丢失一次(当前库最早记录只到
# 2026-07-08)。「发布→被引」的 URL 级闭环证据是本项目最难重建的资产——
# 内容可以重写,被引历史重写不了。2026-08-22 体检确认 Docker.raw 仍是唯一副本。
#
# 策略:
#   - 走容器内 pg_dump(版本与服务端一致,避免宿主机 client 版本不匹配)
#   - 日备保留 14 天;每周日那份另存 weekly/ 保留 8 周
#   - 空备份/异常小的 dump 视为失败并保留上一份(防止把好备份轮转掉)
#
# 手动执行: bash ops/backup/pg-backup.sh
# 定时安装: launchctl load ~/Library/LaunchAgents/com.geo-studio.pgbackup.plist

set -uo pipefail

CONTAINER="supabase_db_geo-studio"
BACKUP_ROOT="${GEO_BACKUP_ROOT:-$HOME/Backups/geo-studio}"
DAILY_DIR="$BACKUP_ROOT/daily"
WEEKLY_DIR="$BACKUP_ROOT/weekly"
DAILY_KEEP_DAYS=14
WEEKLY_KEEP_DAYS=56
# 175MB 库 gzip 后约 10-20MB。低于 1MB 几乎必然是 dump 失败或库被清空。
MIN_BYTES=1000000

STAMP="$(date +%Y%m%d-%H%M)"
DOW="$(date +%u)"   # 7 = 周日
TARGET="$DAILY_DIR/geo-studio-$STAMP.sql.gz"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

# C4 (2026-09-01):备份失败推企业微信。DB 备份是"发布→被引"闭环证据的唯一保险,
# 静默失败=在裸奔而不自知。webhook 从项目 .env 读,curl 直发(不依赖 node/worker)。
notify_fail() {
  local url
  url=$(grep -E '^WECOM_WEBHOOK_URL=' /Users/dulijuner/projects/geo-studio/.env 2>/dev/null | head -1 | sed -E 's/^[^=]+=//' | tr -d '"'"'"' ')
  [ -z "$url" ] && return 0
  curl -s -m 10 "$url" -H 'Content-Type: application/json' \
    -d "{\"msgtype\":\"markdown\",\"markdown\":{\"content\":\"**🔴 geo-studio DB 备份失败**\n$1\"}}" >/dev/null 2>&1 || true
}
fail() { log "FAIL: $*"; notify_fail "$*"; exit 1; }

mkdir -p "$DAILY_DIR" "$WEEKLY_DIR" || fail "无法创建备份目录 $BACKUP_ROOT"

docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null | grep -q true \
  || fail "容器 $CONTAINER 未运行 — 跳过本次备份(不轮转已有备份)"

log "开始备份 → $TARGET"
# 刻意不用 --clean:灾难恢复走「建空库 → 还原 → 切换」,而不是覆盖现有库。
# 覆盖式还原一旦误指向生产库就是二次事故。还原流程见 ops/backup/restore.sh。
if ! docker exec "$CONTAINER" pg_dump -U postgres -d postgres \
      --quote-all-identifiers 2>/tmp/geo-pgbackup.err \
      | gzip -9 > "$TARGET"; then
  rm -f "$TARGET"
  fail "pg_dump 失败: $(tail -3 /tmp/geo-pgbackup.err 2>/dev/null)"
fi

SIZE=$(stat -f%z "$TARGET" 2>/dev/null || echo 0)
if [ "$SIZE" -lt "$MIN_BYTES" ]; then
  rm -f "$TARGET"
  fail "备份仅 ${SIZE}B,低于 ${MIN_BYTES}B 下限 — 判定为无效 dump,已丢弃并保留上一份"
fi

# gzip 完整性自检:能解到底才算数
gzip -t "$TARGET" 2>/dev/null || { rm -f "$TARGET"; fail "gzip 校验不通过,已丢弃"; }

log "备份完成: $(du -h "$TARGET" | cut -f1)"

# 周日额外留一份长期快照
if [ "$DOW" = "7" ]; then
  cp "$TARGET" "$WEEKLY_DIR/" && log "已存入周备: $WEEKLY_DIR/$(basename "$TARGET")"
fi

# 轮转(只在本次成功后执行)
find "$DAILY_DIR" -name 'geo-studio-*.sql.gz' -mtime +$DAILY_KEEP_DAYS -delete 2>/dev/null
find "$WEEKLY_DIR" -name 'geo-studio-*.sql.gz' -mtime +$WEEKLY_KEEP_DAYS -delete 2>/dev/null

log "当前留存: 日备 $(ls -1 "$DAILY_DIR" | wc -l | tr -d ' ') 份 / 周备 $(ls -1 "$WEEKLY_DIR" | wc -l | tr -d ' ') 份"
log "占用: $(du -sh "$BACKUP_ROOT" | cut -f1)"

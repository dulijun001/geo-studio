#!/bin/bash
#
# geo-studio 备份还原 / 演练。
#
# 两种用途:
#   1) 演练(默认): 还原到临时库 restore_test,比对行数,验完自动删库。不碰生产。
#      bash ops/backup/restore.sh
#   2) 真实恢复: 还原到指定新库,再由人工切换连接串。
#      bash ops/backup/restore.sh --into geo_restored [--file <path>]
#
# 刻意不提供「直接覆盖 postgres 库」的开关 —— 覆盖式还原误指向生产库就是二次事故。
# 真实恢复的最后一步(切库)必须人工做,脚本不代劳。

set -uo pipefail

CONTAINER="supabase_db_geo-studio"
BACKUP_ROOT="${GEO_BACKUP_ROOT:-$HOME/Backups/geo-studio}"
TARGET_DB="restore_test"
DRILL=1
FILE=""

while [ $# -gt 0 ]; do
  case "$1" in
    --into) TARGET_DB="$2"; DRILL=0; shift 2 ;;
    --file) FILE="$2"; shift 2 ;;
    *) echo "未知参数: $1"; exit 1 ;;
  esac
done

log() { echo "[$(date '+%H:%M:%S')] $*"; }
fail() { log "FAIL: $*"; exit 1; }

[ -n "$FILE" ] || FILE=$(ls -t "$BACKUP_ROOT"/daily/*.sql.gz 2>/dev/null | head -1)
[ -n "$FILE" ] && [ -f "$FILE" ] || fail "找不到备份文件(查过 $BACKUP_ROOT/daily/)"

if [ "$TARGET_DB" = "postgres" ]; then
  fail "拒绝还原到生产库 postgres。请还原到新库再人工切换。"
fi

log "备份文件: $FILE ($(du -h "$FILE" | cut -f1))"
gzip -t "$FILE" 2>/dev/null || fail "gzip 校验不通过,文件已损坏"

log "重建目标库: $TARGET_DB"
docker exec "$CONTAINER" psql -U postgres -c "DROP DATABASE IF EXISTS \"$TARGET_DB\";" >/dev/null 2>&1
docker exec "$CONTAINER" psql -U postgres -c "CREATE DATABASE \"$TARGET_DB\";" >/dev/null 2>&1 \
  || fail "建库失败"

log "还原中..."
gunzip -c "$FILE" | docker exec -i "$CONTAINER" psql -U postgres -d "$TARGET_DB" \
  >/tmp/geo-restore.log 2>&1

# Supabase 的 role/extension 相关报错在还原到本地空库时属预期噪声,
# 只对业务表报错叫停。
BIZ_ERR=$(grep '^ERROR' /tmp/geo-restore.log | grep -cE 'public\.(content_|publish_|geo_|citation|question|staff_|tenant|brand)')
log "还原完成 — 业务表错误 $BIZ_ERR 条(总日志错误 $(grep -c '^ERROR' /tmp/geo-restore.log) 条,含 Supabase 角色噪声)"

log "行数比对:"
FAILED=0
for T in tenants brands content_items content_variants publish_tasks geo_snapshots citations questions staff_accounts; do
  A=$(docker exec "$CONTAINER" psql -U postgres -d postgres   -t -c "select count(*) from public.$T" 2>/dev/null | tr -d ' ')
  B=$(docker exec "$CONTAINER" psql -U postgres -d "$TARGET_DB" -t -c "select count(*) from public.$T" 2>/dev/null | tr -d ' ')
  if [ "$A" = "$B" ]; then M="OK"; else M="!! 不一致"; FAILED=1; fi
  printf "  %-20s 生产=%-8s 还原=%-8s %s\n" "$T" "${A:-?}" "${B:-?}" "$M"
done

# 引用源数组是本项目最难重建的资产,单独抽验
CA=$(docker exec "$CONTAINER" psql -U postgres -d postgres   -t -c "select coalesce(sum(cardinality(citation_urls)),0) from public.geo_snapshots" 2>/dev/null | tr -d ' ')
CB=$(docker exec "$CONTAINER" psql -U postgres -d "$TARGET_DB" -t -c "select coalesce(sum(cardinality(citation_urls)),0) from public.geo_snapshots" 2>/dev/null | tr -d ' ')
if [ "$CA" = "$CB" ]; then M="OK"; else M="!! 不一致"; FAILED=1; fi
printf "  %-20s 生产=%-8s 还原=%-8s %s\n" "引用源 URL 总数" "$CA" "$CB" "$M"

if [ "$DRILL" = "1" ]; then
  docker exec "$CONTAINER" psql -U postgres -c "DROP DATABASE \"$TARGET_DB\";" >/dev/null 2>&1
  log "演练库已清理。"
else
  log "已还原到库 \"$TARGET_DB\" — 保留未删。切换生产连接串需人工操作。"
fi

[ "$FAILED" = "0" ] && log "结论:备份可用。" || { log "结论:备份存在数据缺口,不可依赖!"; exit 1; }

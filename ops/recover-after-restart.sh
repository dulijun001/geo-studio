#!/bin/bash
# 重启 Mac 后的生产恢复流程(2026-08-22 Docker jfs 卡死事故)
#
#   bash ops/recover-after-restart.sh
#
# 步骤:等 Docker → 起 Supabase → 验 PG → **立刻备份** → 重启三个 launchd 服务
# → 验 D56/0046 是否进库 → 拉今日可派单清单
#
# 安全:全程只读 + 备份,不删任何数据。绝不执行 Docker factory reset。

set -uo pipefail
PROJECT=/Users/dulijuner/projects/geo-studio
BACKUP_DIR=~/Documents/geo-studio-backups
cd "$PROJECT" || exit 1

say() { printf '\n\033[1;36m=== %s ===\033[0m\n' "$1"; }
fail() { printf '\033[1;31m!! %s\033[0m\n' "$1"; }
ok()   { printf '\033[1;32m✓ %s\033[0m\n' "$1"; }

say "1/7 等待 Docker 引擎就绪(最多 5 分钟)"
for i in $(seq 1 30); do
  if timeout 8 docker info >/dev/null 2>&1; then ok "Docker 引擎就绪"; break; fi
  [ "$i" -eq 30 ] && { fail "Docker 仍未就绪 —— jfs 卡点未解,不要继续,先处理 Docker"; exit 1; }
  sleep 10
done

say "2/7 检查 Supabase 容器"
docker ps -a --format '{{.Names}} :: {{.Status}}' | grep -i supabase | head -12
if ! docker ps --format '{{.Names}}' | grep -qi "supabase.*db\|supabase_db"; then
  echo "容器未运行,执行 supabase start ..."
  supabase start 2>&1 | tail -12
fi

say "3/7 验证 Postgres 连通"
if ! PGPASSWORD=postgres PGCONNECT_TIMEOUT=8 psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
     -tAc "select 'pg-ok ' || now()::time(0)" 2>&1 | head -2; then
  fail "Postgres 不通,后续步骤全部跳过"; exit 1
fi
ok "Postgres 可连"

say "4/7 【最要紧】立刻备份数据库"
mkdir -p "$BACKUP_DIR"
OUT="$BACKUP_DIR/geo-studio-$(date +%Y%m%d-%H%M).sql.gz"
if PGPASSWORD=postgres /opt/homebrew/bin/pg_dump --no-owner --no-acl \
     -h 127.0.0.1 -p 54322 -U postgres -d postgres 2>/dev/null | gzip > "$OUT"; then
  ok "备份完成: $OUT ($(du -h "$OUT" | cut -f1))"
else
  fail "备份失败 —— 务必人工处理后再继续用系统"
fi

say "5/7 重启三个 launchd 服务"
for s in web worker kb-sync; do
  launchctl kickstart -k "gui/$(id -u)/com.geo-studio.$s" 2>&1 && echo "  restarted: $s"
done
sleep 8
curl -s --noproxy '*' -o /dev/null -w "  web 静态页: %{http_code}\n" --max-time 10 http://127.0.0.1:4300/
curl -s --noproxy '*' -o /dev/null -w "  web 查库页: %{http_code}\n" --max-time 15 http://127.0.0.1:4300/c/songshu/llms.txt

say "6/7 验证 D56 / migration 0046 是否真进库"
PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -tAc \
  "SELECT CASE WHEN pg_get_functiondef(oid) ~ 'ORDER BY[[:space:]]+priority DESC'
               THEN '0046 已进库(纯 priority 排序)'
               ELSE '⚠️ 0046 未生效 —— RPC 仍是旧排序,D55 城市级置顶不会起作用' END
   FROM pg_proc WHERE proname = 'daily_ops_pick_topics' LIMIT 1;" 2>&1 | head -3

say "7/7 今日可派单盘点"
PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
  -f "$PROJECT/ops/check-dispatchable.sql" 2>&1 | head -100

echo ""
ok "恢复流程结束。若可派单数 > 0,直接去 /t/songshu/publish 点派单。"
echo "   新内容生成仍需火山方舟充值(实测欠费中)。"

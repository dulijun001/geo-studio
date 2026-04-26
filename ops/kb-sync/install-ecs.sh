#!/usr/bin/env bash
# Mac 上跑这个脚本,会把 ECS 端的两个脚本(snapshot/watchdog)推上去 + 注册 cron
# 对应 ECS:Ubuntu 22.04,假定 root 可 ssh,key 在 ~/Downloads/ceshi.pem
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KEY="${KB_SSH_KEY:-$HOME/.ssh/geo-studio-ecs.pem}"
HOST="${KB_ECS_HOST:-root@121.196.228.102}"
SSH="ssh -i $KEY -o StrictHostKeyChecking=no"

echo "==> mkdir on ECS"
$SSH "$HOST" 'mkdir -p /opt/kb/scripts /opt/kb/logs /opt/kb/snapshots'

echo "==> push snapshot.sh + watchdog.sh"
scp -i "$KEY" -o StrictHostKeyChecking=no \
  "$SCRIPT_DIR/ecs-snapshot.sh" "$HOST:/opt/kb/scripts/snapshot.sh"
scp -i "$KEY" -o StrictHostKeyChecking=no \
  "$SCRIPT_DIR/ecs-watchdog.sh" "$HOST:/opt/kb/scripts/watchdog.sh"

echo "==> chmod + register cron"
$SSH "$HOST" '
chmod +x /opt/kb/scripts/snapshot.sh /opt/kb/scripts/watchdog.sh

# 用临时 crontab,合并已有 cron(去掉旧的同名行,加新的)
( crontab -l 2>/dev/null | grep -v "kb/scripts/snapshot.sh" | grep -v "kb/scripts/watchdog.sh" ; \
  echo "0 3 * * * /opt/kb/scripts/snapshot.sh" ; \
  echo "5 * * * * /opt/kb/scripts/watchdog.sh" ) | crontab -

echo "current cron:"
crontab -l | grep -E "snapshot|watchdog"
'

echo ""
echo "==> done."
echo "    snapshots: /opt/kb/snapshots/  (每天 03:00,保留 7 天)"
echo "    watchdog:  /opt/kb/logs/watchdog.log + alerts.log  (每小时检查)"

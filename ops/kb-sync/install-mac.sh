#!/usr/bin/env bash
# Mac 端一键部署:chmod 脚本 + 拷贝 plist 到 LaunchAgents + load
# 跑一次即可,后续会随 Mac 启动自动运行
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLIST_NAME="com.geo-studio.kb-sync.plist"
PLIST_DEST="$HOME/Library/LaunchAgents/$PLIST_NAME"

echo "==> chmod +x sync.sh / watch.sh"
chmod +x "$SCRIPT_DIR/sync.sh" "$SCRIPT_DIR/watch.sh"

echo "==> check fswatch"
if [ ! -x /opt/homebrew/bin/fswatch ] && [ ! -x /usr/local/bin/fswatch ]; then
  echo "ERROR: fswatch not installed. run: brew install fswatch"
  exit 1
fi

echo "==> check src dir"
SRC="${KB_SRC:-$HOME/Workspace/songshu-knowledge-base/}"
if [ ! -d "$SRC" ]; then
  echo "ERROR: source dir missing: $SRC"
  exit 1
fi

echo "==> check ssh key"
KEY="${KB_SSH_KEY:-$HOME/.ssh/geo-studio-ecs.pem}"
if [ ! -f "$KEY" ]; then
  echo "ERROR: ssh key missing: $KEY"
  echo "       提示:把 key 拷贝到 $KEY 并 chmod 600(launchd 沙盒不允许读 ~/Downloads)"
  exit 1
fi

echo "==> install launchd plist → $PLIST_DEST"
mkdir -p "$HOME/Library/LaunchAgents"
cp "$SCRIPT_DIR/$PLIST_NAME" "$PLIST_DEST"

echo "==> unload (if loaded) + load"
launchctl unload "$PLIST_DEST" 2>/dev/null || true
launchctl load "$PLIST_DEST"

echo ""
echo "==> done. watcher started."
echo "    log:  ~/Library/Logs/geo-studio-kb-sync.log"
echo "    stop: launchctl unload $PLIST_DEST"
echo "    status: launchctl list | grep kb-sync"

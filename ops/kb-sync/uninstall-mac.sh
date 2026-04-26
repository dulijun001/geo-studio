#!/usr/bin/env bash
set -euo pipefail
PLIST_DEST="$HOME/Library/LaunchAgents/com.geo-studio.kb-sync.plist"
launchctl unload "$PLIST_DEST" 2>/dev/null || true
rm -f "$PLIST_DEST"
echo "uninstalled. logs preserved at ~/Library/Logs/geo-studio-kb-sync*.log"

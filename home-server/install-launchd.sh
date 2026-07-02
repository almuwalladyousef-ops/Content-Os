#!/bin/bash
# Installs the Content OS home server as a launchd agent: starts on boot,
# restarts if it ever dies (KeepAlive). Run once on the Mac mini:
#   cd home-server && npm install && ./install-launchd.sh
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
NODE="$(command -v node)"
LABEL="com.contentos.homeserver"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

if [ -z "$NODE" ]; then echo "node not found — install it first (brew install node)"; exit 1; fi

mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
sed -e "s|__NODE__|$NODE|g" -e "s|__DIR__|$DIR|g" -e "s|__HOME__|$HOME|g" \
  "$DIR/$LABEL.plist" > "$PLIST"

launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"
launchctl kickstart -k "gui/$(id -u)/$LABEL" 2>/dev/null || true

echo "Installed. Logs: ~/Library/Logs/contentos-homeserver.log"
echo "Check: curl -s http://localhost:${PORT:-3737}/api/health"

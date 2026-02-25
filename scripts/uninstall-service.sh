#!/bin/bash
set -e

PLIST_NAME="com.screenshot-to-calendar.server"
PLIST_PATH="$HOME/Library/LaunchAgents/$PLIST_NAME.plist"

if [ -f "$PLIST_PATH" ]; then
  launchctl unload "$PLIST_PATH" 2>/dev/null || true
  rm "$PLIST_PATH"
  echo "Service stopped and uninstalled."
else
  echo "Service is not installed."
fi

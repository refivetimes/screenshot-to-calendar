#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
SERVER_DIR="$PROJECT_DIR/server"
PLIST_NAME="com.screenshot-to-calendar.server"
PLIST_PATH="$HOME/Library/LaunchAgents/$PLIST_NAME.plist"
NODE_PATH="$(which node)"
LOG_DIR="$HOME/Library/Logs/screenshot-to-calendar"

mkdir -p "$LOG_DIR"

if [ ! -f "$PROJECT_DIR/.env" ]; then
  echo "Error: .env file not found. Run 'cp .env.example .env' and add your Gemini API key first."
  exit 1
fi

if [ ! -d "$SERVER_DIR/node_modules" ]; then
  echo "Installing server dependencies..."
  cd "$SERVER_DIR" && npm install
fi

# Unload existing service if present
if launchctl list "$PLIST_NAME" &>/dev/null; then
  echo "Stopping existing service..."
  launchctl unload "$PLIST_PATH" 2>/dev/null || true
fi

cat > "$PLIST_PATH" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$PLIST_NAME</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE_PATH</string>
    <string>$SERVER_DIR/server.js</string>
  </array>
  <key>WorkingDirectory</key>
  <string>$SERVER_DIR</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/usr/local/bin:/usr/bin:/bin</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>$LOG_DIR/stdout.log</string>
  <key>StandardErrorPath</key>
  <string>$LOG_DIR/stderr.log</string>
</dict>
</plist>
EOF

launchctl load "$PLIST_PATH"

echo ""
echo "Service installed and started."
echo "  Server:  http://localhost:54321"
echo "  Logs:    $LOG_DIR/"
echo ""
echo "The server will start automatically on login and restart if it crashes."
echo "To stop: ./scripts/uninstall-service.sh"

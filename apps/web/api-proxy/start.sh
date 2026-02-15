#!/bin/bash
# Auto-restart wrapper for the API server
# Usage: ./start.sh
# This ensures the server stays running and auto-restarts on crash

cd "$(dirname "$0")"

LOG_FILE="data/server.log"
PID_FILE="data/server.pid"
mkdir -p data

# Kill existing server if running
if [ -f "$PID_FILE" ]; then
  OLD_PID=$(cat "$PID_FILE")
  if kill -0 "$OLD_PID" 2>/dev/null; then
    echo "[$(date)] Killing old server (PID: $OLD_PID)"
    kill "$OLD_PID" 2>/dev/null
    sleep 1
    kill -9 "$OLD_PID" 2>/dev/null
  fi
  rm -f "$PID_FILE"
fi

# Also kill anything on port 3001
fuser -k 3001/tcp 2>/dev/null
sleep 1

echo "[$(date)] Starting API server with auto-restart..."
echo "[$(date)] Logs: $LOG_FILE"
echo "[$(date)] PID file: $PID_FILE"

RESTART_COUNT=0
MAX_RESTARTS=50

while [ $RESTART_COUNT -lt $MAX_RESTARTS ]; do
  echo ""
  echo "======================================"
  echo "[$(date)] Server starting (restart #$RESTART_COUNT)..."
  echo "======================================"

  # Start server and capture PID
  bun run server.ts 2>&1 | tee -a "$LOG_FILE" &
  SERVER_PID=$!
  echo $SERVER_PID > "$PID_FILE"
  echo "[$(date)] Server PID: $SERVER_PID"

  # Wait for server to exit
  wait $SERVER_PID
  EXIT_CODE=$?

  echo "[$(date)] Server exited with code $EXIT_CODE"
  rm -f "$PID_FILE"

  if [ $EXIT_CODE -eq 0 ]; then
    echo "[$(date)] Server exited cleanly. Not restarting."
    break
  fi

  RESTART_COUNT=$((RESTART_COUNT + 1))
  echo "[$(date)] Restarting in 2 seconds... (attempt $RESTART_COUNT/$MAX_RESTARTS)"
  sleep 2
done

if [ $RESTART_COUNT -ge $MAX_RESTARTS ]; then
  echo "[$(date)] Max restarts reached ($MAX_RESTARTS). Giving up."
fi

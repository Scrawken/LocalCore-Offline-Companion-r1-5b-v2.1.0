#!/usr/bin/env bash
cd "$(dirname "$0")/.."
echo "Starting LocalCore Offline Studio..."
node engine/local-inference-daemon.js --port 11434 &
DAEMON_PID=$!
open renderer/index.html
wait $DAEMON_PID

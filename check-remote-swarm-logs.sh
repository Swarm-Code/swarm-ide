#!/bin/bash
# Check swarm-server logs on remote machine

echo "Connecting to 155.138.218.159 to check swarm-server logs..."

ssh root@155.138.218.159 << 'ENDSSH'
echo "========================================="
echo "Checking for swarm-server process:"
echo "========================================="
ps aux | grep -E "node.*swarm-server|swarm.*server.js" | grep -v grep

echo ""
echo "========================================="
echo "Checking swarm-server logs (if any):"
echo "========================================="
# Check if there's a log file
if [ -f ~/.swarm-server.log ]; then
    echo "Found ~/.swarm-server.log"
    tail -100 ~/.swarm-server.log | grep -E "🔥|PTY|onData|Terminal|WebSocket" | tail -30
elif [ -f /tmp/swarm-server.log ]; then
    echo "Found /tmp/swarm-server.log"
    tail -100 /tmp/swarm-server.log | grep -E "🔥|PTY|onData|Terminal|WebSocket" | tail -30
else
    echo "No log file found, checking pm2 logs..."
    pm2 logs swarm-server --lines 100 --nostream 2>/dev/null | grep -E "🔥|PTY|onData|Terminal|WebSocket" | tail -30
fi
ENDSSH

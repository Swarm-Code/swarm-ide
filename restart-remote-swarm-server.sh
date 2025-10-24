#!/bin/bash
# Restart swarm-server process on remote machine

sshpass -p '+gQ4!i,!!*b_B2-L' ssh root@155.138.218.159 << 'EOF'
echo "🔍 Finding swarm-server process..."
ps aux | grep "[n]ode.*swarm-server"

echo "🛑 Killing existing swarm-server..."
pkill -9 -f "node.*swarm-server" || echo "No swarm-server processes"
pkill -9 -f "node src/index.js" || echo "No node src/index.js processes"

# Also check for processes using port 7777
lsof -ti:7777 | xargs -r kill -9 || echo "No processes on port 7777"

# Wait for port to be released
sleep 2

echo "🚀 Rebuilding native modules..."
cd /opt/swarm-server || cd ~/swarm-server || { echo "❌ Cannot find swarm-server directory"; exit 1; }

# Rebuild native modules on the target system
npm rebuild 2>&1 | tail -10

echo "🚀 Starting new swarm-server..."
# Start in background
nohup node src/index.js > /tmp/swarm-server.log 2>&1 &
SWARM_PID=$!

echo "✅ Swarm-server started with PID: $SWARM_PID"
sleep 2

# Check if it's running
if ps -p $SWARM_PID > /dev/null; then
    echo "✅ Swarm-server is running"
    echo "📋 Recent logs:"
    tail -20 /tmp/swarm-server.log
else
    echo "❌ Swarm-server failed to start"
    cat /tmp/swarm-server.log
    exit 1
fi
EOF

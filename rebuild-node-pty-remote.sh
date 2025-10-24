#!/bin/bash
# Rebuild node-pty on the remote server to match its GLIBC version

echo "Rebuilding node-pty on remote VPS..."
echo "========================================"

sshpass -p '+gQ4!i,!!*b_B2-L' ssh -o StrictHostKeyChecking=no root@155.138.218.159 << 'ENDSSH'
echo "1. Installing build dependencies..."
apt-get update
apt-get install -y build-essential python3 make g++

echo ""
echo "2. Navigating to swarm-server directory..."
cd /opt/swarm-server

echo ""
echo "3. Rebuilding node-pty native module..."
npm rebuild node-pty

echo ""
echo "4. Testing if rebuild succeeded..."
if [ -f node_modules/node-pty/build/Release/pty.node ]; then
    echo "✅ node-pty rebuild SUCCESSFUL"
    echo "   File: $(ls -lh node_modules/node-pty/build/Release/pty.node)"
else
    echo "❌ node-pty rebuild FAILED"
    exit 1
fi

echo ""
echo "5. Starting swarm-server..."
pkill -f "node src/index.js" 2>/dev/null
nohup node src/index.js > server.log 2>&1 &
sleep 2

echo ""
echo "6. Checking if server started..."
if pgrep -f "node src/index.js" > /dev/null; then
    echo "✅ Server started successfully"
    echo "   PID: $(pgrep -f 'node src/index.js')"
    echo ""
    echo "7. Server log (first 30 lines):"
    head -30 server.log
else
    echo "❌ Server failed to start"
    echo "   Log output:"
    cat server.log
fi
ENDSSH

#!/bin/bash
# Check swarm-server status on remote VPS

echo "Checking swarm-server status on remote VPS..."
echo "========================================"

sshpass -p '+gQ4!i,!!*b_B2-L' ssh -o StrictHostKeyChecking=no root@155.138.218.159 << 'ENDSSH'
echo "1. Process status:"
ps aux | grep -E "node.*swarm|swarm.*index" | grep -v grep

echo ""
echo "2. Files in /opt/swarm-server:"
ls -la /opt/swarm-server/ 2>&1

echo ""
echo "3. Checking for log files:"
find /opt -name "*.log" 2>/dev/null | grep swarm
find /root -name "*swarm*.log" 2>/dev/null

echo ""
echo "4. Port 7777 status:"
netstat -tlnp | grep 7777 || ss -tlnp | grep 7777

echo ""
echo "5. Starting server if not running:"
cd /opt/swarm-server && pwd
if ! pgrep -f "node src/index.js" > /dev/null; then
    echo "Server not running, starting it..."
    nohup node src/index.js > server.log 2>&1 &
    sleep 2
    echo "Server started, PID: $(pgrep -f 'node src/index.js')"
else
    echo "Server already running"
fi

echo ""
echo "6. Server log (last 50 lines):"
cat /opt/swarm-server/server.log 2>&1 | tail -50
ENDSSH

#!/bin/bash
# Test the remote swarm-server after rebuild

echo "Testing remote swarm-server..."
echo "========================================"

sshpass -p '+gQ4!i,!!*b_B2-L' ssh -o StrictHostKeyChecking=no root@155.138.218.159 << 'ENDSSH'
echo "1. Server process status:"
ps aux | grep -E "node src/index.js" | grep -v grep

echo ""
echo "2. Port 7777 listening:"
netstat -tlnp | grep 7777 || ss -tlnp | grep 7777

echo ""
echo "3. Waiting 3 seconds for server to initialize..."
sleep 3

echo ""
echo "4. Testing HTTP health endpoint:"
curl -s http://localhost:7777/health 2>&1 || echo "Health endpoint not responding"

echo ""
echo "5. Server log (last 100 lines):"
cd /opt/swarm-server
tail -100 server.log

echo ""
echo "6. Checking for error patterns in log:"
if grep -i error server.log > /dev/null 2>&1; then
    echo "⚠️  Errors found in log:"
    grep -i error server.log | tail -10
else
    echo "✅ No errors in server log"
fi
ENDSSH

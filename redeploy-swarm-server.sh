#!/bin/bash
# Redeploy swarm-server with WebSocket fix

set -e

echo "🚀 Redeploying swarm-server to fix WebSocket path issue..."

# Package the swarm-server directory
echo "📦 Creating deployment package..."
cd swarm-server
tar czf /tmp/swarm-server.tar.gz .
cd ..

# Copy to remote server
echo "📤 Uploading to 155.138.218.159..."
sshpass -p '+gQ4!i,!!*b_B2-L' scp /tmp/swarm-server.tar.gz root@155.138.218.159:/tmp/

# Deploy on remote server
echo "🔧 Installing on remote server..."
sshpass -p '+gQ4!i,!!*b_B2-L' ssh root@155.138.218.159 << 'EOF'
set -e

# Stop existing swarm-server
echo "🛑 Stopping existing swarm-server..."
systemctl stop swarm-server || true

# Extract new version
echo "📂 Extracting new version..."
rm -rf /opt/swarm-server
mkdir -p /opt/swarm-server
cd /opt/swarm-server
tar xzf /tmp/swarm-server.tar.gz
rm /tmp/swarm-server.tar.gz

# Install dependencies (if needed)
echo "📚 Installing dependencies..."
npm install --production 2>&1 | grep -v "^npm WARN" || true

# Restart swarm-server
echo "🔄 Restarting swarm-server..."
systemctl restart swarm-server

# Check status
sleep 2
if systemctl is-active --quiet swarm-server; then
    echo "✅ Swarm-server is running"
    systemctl status swarm-server --no-pager -l | head -15
else
    echo "❌ Swarm-server failed to start"
    journalctl -u swarm-server -n 20 --no-pager
    exit 1
fi
EOF

echo "✅ Deployment complete!"
echo "🔍 Testing connection..."
sleep 2
curl -s http://127.0.0.1:7777/health | jq . || echo "⚠️  Health check failed (is SSH tunnel active?)"

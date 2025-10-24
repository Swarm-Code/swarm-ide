#!/bin/bash
# Create a new tmux session with btop running via swarm-server terminal API

echo "Creating tmux session with btop via swarm-server..."
echo "========================================"

# First, let's create a terminal via the swarm-server API
# We'll use curl to POST to the terminal creation endpoint

# The swarm-server is accessible via SSH port forwarding at localhost:7777
# We need to create a workspace first, then create a terminal in that workspace

cat > /tmp/create-btop-terminal.js << 'EOFJS'
const http = require('http');

// Step 1: Create a workspace
const workspaceData = JSON.stringify({
    name: 'btop-session',
    path: '/root'
});

const workspaceOptions = {
    hostname: 'localhost',
    port: 7777,
    path: '/workspaces',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': workspaceData.length
    }
};

console.log('[1] Creating workspace...');

const workspaceReq = http.request(workspaceOptions, (res) => {
    let data = '';

    res.on('data', (chunk) => {
        data += chunk;
    });

    res.on('end', () => {
        console.log('[1] Workspace response:', data);
        const workspace = JSON.parse(data);
        const workspaceId = workspace.id;

        // Step 2: Create a terminal in the workspace
        const terminalData = JSON.stringify({
            workspaceId: workspaceId,
            cols: 120,
            rows: 30
        });

        const terminalOptions = {
            hostname: 'localhost',
            port: 7777,
            path: `/workspaces/${workspaceId}/terminals`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': terminalData.length
            }
        };

        console.log('[2] Creating terminal...');

        const terminalReq = http.request(terminalOptions, (res) => {
            let termData = '';

            res.on('data', (chunk) => {
                termData += chunk;
            });

            res.on('end', () => {
                console.log('[2] Terminal response:', termData);
                const terminal = JSON.parse(termData);
                const terminalId = terminal.id;

                console.log('\n✅ Terminal created successfully!');
                console.log('   Terminal ID:', terminalId);
                console.log('   PID:', terminal.pid);
                console.log('   CWD:', terminal.cwd);
                console.log('\n[3] Now sending commands to create tmux session with btop...\n');

                // Step 3: Send commands to the terminal
                // We'll use the write endpoint to send input to the terminal

                const commands = [
                    'tmux new-session -d -s btop-session\n',
                    'tmux send-keys -t btop-session "btop" C-m\n',
                    'tmux attach -t btop-session\n'
                ];

                let cmdIndex = 0;

                const sendCommand = () => {
                    if (cmdIndex >= commands.length) {
                        console.log('\n✅ All commands sent!');
                        console.log('\nTo attach to the tmux session from SSH:');
                        console.log('   tmux attach -t btop-session');
                        return;
                    }

                    const cmd = commands[cmdIndex];
                    console.log(`[3.${cmdIndex + 1}] Sending: ${cmd.trim()}`);

                    const inputData = JSON.stringify({
                        data: cmd
                    });

                    const inputOptions = {
                        hostname: 'localhost',
                        port: 7777,
                        path: `/terminals/${terminalId}/input`,
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Content-Length': inputData.length
                        }
                    };

                    const inputReq = http.request(inputOptions, (res) => {
                        let inputResp = '';

                        res.on('data', (chunk) => {
                            inputResp += chunk;
                        });

                        res.on('end', () => {
                            console.log(`     Response: ${inputResp}`);
                            cmdIndex++;
                            setTimeout(sendCommand, 500); // Wait 500ms between commands
                        });
                    });

                    inputReq.on('error', (e) => {
                        console.error(`     Error: ${e.message}`);
                        cmdIndex++;
                        setTimeout(sendCommand, 500);
                    });

                    inputReq.write(inputData);
                    inputReq.end();
                };

                sendCommand();
            });
        });

        terminalReq.on('error', (e) => {
            console.error('[ERROR] Failed to create terminal:', e.message);
        });

        terminalReq.write(terminalData);
        terminalReq.end();
    });
});

workspaceReq.on('error', (e) => {
    console.error('[ERROR] Failed to create workspace:', e.message);
});

workspaceReq.write(workspaceData);
workspaceReq.end();
EOFJS

# Now we need to ensure port forwarding is active
echo "Checking if port 7777 is accessible locally..."
if ! nc -z localhost 7777 2>/dev/null; then
    echo "⚠️  Port 7777 not accessible locally. Setting up SSH port forward..."
    ssh -f -N -L 7777:localhost:7777 root@155.138.218.159 -o StrictHostKeyChecking=no 2>/dev/null || {
        echo "Using sshpass for port forward..."
        sshpass -p '+gQ4!i,!!*b_B2-L' ssh -f -N -L 7777:localhost:7777 root@155.138.218.159 -o StrictHostKeyChecking=no
    }
    sleep 2
fi

# Test the connection
if nc -z localhost 7777 2>/dev/null; then
    echo "✅ Port 7777 is accessible"
    echo ""
    node /tmp/create-btop-terminal.js
else
    echo "❌ Cannot connect to swarm-server on localhost:7777"
    echo "   Manual SSH port forward command:"
    echo "   sshpass -p '+gQ4!i,!!*b_B2-L' ssh -L 7777:localhost:7777 root@155.138.218.159"
fi

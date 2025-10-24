#!/usr/bin/env node

/**
 * Test script to verify WebSocket terminal connection
 * This creates a terminal and sends a command to verify the connection works
 */

const WebSocket = require('ws');
const http = require('http');

const SWARM_SERVER_URL = 'http://127.0.0.1:7777';
const WORKSPACE_ID = 'default';

// Helper function to make HTTP requests
function request(method, path, body = null) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: '127.0.0.1',
            port: 7777,
            path: path,
            method: method,
            headers: {
                'Content-Type': 'application/json'
            }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve({ status: res.statusCode, data: JSON.parse(data) });
                } else {
                    reject(new Error(`HTTP ${res.statusCode}: ${data}`));
                }
            });
        });

        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

async function testTerminalWebSocket() {
    console.log('🔍 Testing swarm-server WebSocket connection...\n');

    try {
        // Step 1: Create a workspace (if not exists)
        console.log('1️⃣  Creating/getting workspace...');
        let workspace;
        try {
            const wsResponse = await request('POST', '/workspaces', {
                name: 'Test Workspace',
                path: '/tmp/test-ws'
            });
            workspace = wsResponse.data.workspace;
            console.log(`   ✅ Workspace created: ${workspace.id}\n`);
        } catch (err) {
            // Workspace exists, get it
            const listResponse = await request('GET', '/workspaces');
            workspace = listResponse.data.workspaces.find(w => w.name === 'Test Workspace');
            if (!workspace) {
                workspace = listResponse.data.workspaces[0];
            }
            console.log(`   ✅ Using existing workspace: ${workspace.id}\n`);
        }

        // Step 2: Create a terminal
        console.log('2️⃣  Creating terminal...');
        const termResponse = await request(
            'POST',
            `/workspaces/${workspace.id}/terminals`,
            {
                cols: 80,
                rows: 24
            }
        );
        const terminal = termResponse.data.terminal;
        console.log(`   ✅ Terminal created: ${terminal.id}`);
        console.log(`   📍 PID: ${terminal.pid}\n`);

        // Step 3: Connect WebSocket
        console.log('3️⃣  Connecting WebSocket...');
        const ws = new WebSocket(`ws://127.0.0.1:7777/terminals/${terminal.id}/stream`);

        // Handle WebSocket events
        ws.on('open', () => {
            console.log('   ✅ WebSocket connected!\n');

            // Step 4: Send command
            console.log('4️⃣  Sending command: echo "🎉 WEBSOCKET TEST SUCCESSFUL! 🎉"\n');
            ws.send(JSON.stringify({
                type: 'input',
                data: 'echo "🎉 WEBSOCKET TEST SUCCESSFUL! 🎉"\n'
            }));

            // After 2 seconds, send another command to get server info
            setTimeout(() => {
                console.log('5️⃣  Sending command: uname -a\n');
                ws.send(JSON.stringify({
                    type: 'input',
                    data: 'uname -a\n'
                }));
            }, 2000);

            // Exit after 4 seconds
            setTimeout(() => {
                console.log('\n✅ Test complete! Closing connection...');
                ws.send(JSON.stringify({
                    type: 'input',
                    data: 'exit\n'
                }));
                setTimeout(() => {
                    ws.close();
                    process.exit(0);
                }, 500);
            }, 4000);
        });

        ws.on('message', (data) => {
            try {
                const msg = JSON.parse(data);
                if (msg.type === 'connected') {
                    console.log(`   📡 Terminal connected (PID: ${msg.pid})\n`);
                } else if (msg.type === 'data') {
                    // Print terminal output
                    process.stdout.write('   📤 Output: ' + msg.data);
                } else if (msg.type === 'exit') {
                    console.log(`\n   ⚠️  Terminal exited (code: ${msg.exitCode})`);
                }
            } catch (err) {
                console.error('   ❌ Error parsing message:', err);
            }
        });

        ws.on('error', (error) => {
            console.error('\n   ❌ WebSocket error:', error.message);
            process.exit(1);
        });

        ws.on('close', (code, reason) => {
            console.log(`\n   🔌 WebSocket closed (code: ${code}, reason: ${reason || 'none'})`);
        });

    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        console.error('   Stack:', error.stack);
        process.exit(1);
    }
}

// Run test
testTerminalWebSocket();

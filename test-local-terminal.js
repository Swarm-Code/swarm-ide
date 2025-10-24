#!/usr/bin/env node
/**
 * Local WebSocket terminal test
 * Tests the full swarm-server terminal flow with WebSocket connection
 */

const http = require('http');
const WebSocket = require('ws');

const HOST = 'localhost';
const PORT = 7777;

let workspaceId, terminalId;

async function makeRequest(options, data = null) {
    return new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
            let responseData = '';
            res.on('data', (chunk) => { responseData += chunk; });
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, data: JSON.parse(responseData) });
                } catch (e) {
                    reject(new Error(`Failed to parse: ${responseData}`));
                }
            });
        });
        req.on('error', reject);
        if (data) req.write(data);
        req.end();
    });
}

async function createWorkspace() {
    console.log('\n[1/4] Creating workspace...');
    const data = JSON.stringify({
        name: 'local-test-workspace',
        path: process.cwd()
    });

    const result = await makeRequest({
        hostname: HOST,
        port: PORT,
        path: '/workspaces',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': data.length }
    }, data);

    workspaceId = result.data.workspace.id;
    console.log(`   ✅ Workspace: ${workspaceId}`);
    console.log(`      Path: ${result.data.workspace.path}`);
}

async function createTerminal() {
    console.log('\n[2/4] Creating terminal...');
    const data = JSON.stringify({ cols: 120, rows: 30 });

    const result = await makeRequest({
        hostname: HOST,
        port: PORT,
        path: `/workspaces/${workspaceId}/terminals`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': data.length }
    }, data);

    terminalId = result.data.terminal.id;
    console.log(`   ✅ Terminal: ${terminalId}`);
    console.log(`      PID: ${result.data.terminal.pid}`);
    console.log(`      Shell: ${result.data.terminal.shell}`);
    console.log(`      CWD: ${result.data.terminal.cwd}`);
}

async function connectWebSocket() {
    return new Promise((resolve, reject) => {
        console.log('\n[3/4] Connecting WebSocket...');

        const ws = new WebSocket(`ws://${HOST}:${PORT}/terminals/${terminalId}/stream`);
        let receivedData = [];
        let connectedReceived = false;

        ws.on('open', () => {
            console.log('   ✅ WebSocket connected');
        });

        ws.on('message', (data) => {
            try {
                const msg = JSON.parse(data);
                console.log(`   📨 Received: type=${msg.type}`);

                if (msg.type === 'connected') {
                    connectedReceived = true;
                    console.log(`      PID: ${msg.pid}`);
                    console.log(`      Terminal ID: ${msg.terminalId}`);

                    // Now send a test command
                    setTimeout(() => {
                        console.log('\n[4/4] Sending test command: "echo TEST-OUTPUT"');
                        ws.send(JSON.stringify({
                            type: 'input',
                            data: 'echo "🔥 TEST-OUTPUT 🔥"\n'
                        }));

                        // Wait for response, then send exit
                        setTimeout(() => {
                            console.log('   Sending: exit');
                            ws.send(JSON.stringify({ type: 'input', data: 'exit\n' }));
                        }, 1000);
                    }, 500);

                } else if (msg.type === 'data') {
                    receivedData.push(msg.data);
                    // Clean ANSI codes for display
                    const clean = msg.data.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
                    if (clean.trim()) {
                        console.log(`   📥 DATA: "${clean.replace(/\r?\n/g, '\\n')}"`);
                    }
                } else if (msg.type === 'exit') {
                    console.log(`   ⚠️  Terminal exited: code=${msg.exitCode}`);
                }
            } catch (e) {
                console.error('   ❌ Parse error:', e.message);
            }
        });

        ws.on('close', () => {
            console.log('\n   WebSocket closed');
            console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log('📊 TEST RESULTS');
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

            console.log(`Connected message: ${connectedReceived ? '✅' : '❌'}`);
            console.log(`Data messages received: ${receivedData.length > 0 ? '✅' : '❌'} (${receivedData.length} total)`);

            if (receivedData.length > 0) {
                console.log('\n📝 Sample output received:');
                const sample = receivedData.slice(0, 5).join('');
                console.log(sample.substring(0, 200));
            } else {
                console.log('\n❌ NO DATA RECEIVED - Handler attachment failed!');
            }

            resolve(receivedData.length > 0);
        });

        ws.on('error', (err) => {
            console.error('   ❌ WebSocket error:', err.message);
            reject(err);
        });
    });
}

async function main() {
    try {
        console.log('🧪 Local Terminal WebSocket Test');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        await createWorkspace();
        await createTerminal();
        const success = await connectWebSocket();

        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        if (success) {
            console.log('✅ TEST PASSED - Terminal WebSocket working!');
        } else {
            console.log('❌ TEST FAILED - No data received from terminal');
        }
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        process.exit(success ? 0 : 1);

    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        process.exit(1);
    }
}

main();

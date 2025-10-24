/**
 * Test swarm-server terminal with actual commands
 */

const WebSocket = require('ws');
const http = require('http');

const SERVER_URL = 'http://127.0.0.1:7777';
const WS_URL = 'ws://127.0.0.1:7777';

function makeRequest(path, options = {}) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, SERVER_URL);
        const req = http.request(url, {
            method: options.method || 'GET',
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, data: JSON.parse(data) });
                } catch (e) {
                    resolve({ status: res.statusCode, data });
                }
            });
        });

        req.on('error', reject);

        if (options.body) {
            req.write(JSON.stringify(options.body));
        }

        req.end();
    });
}

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function testTerminalCommands() {
    console.log('='.repeat(80));
    console.log('SWARM-SERVER TERMINAL COMMAND TEST');
    console.log('='.repeat(80));

    try {
        // 1. Health check
        console.log('\n1️⃣  Health check...');
        const health = await makeRequest('/health');
        console.log(`✅ Server healthy:`, health.data);

        // 2. List workspaces
        console.log('\n2️⃣  Listing workspaces...');
        const workspaces = await makeRequest('/workspaces');
        console.log(`📁 Found ${workspaces.data.workspaces.length} workspaces`);

        let workspaceId;
        if (workspaces.data.workspaces.length > 0) {
            workspaceId = workspaces.data.workspaces[0].id;
            console.log(`   Using existing workspace: ${workspaceId}`);
        } else {
            console.log('   Creating new workspace...');
            const createWs = await makeRequest('/workspaces', {
                method: 'POST',
                body: {
                    name: 'test-workspace',
                    path: '/root'
                }
            });
            workspaceId = createWs.data.workspace.id;
            console.log(`   Created workspace: ${workspaceId}`);
        }

        // 3. Create terminal
        console.log('\n3️⃣  Creating terminal...');
        const createTerminal = await makeRequest(`/workspaces/${workspaceId}/terminals`, {
            method: 'POST',
            body: {
                cols: 80,
                rows: 24,
                shell: '/bin/bash'
            }
        });

        if (createTerminal.status !== 200) {
            throw new Error(`Failed to create terminal: ${createTerminal.status}`);
        }

        const terminalId = createTerminal.data.terminal.id;
        console.log(`✅ Terminal created: ${terminalId}`);
        console.log(`   PID: ${createTerminal.data.terminal.pid}`);

        // 4. Connect WebSocket
        console.log('\n4️⃣  Connecting WebSocket...');
        const ws = new WebSocket(`${WS_URL}/terminals/${terminalId}/stream`);

        let receivedData = [];
        let connected = false;

        ws.on('open', () => {
            console.log('✅ WebSocket connected');
        });

        ws.on('message', (data) => {
            try {
                const msg = JSON.parse(data);
                console.log(`📨 Message:`, msg);

                if (msg.type === 'connected') {
                    connected = true;
                    console.log(`✅ Terminal connected (PID: ${msg.pid})`);
                }

                if (msg.type === 'data') {
                    receivedData.push(msg.data);
                    process.stdout.write(msg.data);
                }
            } catch (e) {
                console.error('❌ Parse error:', e);
            }
        });

        ws.on('error', (error) => {
            console.error('❌ WebSocket error:', error);
        });

        ws.on('close', (code, reason) => {
            console.log(`🔴 WebSocket closed (code: ${code}, reason: ${reason})`);
        });

        // Wait for connection
        await sleep(2000);

        if (!connected) {
            throw new Error('WebSocket did not connect');
        }

        // 5. Send commands
        console.log('\n5️⃣  Sending test commands...');

        const commands = [
            'pwd\n',
            'echo "Hello from swarm-server terminal!"\n',
            'whoami\n',
            'hostname\n',
            'ls -la\n'
        ];

        for (const cmd of commands) {
            console.log(`\n📤 Sending: ${cmd.trim()}`);
            const sendResult = await makeRequest(`/terminals/${terminalId}/input`, {
                method: 'POST',
                body: { data: cmd }
            });

            if (sendResult.status !== 200) {
                console.error(`❌ Failed to send command: ${sendResult.status}`);
            }

            // Wait for output
            await sleep(1000);
        }

        // Wait to collect all output
        console.log('\n⏳ Waiting for output...');
        await sleep(3000);

        console.log('\n6️⃣  Collected output:');
        console.log('-'.repeat(80));
        console.log(receivedData.join(''));
        console.log('-'.repeat(80));

        // 7. Close terminal
        console.log('\n7️⃣  Closing terminal...');
        ws.close();

        await sleep(500);

        const killResult = await makeRequest(`/terminals/${terminalId}`, {
            method: 'DELETE'
        });

        console.log(`✅ Terminal closed: ${killResult.status === 200 ? 'success' : 'failed'}`);

        console.log('\n' + '='.repeat(80));
        console.log('✅ ALL TESTS PASSED');
        console.log('='.repeat(80));

    } catch (error) {
        console.error('\n' + '='.repeat(80));
        console.error('❌ TEST FAILED');
        console.error('='.repeat(80));
        console.error(error);
        process.exit(1);
    }
}

testTerminalCommands();

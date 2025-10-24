#!/usr/bin/env node

/**
 * Simple ping test - sends ping command and shows response
 */

const WebSocket = require('ws');
const http = require('http');

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

async function pingTest() {
    console.log('🏓 Starting ping test...\n');

    try {
        // Get workspace
        const listResponse = await request('GET', '/workspaces');
        const workspace = listResponse.data.workspaces[0];
        console.log(`📁 Using workspace: ${workspace.id}\n`);

        // Create terminal
        const termResponse = await request(
            'POST',
            `/workspaces/${workspace.id}/terminals`,
            { cols: 80, rows: 24 }
        );
        const terminal = termResponse.data.terminal;
        console.log(`💻 Terminal created: ${terminal.id}\n`);

        // Connect WebSocket
        const ws = new WebSocket(`ws://127.0.0.1:7777/terminals/${terminal.id}/stream`);

        ws.on('open', () => {
            console.log('🔌 WebSocket connected!\n');
            console.log('📡 Sending: ping -c 4 8.8.8.8\n');
            console.log('--- OUTPUT START ---\n');

            // Send ping command
            ws.send(JSON.stringify({
                type: 'input',
                data: 'ping -c 4 8.8.8.8\n'
            }));

            // Exit after 10 seconds
            setTimeout(() => {
                console.log('\n--- OUTPUT END ---\n');
                ws.send(JSON.stringify({
                    type: 'input',
                    data: 'exit\n'
                }));
                setTimeout(() => {
                    ws.close();
                    process.exit(0);
                }, 500);
            }, 10000);
        });

        ws.on('message', (data) => {
            try {
                const msg = JSON.parse(data);
                if (msg.type === 'data') {
                    // Print terminal output directly
                    process.stdout.write(msg.data);
                }
            } catch (err) {
                console.error('Error parsing message:', err);
            }
        });

        ws.on('error', (error) => {
            console.error('\n❌ WebSocket error:', error.message);
            process.exit(1);
        });

        ws.on('close', () => {
            console.log('\n✅ Test complete!');
        });

    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        process.exit(1);
    }
}

// Run test
pingTest();

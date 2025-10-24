/**
 * Test script to create a terminal via swarm-server and check for PTY output
 */

const WebSocket = require('ws');

// Connection details
const SSH_HOST = '155.138.218.159';
const SWARM_PORT = 7777;
const SERVER_URL = `http://${SSH_HOST}:${SWARM_PORT}`;
const WS_URL = `ws://${SSH_HOST}:${SWARM_PORT}`;

async function testPTYOutput() {
    console.log('🧪 Testing PTY Output');
    console.log('===================\n');

    try {
        // Step 1: Get or create workspace
        console.log('📂 Step 1: Getting workspaces...');
        const workspacesRes = await fetch(`${SERVER_URL}/workspaces`);
        const workspacesData = await workspacesRes.json();

        let workspace = workspacesData.workspaces[0];
        if (!workspace) {
            console.log('Creating test workspace...');
            const createRes = await fetch(`${SERVER_URL}/workspaces`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: 'test-workspace',
                    path: '/root'
                })
            });
            const createData = await createRes.json();
            workspace = createData.workspace;
        }

        console.log(`✅ Using workspace: ${workspace.name} (${workspace.id})`);

        // Step 2: Create terminal
        console.log('\n🖥️  Step 2: Creating terminal...');
        const terminalRes = await fetch(`${SERVER_URL}/workspaces/${workspace.id}/terminals`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                cols: 80,
                rows: 24
            })
        });

        if (!terminalRes.ok) {
            throw new Error(`Failed to create terminal: ${terminalRes.status}`);
        }

        const terminalData = await terminalRes.json();
        const terminal = terminalData.terminal;

        console.log(`✅ Terminal created: ${terminal.id} (PID: ${terminal.pid})`);

        // Step 3: Connect WebSocket
        console.log('\n🔌 Step 3: Connecting WebSocket...');
        const ws = new WebSocket(`${WS_URL}/terminals/${terminal.id}/stream`);

        let receivedData = false;
        let receivedMessages = [];

        ws.on('open', () => {
            console.log('✅ WebSocket connected');
        });

        ws.on('message', (data) => {
            const msg = JSON.parse(data.toString());
            console.log(`📨 Message type: ${msg.type}`);

            if (msg.type === 'connected') {
                console.log(`   Terminal ID: ${msg.terminalId}, PID: ${msg.pid}`);
            } else if (msg.type === 'data') {
                receivedData = true;
                const preview = msg.data.substring(0, 100).replace(/\r/g, '\\r').replace(/\n/g, '\\n');
                console.log(`   Data length: ${msg.data.length}`);
                console.log(`   Data preview: "${preview}"`);
                console.log(`   Full data: "${msg.data}"`);
                receivedMessages.push(msg.data);
            } else if (msg.type === 'exit') {
                console.log(`   Exit code: ${msg.exitCode}, Signal: ${msg.signal}`);
            }
        });

        ws.on('error', (error) => {
            console.error('❌ WebSocket error:', error);
        });

        ws.on('close', (code, reason) => {
            console.log(`\n🔴 WebSocket closed: code=${code}, reason=${reason}`);
        });

        // Wait for output
        console.log('\n⏳ Waiting for output (10 seconds)...\n');
        await new Promise(resolve => setTimeout(resolve, 10000));

        // Step 4: Results
        console.log('\n📊 TEST RESULTS');
        console.log('===============');
        console.log(`Received 'data' messages: ${receivedData ? 'YES ✅' : 'NO ❌'}`);
        console.log(`Total messages received: ${receivedMessages.length}`);

        if (receivedMessages.length > 0) {
            console.log('\n📝 All received data:');
            receivedMessages.forEach((data, i) => {
                console.log(`\n${i + 1}. ${JSON.stringify(data)}`);
            });
        }

        // Cleanup
        console.log('\n🧹 Cleaning up...');
        ws.close();

        // Kill terminal
        await fetch(`${SERVER_URL}/terminals/${terminal.id}`, { method: 'DELETE' });
        console.log('✅ Test complete\n');

        // Final verdict
        if (receivedData) {
            console.log('🎉 SUCCESS: PTY is producing output!');
            const hasTestMessage = receivedMessages.some(msg => msg.includes('PTY IS WORKING'));
            if (hasTestMessage) {
                console.log('🔥 TEST MESSAGE FOUND: The PTY test write worked!');
            }
        } else {
            console.log('❌ FAILURE: PTY is NOT producing any output');
            console.log('   This confirms the PTY onData callback is never being triggered');
        }

    } catch (error) {
        console.error('\n❌ Test failed:', error);
        process.exit(1);
    }
}

testPTYOutput();

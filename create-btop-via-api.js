#!/usr/bin/env node
/**
 * Create a tmux session with btop using the Swarm Server Terminal API
 * This demonstrates the proper use of our workspace-aware terminal system
 */

const http = require('http');

// Configuration
const SWARM_SERVER_HOST = 'localhost';
const SWARM_SERVER_PORT = 7777;

// Helper function to make HTTP requests
function makeRequest(options, data = null) {
    return new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
            let responseData = '';

            res.on('data', (chunk) => {
                responseData += chunk;
            });

            res.on('end', () => {
                try {
                    const parsed = JSON.parse(responseData);
                    resolve({ status: res.statusCode, data: parsed });
                } catch (e) {
                    reject(new Error(`Failed to parse JSON: ${responseData}`));
                }
            });
        });

        req.on('error', (error) => {
            reject(error);
        });

        if (data) {
            req.write(data);
        }

        req.end();
    });
}

// Helper to send input to terminal
async function sendToTerminal(terminalId, input) {
    const data = JSON.stringify({ data: input });

    const options = {
        hostname: SWARM_SERVER_HOST,
        port: SWARM_SERVER_PORT,
        path: `/terminals/${terminalId}/input`,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': data.length
        }
    };

    return makeRequest(options, data);
}

// Main execution
async function main() {
    try {
        console.log('🚀 Creating tmux session with btop via Swarm Server API\n');

        // Step 1: Create workspace
        console.log('[1/4] Creating workspace...');
        const workspaceData = JSON.stringify({
            name: 'btop-monitoring',
            path: '/root'
        });

        const workspaceOptions = {
            hostname: SWARM_SERVER_HOST,
            port: SWARM_SERVER_PORT,
            path: '/workspaces',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': workspaceData.length
            }
        };

        const workspaceResult = await makeRequest(workspaceOptions, workspaceData);
        const workspace = workspaceResult.data.workspace;
        console.log(`   ✅ Workspace created: ${workspace.id}`);
        console.log(`      Name: ${workspace.name}`);
        console.log(`      Path: ${workspace.path}\n`);

        // Step 2: Create terminal in workspace
        console.log('[2/4] Creating terminal in workspace...');
        const terminalData = JSON.stringify({
            cols: 120,
            rows: 30
        });

        const terminalOptions = {
            hostname: SWARM_SERVER_HOST,
            port: SWARM_SERVER_PORT,
            path: `/workspaces/${workspace.id}/terminals`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': terminalData.length
            }
        };

        const terminalResult = await makeRequest(terminalOptions, terminalData);
        const terminal = terminalResult.data.terminal;
        console.log(`   ✅ Terminal created: ${terminal.id}`);
        console.log(`      PID: ${terminal.pid}`);
        console.log(`      Shell: ${terminal.shell}`);
        console.log(`      CWD: ${terminal.cwd}\n`);

        // Step 3: Send commands to create tmux session with btop
        console.log('[3/4] Sending commands to terminal...');

        const commands = [
            'tmux new-session -d -s btop-session\n',
            'tmux send-keys -t btop-session "btop" C-m\n',
            'echo "✅ tmux session created: btop-session"\n',
            'tmux list-sessions\n'
        ];

        for (let i = 0; i < commands.length; i++) {
            const cmd = commands[i];
            console.log(`   [${i + 1}/${commands.length}] Sending: ${cmd.trim()}`);
            await sendToTerminal(terminal.id, cmd);
            await new Promise(resolve => setTimeout(resolve, 500)); // Wait between commands
        }

        console.log('\n[4/4] Verification...');
        console.log('   Sending verification command...');
        await sendToTerminal(terminal.id, 'tmux has-session -t btop-session && echo "Session exists!" || echo "Session not found"\n');

        console.log('\n✅ Complete!\n');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📊 tmux session "btop-session" is now running btop');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        console.log('To attach via SSH:');
        console.log('   tmux attach -t btop-session\n');
        console.log('Terminal Details:');
        console.log(`   Workspace ID: ${workspace.id}`);
        console.log(`   Terminal ID:  ${terminal.id}`);
        console.log(`   PID:          ${terminal.pid}`);
        console.log('\nTo connect to this terminal via WebSocket:');
        console.log(`   ws://localhost:${SWARM_SERVER_PORT}/terminals/${terminal.id}/stream`);

    } catch (error) {
        console.error('\n❌ Error:', error.message);
        process.exit(1);
    }
}

main();

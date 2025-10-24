#!/usr/bin/env node

/**
 * Test Script: Swarm Server Deployment
 *
 * This script tests the complete deployment flow:
 * 1. SSH connection to VPS
 * 2. Check Node.js installation
 * 3. Upload swarm-server files
 * 4. Install dependencies
 * 5. Start server
 * 6. Test health endpoint
 * 7. Create workspace and terminal
 */

const { NodeSSH } = require('node-ssh');
const path = require('path');
const fs = require('fs');

const VPS_CONFIG = {
    host: '155.138.218.159',
    port: 22,
    username: 'root',
    password: '+gQ4!i,!!*b_B2-L'
};

const REMOTE_SERVER_PATH = '/tmp/.swarm-server';
const LOCAL_SERVER_PATH = path.join(__dirname, 'swarm-server');

// ANSI colors for better output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m'
};

function log(message, color = colors.reset) {
    console.log(`${color}${message}${colors.reset}`);
}

function logStep(step, message) {
    log(`\n${'='.repeat(80)}`, colors.cyan);
    log(`STEP ${step}: ${message}`, colors.bright + colors.cyan);
    log('='.repeat(80), colors.cyan);
}

function logSuccess(message) {
    log(`✅ ${message}`, colors.green);
}

function logError(message) {
    log(`❌ ${message}`, colors.red);
}

function logWarning(message) {
    log(`⚠️  ${message}`, colors.yellow);
}

function logInfo(message) {
    log(`ℹ️  ${message}`, colors.blue);
}

async function execCommand(ssh, command, description) {
    logInfo(`Running: ${command}`);
    const result = await ssh.execCommand(command);

    if (result.code !== 0) {
        logError(`Failed: ${description}`);
        logError(`Exit code: ${result.code}`);
        if (result.stderr) {
            logError(`STDERR:\n${result.stderr}`);
        }
        if (result.stdout) {
            logInfo(`STDOUT:\n${result.stdout}`);
        }
        return { success: false, ...result };
    }

    logSuccess(`${description}`);
    if (result.stdout) {
        logInfo(`Output: ${result.stdout.trim()}`);
    }
    return { success: true, ...result };
}

async function uploadDirectory(ssh, localPath, remotePath) {
    logInfo(`Uploading ${localPath} -> ${remotePath}`);

    const files = fs.readdirSync(localPath);
    let uploadedCount = 0;

    for (const file of files) {
        // Skip node_modules and .git
        if (file === 'node_modules' || file === '.git' || file === '.gitignore') {
            continue;
        }

        const localFilePath = path.join(localPath, file);
        const remoteFilePath = `${remotePath}/${file}`;
        const stat = fs.statSync(localFilePath);

        if (stat.isDirectory()) {
            // Create remote directory
            await ssh.execCommand(`mkdir -p ${remoteFilePath}`);
            // Recursively upload directory
            await uploadDirectory(ssh, localFilePath, remoteFilePath);
        } else {
            // Upload file
            await ssh.putFile(localFilePath, remoteFilePath);
            uploadedCount++;
            if (uploadedCount % 10 === 0) {
                logInfo(`Uploaded ${uploadedCount} files...`);
            }
        }
    }

    logSuccess(`Uploaded directory: ${localPath}`);
}

async function testSwarmServerDeployment() {
    const ssh = new NodeSSH();

    try {
        // STEP 1: Connect to VPS
        logStep(1, 'Connecting to VPS');
        logInfo(`Host: ${VPS_CONFIG.host}`);
        logInfo(`User: ${VPS_CONFIG.username}`);

        await ssh.connect(VPS_CONFIG);
        logSuccess('Connected to VPS');

        // STEP 2: Check Node.js
        logStep(2, 'Checking Node.js Installation');
        const nodeResult = await execCommand(ssh, 'node --version', 'Check Node.js version');

        if (!nodeResult.success) {
            logError('Node.js is not installed on the VPS');
            logError('Please install Node.js v18+ first');
            return;
        }

        const version = nodeResult.stdout.trim();
        const majorVersion = parseInt(version.replace('v', '').split('.')[0]);

        if (majorVersion < 18) {
            logError(`Node.js version ${version} is too old. Need v18+`);
            return;
        }

        logSuccess(`Node.js ${version} is compatible`);

        // STEP 3: Check if swarm-server already exists
        logStep(3, 'Checking for existing swarm-server installation');
        const checkResult = await ssh.execCommand(`test -d ${REMOTE_SERVER_PATH} && echo "EXISTS" || echo "NOT_FOUND"`);

        if (checkResult.stdout.includes('EXISTS')) {
            logWarning('swarm-server directory already exists');
            logInfo('Removing old installation...');
            await execCommand(ssh, `rm -rf ${REMOTE_SERVER_PATH}`, 'Remove old installation');
        } else {
            logInfo('No existing installation found');
        }

        // STEP 4: Create remote directory
        logStep(4, 'Creating remote directory');
        await execCommand(ssh, `mkdir -p ${REMOTE_SERVER_PATH}`, 'Create server directory');

        // STEP 5: Upload swarm-server files
        logStep(5, 'Uploading swarm-server files');

        if (!fs.existsSync(LOCAL_SERVER_PATH)) {
            logError(`Local swarm-server directory not found: ${LOCAL_SERVER_PATH}`);
            return;
        }

        await uploadDirectory(ssh, LOCAL_SERVER_PATH, REMOTE_SERVER_PATH);
        logSuccess('All files uploaded');

        // STEP 6: List uploaded files
        logStep(6, 'Verifying uploaded files');
        const lsResult = await execCommand(ssh, `ls -la ${REMOTE_SERVER_PATH}`, 'List server files');

        // STEP 7: Install dependencies
        logStep(7, 'Installing NPM dependencies');
        const installResult = await ssh.execCommand(
            `cd ${REMOTE_SERVER_PATH} && npm install --production`,
            { options: { pty: false } }
        );

        if (installResult.code !== 0) {
            logError('NPM install failed');
            logError(`Exit code: ${installResult.code}`);
            logError(`STDERR:\n${installResult.stderr}`);
            logInfo(`STDOUT:\n${installResult.stdout}`);
            return;
        }

        logSuccess('Dependencies installed');
        logInfo(`NPM output:\n${installResult.stdout}`);

        // STEP 8: Make files executable
        logStep(8, 'Setting file permissions');
        await execCommand(ssh, `chmod +x ${REMOTE_SERVER_PATH}/bin/swarm-server.js`, 'Make bin executable');
        await execCommand(ssh, `chmod +x ${REMOTE_SERVER_PATH}/src/index.js`, 'Make index.js executable');

        // STEP 9: Check if server is already running
        logStep(9, 'Checking for running server');
        const killResult = await ssh.execCommand('pkill -f "node src/index.js" || true');
        logInfo('Killed any existing server processes');

        // Wait a bit
        await new Promise(resolve => setTimeout(resolve, 1000));

        // STEP 10: Start server
        logStep(10, 'Starting swarm-server');
        const startCmd = `cd ${REMOTE_SERVER_PATH} && nohup node src/index.js > ~/.swarm-server.log 2>&1 &`;
        await ssh.execCommand(startCmd);
        logSuccess('Server start command sent');

        // STEP 11: Wait for startup
        logStep(11, 'Waiting for server startup');
        await new Promise(resolve => setTimeout(resolve, 3000));

        // STEP 12: Check server health
        logStep(12, 'Testing server health endpoint');
        const healthResult = await ssh.execCommand('curl -s http://localhost:7777/health');

        if (!healthResult.stdout || !healthResult.stdout.includes('"status":"ok"')) {
            logError('Health check failed');
            logError(`Response: ${healthResult.stdout}`);

            // Show server logs
            logInfo('Checking server logs...');
            const logResult = await ssh.execCommand('cat ~/.swarm-server.log');
            logInfo(`Server logs:\n${logResult.stdout}`);

            return;
        }

        logSuccess('Server is healthy!');
        logInfo(`Health response: ${healthResult.stdout}`);

        // STEP 13: Create test workspace
        logStep(13, 'Creating test workspace');
        const createWorkspaceCmd = `curl -s -X POST http://localhost:7777/workspaces \\
            -H "Content-Type: application/json" \\
            -d '{"name":"test-workspace","path":"/root"}'`;

        const workspaceResult = await ssh.execCommand(createWorkspaceCmd);

        if (workspaceResult.code !== 0 || !workspaceResult.stdout) {
            logError('Failed to create workspace');
            logError(`Response: ${workspaceResult.stdout}`);
            return;
        }

        logSuccess('Workspace created');
        logInfo(`Workspace data: ${workspaceResult.stdout}`);

        const workspaceData = JSON.parse(workspaceResult.stdout);
        const workspaceId = workspaceData.workspace.id;

        // STEP 14: Create test terminal
        logStep(14, 'Creating test terminal');
        const createTerminalCmd = `curl -s -X POST http://localhost:7777/workspaces/${workspaceId}/terminals \\
            -H "Content-Type: application/json" \\
            -d '{"cols":80,"rows":24,"shell":"/bin/bash"}'`;

        const terminalResult = await ssh.execCommand(createTerminalCmd);

        if (terminalResult.code !== 0 || !terminalResult.stdout) {
            logError('Failed to create terminal');
            logError(`Response: ${terminalResult.stdout}`);
            return;
        }

        logSuccess('Terminal created');
        logInfo(`Terminal data: ${terminalResult.stdout}`);

        const terminalData = JSON.parse(terminalResult.stdout);
        const terminalId = terminalData.terminal.id;
        const terminalPid = terminalData.terminal.pid;

        // STEP 15: List all workspaces
        logStep(15, 'Listing all workspaces');
        const listWorkspacesResult = await ssh.execCommand('curl -s http://localhost:7777/workspaces');
        logSuccess('Workspaces listed');
        logInfo(`Workspaces: ${listWorkspacesResult.stdout}`);

        // STEP 16: List all terminals
        logStep(16, 'Listing all terminals');
        const listTerminalsResult = await ssh.execCommand('curl -s http://localhost:7777/terminals');
        logSuccess('Terminals listed');
        logInfo(`Terminals: ${listTerminalsResult.stdout}`);

        // FINAL SUMMARY
        log('\n' + '='.repeat(80), colors.green);
        log('✅ DEPLOYMENT SUCCESSFUL!', colors.bright + colors.green);
        log('='.repeat(80), colors.green);
        logSuccess(`Server running at: http://localhost:7777`);
        logSuccess(`Created workspace: ${workspaceId}`);
        logSuccess(`Created terminal: ${terminalId} (PID: ${terminalPid})`);
        log('');
        logInfo('Next steps:');
        logInfo('1. Connect via SSH in Swarm IDE');
        logInfo('2. IDE will setup port forwarding: localhost:7777 -> remote:7777');
        logInfo('3. IDE will create workspace and terminals via swarm-server');
        log('');

    } catch (error) {
        logError('Deployment failed with exception');
        logError(`Error: ${error.message}`);
        logError(`Stack: ${error.stack}`);
    } finally {
        ssh.dispose();
        logInfo('SSH connection closed');
    }
}

// Run the test
log('\n' + '='.repeat(80), colors.bright + colors.blue);
log('🚀 SWARM SERVER DEPLOYMENT TEST', colors.bright + colors.blue);
log('='.repeat(80) + '\n', colors.bright + colors.blue);

testSwarmServerDeployment()
    .then(() => {
        log('\n✅ Test completed', colors.green);
        process.exit(0);
    })
    .catch((error) => {
        log('\n❌ Test failed', colors.red);
        logError(`Error: ${error.message}`);
        process.exit(1);
    });

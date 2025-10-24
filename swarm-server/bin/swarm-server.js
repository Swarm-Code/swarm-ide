#!/usr/bin/env node

/**
 * Swarm Server CLI
 * Command-line interface for managing the Swarm Server
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const os = require('os');

const PROGRAM_NAME = 'swarm-server';
const PID_FILE = path.join(os.homedir(), '.swarm-server', 'swarm-server.pid');
const LOG_FILE = path.join(os.homedir(), '.swarm-server', 'swarm-server.log');
const CONFIG_DIR = path.join(os.homedir(), '.swarm-server');

/**
 * Ensure config directory exists
 */
function ensureConfigDir() {
    if (!fs.existsSync(CONFIG_DIR)) {
        fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
}

/**
 * Read PID from file
 */
function readPid() {
    try {
        if (fs.existsSync(PID_FILE)) {
            const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim());
            return pid;
        }
    } catch (error) {
        // Ignore errors
    }
    return null;
}

/**
 * Write PID to file
 */
function writePid(pid) {
    ensureConfigDir();
    fs.writeFileSync(PID_FILE, pid.toString(), 'utf8');
}

/**
 * Remove PID file
 */
function removePid() {
    try {
        if (fs.existsSync(PID_FILE)) {
            fs.unlinkSync(PID_FILE);
        }
    } catch (error) {
        // Ignore errors
    }
}

/**
 * Check if process is running
 */
function isProcessRunning(pid) {
    try {
        // Send signal 0 to check if process exists
        process.kill(pid, 0);
        return true;
    } catch (error) {
        return false;
    }
}

/**
 * Start the server
 */
function startServer() {
    const existingPid = readPid();

    if (existingPid && isProcessRunning(existingPid)) {
        console.log(`❌ Swarm Server is already running (PID: ${existingPid})`);
        console.log(`   Use 'swarm-server stop' to stop it first`);
        process.exit(1);
    }

    console.log('🚀 Starting Swarm Server...');

    ensureConfigDir();

    // Path to the server entry point
    const serverPath = path.join(__dirname, '..', 'src', 'index.js');

    // Open log file for writing
    const logStream = fs.openSync(LOG_FILE, 'a');

    // Spawn server as detached process
    const child = spawn('node', [serverPath], {
        detached: true,
        stdio: ['ignore', logStream, logStream]
    });

    // Save PID
    writePid(child.pid);

    // Unref to allow parent to exit
    child.unref();

    console.log(`✅ Swarm Server started (PID: ${child.pid})`);
    console.log(`   Logs: ${LOG_FILE}`);
    console.log(`   Status: swarm-server status`);

    process.exit(0);
}

/**
 * Stop the server
 */
function stopServer() {
    const pid = readPid();

    if (!pid || !isProcessRunning(pid)) {
        console.log('❌ Swarm Server is not running');
        removePid();
        process.exit(1);
    }

    console.log(`🛑 Stopping Swarm Server (PID: ${pid})...`);

    try {
        // Send SIGTERM for graceful shutdown
        process.kill(pid, 'SIGTERM');

        // Wait for process to exit
        let attempts = 0;
        const maxAttempts = 50; // 5 seconds

        const checkInterval = setInterval(() => {
            attempts++;

            if (!isProcessRunning(pid)) {
                clearInterval(checkInterval);
                removePid();
                console.log('✅ Swarm Server stopped');
                process.exit(0);
            }

            if (attempts >= maxAttempts) {
                clearInterval(checkInterval);
                console.log('⚠️  Server did not stop gracefully, force killing...');

                try {
                    process.kill(pid, 'SIGKILL');
                    removePid();
                    console.log('✅ Swarm Server killed');
                } catch (error) {
                    console.log('❌ Failed to kill server:', error.message);
                }

                process.exit(0);
            }
        }, 100);

    } catch (error) {
        console.log('❌ Failed to stop server:', error.message);
        removePid();
        process.exit(1);
    }
}

/**
 * Show server status
 */
function showStatus() {
    const pid = readPid();

    if (!pid) {
        console.log('Status: ⚫ Not running');
        console.log(`Logs:   ${LOG_FILE}`);
        process.exit(0);
    }

    if (isProcessRunning(pid)) {
        console.log(`Status: 🟢 Running (PID: ${pid})`);
        console.log(`Logs:   ${LOG_FILE}`);

        // Show last 10 lines of log
        if (fs.existsSync(LOG_FILE)) {
            console.log('\nRecent logs:');
            console.log('─────────────────────────────────────────');

            try {
                const logs = fs.readFileSync(LOG_FILE, 'utf8');
                const lines = logs.trim().split('\n');
                const lastLines = lines.slice(-10);

                lastLines.forEach(line => console.log(line));
            } catch (error) {
                console.log('(Could not read log file)');
            }
        }
    } else {
        console.log('Status: ⚫ Not running (stale PID file)');
        removePid();
    }

    process.exit(0);
}

/**
 * Show help
 */
function showHelp() {
    console.log(`
Swarm Server - Workspace-aware terminal management server

Usage:
  swarm-server <command>

Commands:
  start     Start the server
  stop      Stop the server
  status    Show server status and recent logs
  restart   Restart the server
  help      Show this help message

Examples:
  swarm-server start
  swarm-server status
  swarm-server stop

Configuration:
  Data Dir:   ${CONFIG_DIR}
  PID File:   ${PID_FILE}
  Log File:   ${LOG_FILE}

For more information, visit: https://github.com/swarm-ide/server
`);
}

/**
 * Main CLI handler
 */
function main() {
    const args = process.argv.slice(2);
    const command = args[0];

    switch (command) {
        case 'start':
            startServer();
            break;

        case 'stop':
            stopServer();
            break;

        case 'status':
            showStatus();
            break;

        case 'restart':
            console.log('🔄 Restarting Swarm Server...');
            const pid = readPid();
            if (pid && isProcessRunning(pid)) {
                stopServer();
                // Wait a bit before starting
                setTimeout(() => startServer(), 1000);
            } else {
                startServer();
            }
            break;

        case 'help':
        case '--help':
        case '-h':
            showHelp();
            break;

        default:
            if (command) {
                console.log(`❌ Unknown command: ${command}\n`);
            }
            showHelp();
            process.exit(1);
    }
}

// Run CLI
main();

/**
 * Terminal Manager
 * Handles PTY process creation and management using node-pty
 */

const pty = require('node-pty');
const { v4: uuidv4 } = require('uuid');
const os = require('os');
const logger = require('./utils/logger');
const workspaceManager = require('./workspace-manager');

class TerminalManager {
    constructor() {
        this.terminals = new Map();
    }

    /**
     * Create a new terminal in a workspace
     * This is the KEY method that spawns with correct cwd
     */
    createTerminal(workspaceId, options = {}) {
        const workspace = workspaceManager.getWorkspace(workspaceId);

        if (!workspace) {
            throw new Error(`Workspace not found: ${workspaceId}`);
        }

        const terminalId = `term_${uuidv4().replace(/-/g, '')}`;

        const shell = options.shell || process.env.SHELL || '/bin/bash';
        const cols = options.cols || 80;
        const rows = options.rows || 24;

        // ✅ FIX: Complete environment like VSCode (LANG, HOME, USER)
        const env = {
            ...process.env,
            TERM: 'xterm-256color',
            COLORTERM: 'truecolor',
            LANG: process.env.LANG || 'en_US.UTF-8',
            HOME: process.env.HOME,
            USER: process.env.USER,
            ...options.env
        };

        console.log(`[TerminalManager] 🔥 Creating terminal ${terminalId}`);
        logger.info('terminal', `Creating terminal ${terminalId} in workspace ${workspace.name}`);
        logger.debug('terminal', `  Shell: ${shell}`);
        logger.debug('terminal', `  CWD: ${workspace.path}`);
        logger.debug('terminal', `  Size: ${cols}x${rows}`);

        try {
            // ✅ FIX: Use login shell (-l) like VSCode, add encoding
            const ptyProcess = pty.spawn(shell, ['-l'], {
                name: 'xterm-256color',
                cols,
                rows,
                cwd: workspace.path,
                env,
                encoding: 'utf8'  // ✅ FIX: Explicit UTF-8 encoding
            });

            console.log(`[TerminalManager] ✅ PTY process spawned, PID: ${ptyProcess.pid}`);

            const terminal = {
                id: terminalId,
                workspaceId,
                pid: ptyProcess.pid,
                shell,
                cwd: workspace.path,
                cols,
                rows,
                ptyProcess,
                created: new Date().toISOString(),
                lastActivity: new Date().toISOString(),
                dataHandlers: [],  // ✅ FIX: Track client handlers
                exitHandlers: []   // ✅ FIX: Track client handlers
            };

            this.terminals.set(terminalId, terminal);
            workspaceManager.addTerminalToWorkspace(workspaceId, terminalId);

            // ✅ CRITICAL FIX: Attach PTY handlers IMMEDIATELY (before any output)
            // This prevents race condition where shell prompt is lost
            ptyProcess.onData((data) => {
                console.log(`[TerminalManager] PTY data: ${data.length} bytes`);
                logger.trace('terminalPTY', `🔥🔥 PTY onData FIRED for ${terminalId}`, {
                    dataLength: data.length,
                    dataPreview: data.substring(0, 100).replace(/\r/g, '\\r').replace(/\n/g, '\\n'),
                    numHandlers: terminal.dataHandlers.length
                });

                terminal.lastActivity = new Date().toISOString();

                // Broadcast to all connected clients
                terminal.dataHandlers.forEach((handler, idx) => {
                    try {
                        logger.trace('terminalPTY', `  📤 Broadcasting to handler ${idx + 1}/${terminal.dataHandlers.length}`);
                        handler(data);
                        logger.trace('terminalPTY', `  ✅ Handler ${idx + 1} completed successfully`);
                    } catch (err) {
                        logger.error('terminalPTY', `❌ Error in data handler ${idx + 1} for ${terminalId}:`, err);
                    }
                });

                logger.trace('terminalPTY', `✅ PTY onData completed - broadcasted to ${terminal.dataHandlers.length} clients`);
            });

            // ✅ FIX: Setup exit handler to notify all clients
            ptyProcess.onExit(({ exitCode, signal }) => {
                logger.info('terminal', `Terminal ${terminalId} exited: code=${exitCode}, signal=${signal}`);

                // Notify all connected clients
                terminal.exitHandlers.forEach(handler => {
                    try {
                        handler(exitCode, signal);
                    } catch (err) {
                        logger.error('terminal', `Error in exit handler for ${terminalId}:`, err);
                    }
                });

                this.removeTerminal(terminalId);
            });

            logger.info('terminal', `✅ Terminal ${terminalId} created successfully (PID: ${ptyProcess.pid})`);

            return {
                id: terminalId,
                workspaceId,
                pid: ptyProcess.pid,
                cwd: workspace.path,
                shell,
                cols,
                rows
            };

        } catch (error) {
            logger.error('terminal', `Failed to create terminal:`, error);
            throw new Error(`Failed to create terminal: ${error.message}`);
        }
    }

    getTerminal(terminalId) {
        return this.terminals.get(terminalId);
    }

    listTerminals(workspaceId) {
        if (workspaceId) {
            return Array.from(this.terminals.values())
                .filter(t => t.workspaceId === workspaceId)
                .map(t => ({
                    id: t.id,
                    workspaceId: t.workspaceId,
                    pid: t.pid,
                    shell: t.shell,
                    cwd: t.cwd,
                    cols: t.cols,
                    rows: t.rows,
                    created: t.created
                }));
        }

        return Array.from(this.terminals.values()).map(t => ({
            id: t.id,
            workspaceId: t.workspaceId,
            pid: t.pid,
            shell: t.shell,
            cwd: t.cwd,
            cols: t.cols,
            rows: t.rows,
            created: t.created
        }));
    }

    writeToTerminal(terminalId, data) {
        const terminal = this.terminals.get(terminalId);

        if (!terminal) {
            throw new Error(`Terminal not found: ${terminalId}`);
        }

        terminal.lastActivity = new Date().toISOString();
        terminal.ptyProcess.write(data);
    }

    resizeTerminal(terminalId, cols, rows) {
        const terminal = this.terminals.get(terminalId);

        if (!terminal) {
            throw new Error(`Terminal not found: ${terminalId}`);
        }

        terminal.cols = cols;
        terminal.rows = rows;
        terminal.ptyProcess.resize(cols, rows);

        logger.debug('terminal', `Resized terminal ${terminalId} to ${cols}x${rows}`);
    }

    killTerminal(terminalId) {
        const terminal = this.terminals.get(terminalId);

        if (!terminal) {
            throw new Error(`Terminal not found: ${terminalId}`);
        }

        logger.info('terminal', `Killing terminal ${terminalId}`);
        terminal.ptyProcess.kill();
        this.removeTerminal(terminalId);
    }

    removeTerminal(terminalId) {
        const terminal = this.terminals.get(terminalId);

        if (terminal) {
            // Remove from workspace
            workspaceManager.removeTerminalFromWorkspace(terminal.workspaceId, terminalId);

            // Remove from map
            this.terminals.delete(terminalId);

            logger.debug('terminal', `Removed terminal ${terminalId}`);
        }
    }

    /**
     * Register WebSocket client handlers (don't re-attach PTY handlers)
     * PTY handlers are attached once at creation time in createTerminal()
     */
    attachHandlers(terminalId, onData, onExit) {
        const terminal = this.terminals.get(terminalId);

        if (!terminal) {
            throw new Error(`Terminal not found: ${terminalId}`);
        }

        // ✅ FIX: Add to broadcast list instead of re-attaching PTY handlers
        terminal.dataHandlers.push(onData);
        terminal.exitHandlers.push(onExit);

        console.log(`[TerminalManager] ✅ Client handler registered for ${terminalId} (${terminal.dataHandlers.length} connected clients)`);
        logger.debug('terminal', `✅ Client handler registered for ${terminalId}`, {
            connectedClients: terminal.dataHandlers.length,
            terminalId,
            pid: terminal.pid
        });
        logger.trace('terminal', `Handler details:`, {
            dataHandlerCount: terminal.dataHandlers.length,
            exitHandlerCount: terminal.exitHandlers.length
        });
    }

    /**
     * Remove WebSocket client handlers when client disconnects
     */
    detachHandlers(terminalId, onData, onExit) {
        const terminal = this.terminals.get(terminalId);

        if (!terminal) {
            return;
        }

        const beforeCount = terminal.dataHandlers.length;

        // Remove specific handlers
        terminal.dataHandlers = terminal.dataHandlers.filter(h => h !== onData);
        terminal.exitHandlers = terminal.exitHandlers.filter(h => h !== onExit);

        console.log(`[TerminalManager] Client handler removed for ${terminalId} (${terminal.dataHandlers.length} remaining)`);
        logger.debug('terminal', `Client handler removed for ${terminalId}`, {
            beforeCount,
            afterCount: terminal.dataHandlers.length,
            removed: beforeCount - terminal.dataHandlers.length
        });
    }
}

module.exports = new TerminalManager();

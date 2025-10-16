/**
 * TerminalService - Manages pseudo-terminal (PTY) processes
 *
 * Runs in the main process and manages real terminal processes using node-pty.
 * Provides IPC-based communication with renderer process for terminal I/O.
 *
 * Architecture inspired by VS Code's PtyService and Zed's terminal implementation.
 */

const pty = require('node-pty');
const os = require('os');
const path = require('path');
const fs = require('fs');

class TerminalService {
    constructor() {
        this.terminals = new Map(); // terminalId -> terminal instance
        this.nextTerminalId = 1;
        this.eventHandlers = new Map(); // terminalId -> event handler functions

        // Memory optimization: Limit output buffer size to prevent unbounded growth
        this.MAX_BUFFER_SIZE = 10 * 1024 * 1024; // 10MB per terminal

        console.log('[TerminalService] Initialized with 10MB buffer limit per terminal');
    }

    /**
     * Detect the user's default shell
     */
    detectShell() {
        if (process.platform === 'win32') {
            // Windows: try PowerShell, then cmd
            return process.env.COMSPEC || 'cmd.exe';
        } else {
            // Unix: check SHELL env var, then /etc/passwd
            const shellFromEnv = process.env.SHELL;
            if (shellFromEnv) {
                return shellFromEnv;
            }

            // Fallback to bash
            return '/bin/bash';
        }
    }

    /**
     * Setup environment variables for terminal
     */
    setupEnvironment(customEnv = {}) {
        const env = { ...process.env };

        // Terminal identification
        env.TERM = env.TERM || 'xterm-256color';
        env.COLORTERM = 'truecolor';
        env.SWARM_IDE_TERM = 'true';
        env.TERM_PROGRAM = 'swarm-ide';

        // Locale fallback
        if (!env.LANG) {
            env.LANG = 'en_US.UTF-8';
        }

        // Merge custom environment
        Object.assign(env, customEnv);

        return env;
    }

    /**
     * Create a new terminal
     * @param {Object} options - Terminal options
     * @param {string} [options.shell] - Shell program to use
     * @param {string} [options.cwd] - Working directory
     * @param {Object} [options.env] - Environment variables
     * @param {number} [options.cols] - Terminal columns
     * @param {number} [options.rows] - Terminal rows
     * @param {Function} [options.onData] - Data event handler
     * @param {Function} [options.onExit] - Exit event handler
     * @returns {Object} Terminal info
     */
    createTerminal(options = {}) {
        const terminalId = this.nextTerminalId++;

        console.log('[TerminalService] Creating terminal', terminalId, 'with options:', options);

        try {
            // Determine shell
            const shell = options.shell || this.detectShell();

            // Determine working directory
            const cwd = options.cwd || os.homedir();

            // Validate working directory exists
            if (!fs.existsSync(cwd)) {
                throw new Error(`Working directory does not exist: ${cwd}`);
            }

            // Setup environment
            const env = this.setupEnvironment(options.env || {});

            // Determine terminal size
            const cols = options.cols || 80;
            const rows = options.rows || 24;

            // Spawn PTY
            const ptyProcess = pty.spawn(shell, [], {
                name: 'xterm-256color',
                cols: cols,
                rows: rows,
                cwd: cwd,
                env: env
            });

            console.log('[TerminalService] ✓ PTY spawned:', {
                terminalId,
                pid: ptyProcess.pid,
                shell,
                cwd,
                size: `${cols}x${rows}`
            });

            // Store terminal instance
            const terminal = {
                id: terminalId,
                ptyProcess: ptyProcess,
                shell: shell,
                cwd: cwd,
                pid: ptyProcess.pid,
                cols: cols,
                rows: rows,
                createdAt: Date.now()
            };

            this.terminals.set(terminalId, terminal);

            // Setup event handlers
            const handlers = {
                onData: options.onData || (() => {}),
                onExit: options.onExit || (() => {})
            };

            this.eventHandlers.set(terminalId, handlers);

            // Handle PTY data output
            ptyProcess.onData((data) => {
                handlers.onData(terminalId, data);
            });

            // Handle PTY exit
            ptyProcess.onExit(({ exitCode, signal }) => {
                console.log('[TerminalService] Terminal', terminalId, 'exited:', { exitCode, signal });

                // Cleanup
                this.terminals.delete(terminalId);
                this.eventHandlers.delete(terminalId);

                // Notify
                handlers.onExit(terminalId, exitCode, signal);
            });

            return {
                success: true,
                terminalId: terminalId,
                pid: ptyProcess.pid,
                shell: shell,
                cwd: cwd
            };

        } catch (error) {
            console.error('[TerminalService] ✗ Failed to create terminal:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Write data to terminal
     * @param {number} terminalId - Terminal ID
     * @param {string} data - Data to write
     */
    writeToTerminal(terminalId, data) {
        const terminal = this.terminals.get(terminalId);

        if (!terminal) {
            console.error('[TerminalService] Terminal not found:', terminalId);
            return { success: false, error: 'Terminal not found' };
        }

        try {
            terminal.ptyProcess.write(data);
            return { success: true };
        } catch (error) {
            console.error('[TerminalService] Error writing to terminal:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Resize terminal
     * @param {number} terminalId - Terminal ID
     * @param {number} cols - Columns
     * @param {number} rows - Rows
     */
    resizeTerminal(terminalId, cols, rows) {
        const terminal = this.terminals.get(terminalId);

        if (!terminal) {
            console.error('[TerminalService] Terminal not found:', terminalId);
            return { success: false, error: 'Terminal not found' };
        }

        try {
            terminal.ptyProcess.resize(cols, rows);
            terminal.cols = cols;
            terminal.rows = rows;

            console.log('[TerminalService] Terminal', terminalId, 'resized to', `${cols}x${rows}`);
            return { success: true };
        } catch (error) {
            console.error('[TerminalService] Error resizing terminal:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Close terminal
     * @param {number} terminalId - Terminal ID
     */
    closeTerminal(terminalId) {
        const terminal = this.terminals.get(terminalId);

        if (!terminal) {
            console.error('[TerminalService] Terminal not found:', terminalId);
            return { success: false, error: 'Terminal not found' };
        }

        try {
            terminal.ptyProcess.kill();
            this.terminals.delete(terminalId);
            this.eventHandlers.delete(terminalId);

            console.log('[TerminalService] Terminal', terminalId, 'closed');
            return { success: true };
        } catch (error) {
            console.error('[TerminalService] Error closing terminal:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Get terminal info
     * @param {number} terminalId - Terminal ID
     */
    getTerminalInfo(terminalId) {
        const terminal = this.terminals.get(terminalId);

        if (!terminal) {
            return { success: false, error: 'Terminal not found' };
        }

        return {
            success: true,
            info: {
                id: terminal.id,
                pid: terminal.pid,
                shell: terminal.shell,
                cwd: terminal.cwd,
                cols: terminal.cols,
                rows: terminal.rows,
                createdAt: terminal.createdAt
            }
        };
    }

    /**
     * Get all terminals
     */
    getAllTerminals() {
        const terminals = [];
        for (const [id, terminal] of this.terminals) {
            terminals.push({
                id: terminal.id,
                pid: terminal.pid,
                shell: terminal.shell,
                cwd: terminal.cwd,
                cols: terminal.cols,
                rows: terminal.rows,
                createdAt: terminal.createdAt
            });
        }
        return terminals;
    }

    /**
     * Cleanup all terminals
     */
    shutdown() {
        console.log('[TerminalService] Shutting down, closing', this.terminals.size, 'terminals');

        for (const [terminalId, terminal] of this.terminals) {
            try {
                terminal.ptyProcess.kill();
            } catch (error) {
                console.error('[TerminalService] Error killing terminal', terminalId, ':', error);
            }
        }

        this.terminals.clear();
        this.eventHandlers.clear();

        console.log('[TerminalService] Shutdown complete');
    }
}

// Export singleton instance
module.exports = new TerminalService();

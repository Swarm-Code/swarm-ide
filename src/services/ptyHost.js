#!/usr/bin/env node
/**
 * PTY Host Process - Dedicated utility process for terminal management
 *
 * Architecture inspired by VS Code's PTY Host for ultra-low latency:
 * - Runs as separate process isolated from main/renderer
 * - Direct IPC with renderer via MessagePort (bypasses main process)
 * - Buffers high-frequency terminal output for batch delivery
 * - Implements flow control to prevent overwhelming renderer
 * - Manages all PTY instances and lifecycle
 *
 * Communication:
 * - Renderer -> PTY Host: Direct via MessagePort (lowest latency)
 * - Main -> PTY Host: Lifecycle management only
 */

const pty = require('node-pty');
const os = require('os');
const fs = require('fs');

// Performance optimization: Disable debug logging in production
const DEBUG = process.env.PTY_HOST_DEBUG === 'true';
const LATENCY_LOG = true;  // Always enable latency logging
const log = DEBUG ? console.log : () => {};
const error = console.error; // Always log errors
const latencyLog = LATENCY_LOG ? (...args) => console.log('[PTY HOST]', ...args) : () => {};

/**
 * Data Bufferer - Batches high-frequency terminal output
 *
 * Inspired by VS Code's TerminalDataBufferer:
 * - Aggregates rapid onData events
 * - Sends batched updates to reduce IPC overhead
 * - Critical for TUIs that output rapidly (npm install, build tools, etc.)
 */
class TerminalDataBufferer {
    constructor(terminalId, sendCallback) {
        this.terminalId = terminalId;
        this.sendCallback = sendCallback;
        this.buffer = [];
        this.timeout = null;

        // Buffer configuration (tuned for responsiveness vs overhead)
        this.BUFFER_TIMEOUT = 5; // Send every 5ms max (200Hz)
        this.BUFFER_SIZE_THRESHOLD = 1024 * 10; // 10KB threshold for immediate send
    }

    /**
     * Add data to buffer and schedule send
     */
    push(data) {
        this.buffer.push(data);

        // Estimate buffer size
        const bufferSize = this.buffer.reduce((sum, d) => sum + d.length, 0);

        // Send immediately if buffer is large (prevents delay for big outputs)
        if (bufferSize >= this.BUFFER_SIZE_THRESHOLD) {
            this.flush();
            return;
        }

        // Schedule batched send
        if (!this.timeout) {
            this.timeout = setTimeout(() => this.flush(), this.BUFFER_TIMEOUT);
        }
    }

    /**
     * Send buffered data to renderer
     */
    flush() {
        if (this.timeout) {
            clearTimeout(this.timeout);
            this.timeout = null;
        }

        if (this.buffer.length === 0) return;

        // Combine all buffered data
        const data = this.buffer.join('');
        this.buffer = [];

        // Send via callback
        this.sendCallback(this.terminalId, data);
    }

    /**
     * Cleanup
     */
    dispose() {
        this.flush();
        if (this.timeout) {
            clearTimeout(this.timeout);
        }
    }
}

/**
 * Flow Controller - Prevents overwhelming renderer
 *
 * Inspired by VS Code's flow control:
 * - Tracks unacknowledged data sent to renderer
 * - Pauses PTY output if renderer falls behind
 * - Resumes when renderer catches up
 */
class FlowController {
    constructor(terminalId, ptyProcess) {
        this.terminalId = terminalId;
        this.ptyProcess = ptyProcess;
        this.unacknowledgedBytes = 0;
        this.paused = false;

        // Flow control thresholds
        this.PAUSE_THRESHOLD = 1024 * 1024; // 1MB - pause if 1MB unacknowledged
        this.RESUME_THRESHOLD = 1024 * 512; // 512KB - resume when below 512KB
    }

    /**
     * Track data sent to renderer
     */
    dataSent(byteCount) {
        this.unacknowledgedBytes += byteCount;

        // Pause if too much unacknowledged data
        if (!this.paused && this.unacknowledgedBytes >= this.PAUSE_THRESHOLD) {
            log(`[PTY Host] Flow control: PAUSE terminal ${this.terminalId} (${this.unacknowledgedBytes} bytes pending)`);
            this.ptyProcess.pause();
            this.paused = true;
        }
    }

    /**
     * Renderer acknowledges received data
     */
    dataAcknowledged(byteCount) {
        this.unacknowledgedBytes = Math.max(0, this.unacknowledgedBytes - byteCount);

        // Resume if backpressure relieved
        if (this.paused && this.unacknowledgedBytes <= this.RESUME_THRESHOLD) {
            log(`[PTY Host] Flow control: RESUME terminal ${this.terminalId} (${this.unacknowledgedBytes} bytes pending)`);
            this.ptyProcess.resume();
            this.paused = false;
        }
    }

    /**
     * Get current state
     */
    getState() {
        return {
            unacknowledgedBytes: this.unacknowledgedBytes,
            paused: this.paused
        };
    }
}

/**
 * PTY Host - Manages all terminal processes
 */
class PTYHost {
    constructor() {
        this.terminals = new Map(); // terminalId -> { ptyProcess, bufferer, flowController }
        this.nextTerminalId = 1;
        this.messagePort = null; // Direct connection to renderer

        log('[PTY Host] Initialized');

        // Setup IPC
        this.setupIPC();
    }

    /**
     * Setup IPC communication
     */
    setupIPC() {
        // Listen for messages from parent (main process)
        process.on('message', (message) => {
            this.handleMessage(message);
        });

        // Handle graceful shutdown
        process.on('SIGTERM', () => this.shutdown());
        process.on('SIGINT', () => this.shutdown());
    }

    /**
     * Handle IPC message
     */
    handleMessage(message) {
        const { type, data } = message;

        try {
            switch (type) {
                case 'setup-port':
                    // Receive MessagePort for direct renderer communication
                    this.messagePort = message.port;
                    this.setupMessagePort();
                    log('[PTY Host] MessagePort connected to renderer');
                    break;

                case 'create-terminal':
                    this.createTerminal(data);
                    break;

                case 'write-terminal':
                    this.writeTerminal(data.terminalId, data.data);
                    break;

                case 'resize-terminal':
                    this.resizeTerminal(data.terminalId, data.cols, data.rows);
                    break;

                case 'close-terminal':
                    this.closeTerminal(data.terminalId);
                    break;

                case 'acknowledge-data':
                    this.acknowledgeData(data.terminalId, data.byteCount);
                    break;

                default:
                    error('[PTY Host] Unknown message type:', type);
            }
        } catch (err) {
            error('[PTY Host] Error handling message:', err);
            this.sendToRenderer({ type: 'error', error: err.message });
        }
    }

    /**
     * Setup MessagePort for direct renderer communication
     */
    setupMessagePort() {
        if (!this.messagePort) return;

        this.messagePort.on('message', (message) => {
            // Handle messages from renderer
            this.handleMessage(message);
        });

        this.messagePort.start();
    }

    /**
     * Send message to renderer (via MessagePort if available, otherwise parent)
     */
    sendToRenderer(message) {
        if (this.messagePort) {
            // Direct to renderer (lowest latency)
            this.messagePort.postMessage(message);
        } else {
            // Fallback to parent process
            process.send(message);
        }
    }

    /**
     * Detect shell
     */
    detectShell() {
        if (process.platform === 'win32') {
            return process.env.COMSPEC || 'cmd.exe';
        } else {
            return process.env.SHELL || '/bin/bash';
        }
    }

    /**
     * Setup environment
     */
    setupEnvironment(customEnv = {}) {
        const env = { ...process.env };

        env.TERM = env.TERM || 'xterm-256color';
        env.COLORTERM = 'truecolor';
        env.SWARM_IDE_TERM = 'true';
        env.TERM_PROGRAM = 'swarm-ide';

        // Force UTF-8
        const utf8Locale = 'en_US.UTF-8';
        if (!env.LANG || !env.LANG.includes('UTF-8')) {
            env.LANG = utf8Locale;
        }
        env.LC_ALL = utf8Locale;
        env.LC_CTYPE = utf8Locale;
        env.LESSCHARSET = 'utf-8';

        // Merge custom environment
        Object.assign(env, customEnv);

        return env;
    }

    /**
     * Create terminal
     */
    createTerminal(options = {}) {
        const terminalId = this.nextTerminalId++;

        log('[PTY Host] Creating terminal', terminalId, options);

        try {
            const shell = options.shell || this.detectShell();
            const cwd = options.cwd || os.homedir();
            const env = this.setupEnvironment(options.env || {});
            const cols = options.cols || 80;
            const rows = options.rows || 24;

            // Validate cwd
            if (!fs.existsSync(cwd)) {
                throw new Error(`Working directory does not exist: ${cwd}`);
            }

            // Spawn PTY
            const ptyProcess = pty.spawn(shell, [], {
                name: 'xterm-256color',
                cols: cols,
                rows: rows,
                cwd: cwd,
                env: env
            });

            log('[PTY Host] PTY spawned:', {
                terminalId,
                pid: ptyProcess.pid,
                shell,
                cwd,
                size: `${cols}x${rows}`
            });

            // Create bufferer for this terminal
            const bufferer = new TerminalDataBufferer(terminalId, (tid, data) => {
                const sendTime = Date.now();
                latencyLog(`[LATENCY] 📤 SENDING TO RENDERER at ${sendTime}: ${data.length} bytes`);

                // Send buffered data to renderer
                this.sendToRenderer({
                    type: 'terminal-data',
                    terminalId: tid,
                    data: data
                });

                // Track for flow control
                const terminal = this.terminals.get(tid);
                if (terminal && terminal.flowController) {
                    terminal.flowController.dataSent(data.length);
                }
            });

            // Create flow controller
            const flowController = new FlowController(terminalId, ptyProcess);

            // Store terminal
            this.terminals.set(terminalId, {
                ptyProcess,
                bufferer,
                flowController,
                shell,
                cwd,
                pid: ptyProcess.pid,
                cols,
                rows,
                createdAt: Date.now()
            });

            // Handle PTY data output (buffer it)
            ptyProcess.onData((data) => {
                const ptyDataTime = Date.now();
                latencyLog(`[LATENCY] 📊 PTY OUTPUT at ${ptyDataTime}: ${data.length} bytes (will be buffered)`);
                bufferer.push(data);
            });

            // Handle PTY exit
            ptyProcess.onExit(({ exitCode, signal }) => {
                log('[PTY Host] Terminal', terminalId, 'exited:', { exitCode, signal });

                // Cleanup
                bufferer.dispose();
                this.terminals.delete(terminalId);

                // Notify renderer
                this.sendToRenderer({
                    type: 'terminal-exit',
                    terminalId: terminalId,
                    exitCode: exitCode,
                    signal: signal
                });
            });

            // Notify renderer of success
            this.sendToRenderer({
                type: 'terminal-created',
                terminalId: terminalId,
                pid: ptyProcess.pid,
                shell: shell,
                cwd: cwd
            });

        } catch (err) {
            error('[PTY Host] Failed to create terminal:', err);
            this.sendToRenderer({
                type: 'terminal-create-failed',
                error: err.message
            });
        }
    }

    /**
     * Write to terminal
     */
    writeTerminal(terminalId, data) {
        const writeReceiveTime = Date.now();
        latencyLog(`[LATENCY] 📝 WRITE RECEIVED at ${writeReceiveTime}: "${data.replace(/\r/g, '\\r').replace(/\n/g, '\\n')}" (${data.length} bytes)`);

        const terminal = this.terminals.get(terminalId);
        if (!terminal) {
            error('[PTY Host] Terminal not found:', terminalId);
            return;
        }

        try {
            const beforePtyWrite = Date.now();
            terminal.ptyProcess.write(data);
            const afterPtyWrite = Date.now();
            latencyLog(`[LATENCY] 📝 PTY WRITE at ${afterPtyWrite} (${afterPtyWrite - beforePtyWrite}ms duration)`);
        } catch (err) {
            error('[PTY Host] Error writing to terminal:', err);
        }
    }

    /**
     * Resize terminal
     */
    resizeTerminal(terminalId, cols, rows) {
        const terminal = this.terminals.get(terminalId);
        if (!terminal) {
            error('[PTY Host] Terminal not found:', terminalId);
            return;
        }

        try {
            terminal.ptyProcess.resize(cols, rows);
            terminal.cols = cols;
            terminal.rows = rows;
            // NO LOGGING - called frequently!
        } catch (err) {
            error('[PTY Host] Error resizing terminal:', err);
        }
    }

    /**
     * Close terminal
     */
    closeTerminal(terminalId) {
        const terminal = this.terminals.get(terminalId);
        if (!terminal) {
            error('[PTY Host] Terminal not found:', terminalId);
            return;
        }

        try {
            terminal.bufferer.dispose();
            terminal.ptyProcess.kill();
            this.terminals.delete(terminalId);
            log('[PTY Host] Terminal', terminalId, 'closed');
        } catch (err) {
            error('[PTY Host] Error closing terminal:', err);
        }
    }

    /**
     * Acknowledge data received by renderer (flow control)
     */
    acknowledgeData(terminalId, byteCount) {
        const terminal = this.terminals.get(terminalId);
        if (!terminal) return;

        terminal.flowController.dataAcknowledged(byteCount);
    }

    /**
     * Shutdown
     */
    shutdown() {
        log('[PTY Host] Shutting down, closing', this.terminals.size, 'terminals');

        for (const [terminalId, terminal] of this.terminals) {
            try {
                terminal.bufferer.dispose();
                terminal.ptyProcess.kill();
            } catch (err) {
                error('[PTY Host] Error killing terminal', terminalId, ':', err);
            }
        }

        this.terminals.clear();
        log('[PTY Host] Shutdown complete');
        process.exit(0);
    }
}

// Start PTY Host
const ptyHost = new PTYHost();

log('[PTY Host] Ready, PID:', process.pid);

/**
 * Terminal - xterm.js-based terminal component
 *
 * Renders a terminal using xterm.js and communicates with the backend
 * TerminalService via IPC for real PTY input/output.
 *
 * Architecture inspired by VS Code's XtermTerminal and Zed's terminal implementation.
 */

const { Terminal: XTerm } = require('xterm');
const { FitAddon } = require('xterm-addon-fit');
const { WebLinksAddon } = require('xterm-addon-web-links');
const { WebglAddon } = require('xterm-addon-webgl');
const { ipcRenderer } = require('electron');
const eventBus = require('../../modules/EventBus');
const logger = require('../../utils/Logger');

class Terminal {
    /**
     * Create a new Terminal instance
     * @param {HTMLElement} container - Container element for the terminal
     * @param {Object} options - Terminal options
     * @param {string} [options.cwd] - Working directory
     * @param {Object} [options.env] - Environment variables
     * @param {string} [options.shell] - Shell to use
     * @param {string} [options.type] - Terminal type: 'local' or 'ssh'
     * @param {string} [options.sshConnectionId] - SSH connection ID (for SSH terminals)
     */
    constructor(container, options = {}) {
        this.container = container;
        this.options = options;
        this.terminalId = null;
        this.xterm = null;
        this.fitAddon = null;
        this.webglAddon = null;  // Hardware-accelerated rendering
        this.isAttached = false;
        this.resizeObserver = null;
        this.resizeInterval = null;  // High-frequency resize check
        this.lastWidth = 0;
        this.lastHeight = 0;
        this.terminalType = options.type || 'local'; // 'local' or 'ssh'
        this.sshConnectionId = options.sshConnectionId || null;

        // PTY Host direct connection (for local terminals only)
        this.ptyHostPort = null;  // Direct MessagePort to PTY host
        this.ptyHostConnected = false;
        this.unacknowledgedBytes = 0;  // Flow control

        // CRITICAL FIX: Debouncing for resize to prevent race conditions
        this.resizeDebounceTimer = null;
        this.isResizing = false;  // Flag to prevent concurrent resizes
        this.pendingResize = false;  // Flag to indicate a resize is pending
        this.RESIZE_DEBOUNCE_DELAY = 16;  // ~60fps, balance between responsiveness and performance

        logger.debug('terminal', 'Terminal component created', { type: this.terminalType, sshConnectionId: this.sshConnectionId });
    }

    /**
     * Initialize and attach the terminal
     */
    async init() {
        try {
            logger.debug('terminal', 'Initializing terminal...');

            // Create xterm.js instance with optimal configuration for Unicode
            this.xterm = new XTerm({
                cursorBlink: true,
                cursorStyle: 'block',
                // Fonts optimized for both code and Unicode block characters
                fontFamily: '"Cascadia Code", "Fira Code", "JetBrains Mono", "DejaVu Sans Mono", Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace, "Noto Color Emoji", "Apple Color Emoji", "Segoe UI Emoji", "Symbola"',
                fontSize: 14,
                lineHeight: 1,  // CRITICAL: Must be 1 for pixel-perfect box character alignment
                letterSpacing: 0,
                fontWeight: 'normal',
                fontWeightBold: 'bold',
                minimumContrastRatio: 1,
                drawBoldTextInBrightColors: true,
                allowProposedApi: true,
                // CRITICAL: customGlyphs draws pixel-perfect box drawing characters
                // This is THE solution for proper block character rendering
                customGlyphs: true,
                // Canvas renderer is required for customGlyphs (doesn't work with DOM)
                rendererType: 'canvas',
                smoothScrollDuration: 0,
                theme: {
                    background: '#1e1e1e',
                    foreground: '#d4d4d4',
                    cursor: '#ffffff',
                    cursorAccent: '#000000',
                    selectionBackground: 'rgba(255, 255, 255, 0.3)',
                    selectionForeground: undefined,
                    black: '#000000',
                    red: '#cd3131',
                    green: '#0dbc79',
                    yellow: '#e5e510',
                    blue: '#2472c8',
                    magenta: '#bc3fbc',
                    cyan: '#11a8cd',
                    white: '#e5e5e5',
                    brightBlack: '#666666',
                    brightRed: '#f14c4c',
                    brightGreen: '#23d18b',
                    brightYellow: '#f5f543',
                    brightBlue: '#3b8eea',
                    brightMagenta: '#d670d6',
                    brightCyan: '#29b8db',
                    brightWhite: '#ffffff'
                },
                allowTransparency: false,
                scrollback: 10000,
                convertEol: false,
                fastScrollModifier: 'shift',
                fastScrollSensitivity: 5,
                scrollSensitivity: 1,
                windowsMode: false,
                macOptionIsMeta: true,
                macOptionClickForcesSelection: false,
                rightClickSelectsWord: true,
                rendererType: 'canvas', // Use canvas for better performance
                windowOptions: {
                    setWinSizePixels: false
                }
            });

            // Add fit addon (essential for proper sizing)
            this.fitAddon = new FitAddon();
            this.xterm.loadAddon(this.fitAddon);

            // Add web links addon (makes URLs clickable)
            const webLinksAddon = new WebLinksAddon();
            this.xterm.loadAddon(webLinksAddon);

            // Open terminal in container
            this.xterm.open(this.container);

            // Enable hardware-accelerated WebGL rendering
            // Inspired by VS Code's terminal for ultra-smooth rendering
            try {
                this.webglAddon = new WebglAddon();
                this.webglAddon.onContextLoss(() => {
                    // Fallback to canvas if WebGL context is lost
                    logger.warn('terminal', 'WebGL context lost, disposing WebGL addon');
                    this.webglAddon.dispose();
                    this.webglAddon = null;
                });
                this.xterm.loadAddon(this.webglAddon);
                logger.debug('terminal', '✓ WebGL renderer enabled for hardware acceleration');
            } catch (error) {
                logger.warn('terminal', 'WebGL not available, using canvas renderer:', error.message);
                this.webglAddon = null;
            }

            // Enable Unicode 11 support for proper emoji rendering
            // xterm.js 5.x has built-in Unicode support, just need to ensure it's active
            if (this.xterm.unicode) {
                this.xterm.unicode.activeVersion = '11';
                logger.debug('terminal', 'Unicode version set to 11 for emoji support');
            }

            // CRITICAL: Auto-focus terminal on click for keyboard input
            this.container.addEventListener('click', () => {
                this.xterm.focus();
            });

            // CRITICAL: Auto-focus immediately after opening
            setTimeout(() => {
                this.xterm.focus();
            }, 100);

            // Fit terminal to container size
            this.fitAddon.fit();

            // Get terminal dimensions
            const cols = this.xterm.cols;
            const rows = this.xterm.rows;

            logger.debug('terminal', 'xterm.js initialized:', { cols, rows });

            // Create terminal backend (local PTY or SSH shell)
            let result;
            if (this.terminalType === 'ssh') {
                // Create SSH shell
                logger.debug('terminal', 'Creating SSH terminal for connection:', this.sshConnectionId);
                result = await ipcRenderer.invoke('ssh-terminal-create', this.sshConnectionId, {
                    cols: cols,
                    rows: rows
                });
            } else {
                // Create local PTY
                result = await ipcRenderer.invoke('terminal-create', {
                    cwd: this.options.cwd,
                    env: this.options.env,
                    shell: this.options.shell,
                    cols: cols,
                    rows: rows
                });
            }

            if (!result.success) {
                throw new Error(result.error || 'Failed to create terminal');
            }

            this.terminalId = result.terminalId;

            logger.debug('terminal', '✓ Terminal created:', {
                type: this.terminalType,
                terminalId: this.terminalId,
                pid: result.pid,
                shell: result.shell,
                cwd: result.cwd
            });

            // Setup direct PTY host connection for local terminals (ultra-low latency)
            if (this.terminalType === 'local') {
                await this.setupPTYHostConnection();
            }

            // Setup event listeners
            this.setupEventListeners();

            // Setup IPC listeners
            this.setupIPCListeners();

            // Setup resize observer
            this.setupResizeObserver();

            // Setup 240Hz resize check for ultra-responsive resizing
            this.setup240HzResizeCheck();

            this.isAttached = true;

            logger.debug('terminal', '✓ Terminal initialized successfully');

            // Emit ready event
            eventBus.emit('terminal:ready', { terminalId: this.terminalId });

            return {
                success: true,
                terminalId: this.terminalId
            };

        } catch (error) {
            logger.error('terminal', 'Failed to initialize terminal:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Setup xterm.js event listeners
     */
    setupEventListeners() {
        // Handle user input
        this.xterm.onData((data) => {
            if (this.terminalId !== null) {
                const inputTimestamp = performance.now();

                console.log(`[LATENCY] ⌨️  INPUT at ${inputTimestamp.toFixed(3)}ms: "${data.replace(/\r/g, '\\r').replace(/\n/g, '\\n')}" (${data.length} bytes)`);

                logger.debug('terminal', 'Data input to terminal:', {
                    terminalId: this.terminalId,
                    dataLength: data.length,
                    dataPreview: data.substring(0, 50),
                    timestamp: inputTimestamp
                });

                // Store timestamp for latency measurement
                this.lastInputTimestamp = inputTimestamp;

                // Send input to backend (PTY or SSH shell)
                const writeHandler = this.terminalType === 'ssh' ? 'ssh-terminal-write' : 'terminal-write';
                ipcRenderer.invoke(writeHandler, this.terminalId, data).then(() => {
                    const ipcSentTimestamp = performance.now();
                    console.log(`[LATENCY] 📤 IPC SENT at ${ipcSentTimestamp.toFixed(3)}ms (${(ipcSentTimestamp - inputTimestamp).toFixed(3)}ms after input)`);
                }).catch(err => {
                    logger.error('terminal', 'Error writing to terminal:', err);
                });
            }
        });

        // Handle resize (NO DEBUG LOGGING - fires constantly!)
        this.xterm.onResize(({ cols, rows }) => {
            if (this.terminalId !== null) {
                // Notify backend to resize (PTY or SSH shell) - NO LOGGING for performance
                const resizeHandler = this.terminalType === 'ssh' ? 'ssh-terminal-resize' : 'terminal-resize';
                ipcRenderer.invoke(resizeHandler, this.terminalId, cols, rows).catch(err => {
                    logger.error('terminal', 'Error resizing terminal:', err);
                });
            }
        });

        // Handle title change
        this.xterm.onTitleChange((title) => {
            logger.debug('terminal', 'Title changed:', title);
            eventBus.emit('terminal:titleChange', { terminalId: this.terminalId, title });
        });

        // Setup copy/paste keyboard shortcuts
        // IMPORTANT: Don't preventDefault on normal keys - let xterm.js handle them!
        this.container.addEventListener('keydown', (e) => {
            const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
            const ctrlOrCmd = isMac ? e.metaKey : e.ctrlKey;

            // Ctrl+Shift+C / Cmd+Shift+C - Copy
            if (ctrlOrCmd && e.shiftKey && e.key === 'C') {
                e.preventDefault();
                e.stopPropagation();
                const selection = this.xterm.getSelection();
                if (selection) {
                    logger.debug('terminal', 'Copying text:', selection.substring(0, 50));
                    navigator.clipboard.writeText(selection).then(() => {
                        logger.debug('terminal', '✓ Text copied to clipboard');
                    }).catch(err => {
                        logger.error('terminal', 'Failed to copy:', err);
                    });
                }
                return;
            }

            // Ctrl+Shift+V / Cmd+Shift+V - Paste
            if (ctrlOrCmd && e.shiftKey && e.key === 'V') {
                e.preventDefault();
                e.stopPropagation();
                logger.debug('terminal', 'Paste triggered');
                navigator.clipboard.readText().then(text => {
                    if (text) {
                        logger.debug('terminal', 'Pasting text:', text.substring(0, 50));
                        this.xterm.paste(text);
                    }
                }).catch(err => {
                    logger.error('terminal', 'Failed to paste:', err);
                });
                return;
            }

            // Let all other keys pass through to xterm.js
            // This includes: arrow keys, Enter, Esc, Tab, function keys, etc.
        });
    }

    /**
     * Setup direct MessagePort connection to PTY host
     * This bypasses the main process for ultra-low latency
     */
    async setupPTYHostConnection() {
        try {
            logger.debug('terminal', 'Setting up direct PTY host connection...');

            // Request MessagePort from main process
            await ipcRenderer.invoke('terminal-setup-direct-connection');

            // Wait for MessagePort transfer
            return new Promise((resolve) => {
                ipcRenderer.once('pty-port-transfer', (event) => {
                    // Get the transferred MessagePort from event.ports
                    const port = event.ports[0];
                    if (port) {
                        this.ptyHostPort = port;

                        // Setup message handler for direct PTY host messages
                        this.ptyHostPort.onmessage = (event) => {
                            this.handlePTYHostMessage(event.data);
                        };

                        this.ptyHostPort.start();
                        this.ptyHostConnected = true;

                        logger.debug('terminal', '✓ Direct PTY host connection established');
                        resolve();
                    } else {
                        logger.error('terminal', 'No MessagePort received');
                        resolve();
                    }
                });

                // Timeout after 5 seconds
                setTimeout(() => {
                    if (!this.ptyHostConnected) {
                        logger.warn('terminal', 'PTY host connection timeout, falling back to IPC');
                        resolve();
                    }
                }, 5000);
            });
        } catch (error) {
            logger.error('terminal', 'Failed to setup PTY host connection:', error);
        }
    }

    /**
     * Handle message from PTY host via direct MessagePort
     */
    handlePTYHostMessage(message) {
        const { type, terminalId, data: messageData } = message;

        // Only handle messages for this terminal
        if (terminalId && terminalId !== this.terminalId) {
            return;
        }

        switch (type) {
            case 'terminal-data':
                const receiveTimestamp = performance.now();
                console.log(`[LATENCY] 📥 RECEIVED at ${receiveTimestamp.toFixed(3)}ms: ${messageData.length} bytes`);

                if (this.lastInputTimestamp) {
                    const roundTripTime = receiveTimestamp - this.lastInputTimestamp;
                    console.log(`[LATENCY] 🔄 ROUND TRIP: ${roundTripTime.toFixed(3)}ms`);
                }

                // Data from PTY host (buffered, batched)
                const beforeWrite = performance.now();
                this.xterm.write(messageData, () => {
                    const afterWrite = performance.now();
                    console.log(`[LATENCY] ✍️  XTERM WRITE at ${afterWrite.toFixed(3)}ms (${(afterWrite - beforeWrite).toFixed(3)}ms duration)`);

                    if (this.lastInputTimestamp) {
                        const totalLatency = afterWrite - this.lastInputTimestamp;
                        console.log(`[LATENCY] ⚡ TOTAL LATENCY: ${totalLatency.toFixed(3)}ms (input -> display)`);
                    }
                });

                // Flow control: Acknowledge received data
                this.acknowledgeData(messageData.length);
                break;

            case 'terminal-created':
                logger.debug('terminal', 'PTY host confirmed terminal creation:', message);
                break;

            case 'terminal-exit':
                logger.debug('terminal', 'Terminal exited:', message);
                const exitMsg = `\r\n\x1b[1;31m[Process exited with code ${message.exitCode}]\x1b[0m\r\n`;
                this.xterm.write(exitMsg);
                eventBus.emit('terminal:exit', { terminalId: this.terminalId, exitCode: message.exitCode, signal: message.signal });
                this.terminalId = null;
                break;

            case 'terminal-create-failed':
                logger.error('terminal', 'PTY host failed to create terminal:', message.error);
                break;

            case 'error':
                logger.error('terminal', 'PTY host error:', message.error);
                break;

            default:
                logger.warn('terminal', 'Unknown PTY host message type:', type);
        }
    }

    /**
     * Acknowledge data received from PTY host (flow control)
     * This prevents overwhelming the renderer with rapid data
     */
    acknowledgeData(byteCount) {
        if (!this.ptyHostConnected || !this.terminalId) return;

        this.unacknowledgedBytes -= byteCount;

        // Send acknowledgment to PTY host (via main process for now)
        // TODO: Could send directly via MessagePort if needed
        ipcRenderer.invoke('terminal-acknowledge-data', this.terminalId, byteCount).catch(err => {
            logger.error('terminal', 'Error acknowledging data:', err);
        });
    }

    /**
     * Setup IPC listeners for terminal events from backend
     * Handles both direct PTY host messages and SSH terminal messages
     */
    setupIPCListeners() {
        // Listen for PTY host messages (forwarded by main process as fallback)
        this.ptyHostListener = (event, message) => {
            if (!this.ptyHostConnected) {
                // Use IPC messages if direct connection failed
                this.handlePTYHostMessage(message);
            }
        };
        ipcRenderer.on('pty-host-message', this.ptyHostListener);

        // Listen for terminal data from backend (SSH terminals use this)
        this.dataListener = (event, { terminalId, data }) => {
            if (terminalId === this.terminalId) {
                // Debug logging to track corruption
                // Check for 5+ repeated W characters (upper or lowercase)
                const hasWCharacters = /[Ww]{5,}/.test(data);
                const dataPreview = data.substring(0, 200);

                // Also log the hex representation to see control characters
                const hexPreview = Array.from(data.substring(0, 100))
                    .map(c => c.charCodeAt(0).toString(16).padStart(2, '0'))
                    .join(' ');

                logger.debug('terminal', 'Received data from backend:', {
                    terminalId: this.terminalId,
                    dataLength: data.length,
                    dataPreview: dataPreview,
                    hexPreview: hexPreview,
                    hasRepeatedW: hasWCharacters,
                    xterm: {
                        cols: this.xterm.cols,
                        rows: this.xterm.rows,
                        cursorX: this.xterm.buffer.active.cursorX,
                        cursorY: this.xterm.buffer.active.cursorY
                    },
                    container: {
                        width: this.container.clientWidth,
                        height: this.container.clientHeight,
                        display: this.container.style.display,
                        visible: this.container.offsetParent !== null
                    }
                });

                if (hasWCharacters) {
                    logger.warn('terminal', '⚠️ CORRUPTION DETECTED: Repeated W characters in data!', {
                        terminalId: this.terminalId,
                        fullData: data,
                        fullDataHex: Array.from(data).map(c => c.charCodeAt(0).toString(16).padStart(2, '0')).join(' '),
                        dataLength: data.length,
                        timestamp: Date.now(),
                        ptyInfo: 'Check if PTY is sending corrupt data or if rendering is broken'
                    });
                }

                // Write data to xterm display
                this.xterm.write(data);
            }
        };
        ipcRenderer.on('terminal-data', this.dataListener);

        // Listen for terminal exit from backend
        this.exitListener = (event, { terminalId, exitCode, signal }) => {
            if (terminalId === this.terminalId) {
                logger.debug('terminal', 'Terminal exited:', { exitCode, signal });

                // Display exit message
                const exitMsg = `\r\n\x1b[1;31m[Process exited with code ${exitCode}]\x1b[0m\r\n`;
                this.xterm.write(exitMsg);

                // Emit exit event
                eventBus.emit('terminal:exit', { terminalId: this.terminalId, exitCode, signal });

                // Clear terminal ID
                this.terminalId = null;
            }
        };
        ipcRenderer.on('terminal-exit', this.exitListener);
    }

    /**
     * Setup resize observer to handle container size changes
     */
    setupResizeObserver() {
        // Use ResizeObserver to detect container size changes
        this.resizeObserver = new ResizeObserver((entries) => {
            if (this.fitAddon && this.isAttached) {
                try {
                    const entry = entries[0];

                    // CRITICAL FIX: Skip resize if container is hidden (display: none)
                    // This prevents resizing to collapsed dimensions when terminals are switched
                    const isVisible = this.container.style.display !== 'none' &&
                                     this.container.offsetParent !== null &&
                                     this.container.clientWidth > 0 &&
                                     this.container.clientHeight > 0;

                    logger.debug('terminal', 'ResizeObserver triggered:', {
                        terminalId: this.terminalId,
                        contentRect: {
                            width: entry.contentRect.width,
                            height: entry.contentRect.height
                        },
                        container: {
                            display: this.container.style.display,
                            visibility: this.container.style.visibility,
                            visible: this.container.offsetParent !== null,
                            clientWidth: this.container.clientWidth,
                            clientHeight: this.container.clientHeight,
                            isVisible: isVisible
                        },
                        xterm: {
                            cols: this.xterm.cols,
                            rows: this.xterm.rows
                        }
                    });

                    if (!isVisible) {
                        logger.debug('terminal', 'Skipping resize - container is hidden');
                        return;
                    }

                    // Use debounced resize to prevent race conditions with other resize mechanisms
                    this.debouncedResize();
                } catch (error) {
                    logger.error('terminal', 'Error fitting terminal in ResizeObserver:', error);
                }
            } else {
                logger.debug('terminal', 'ResizeObserver triggered but skipped:', {
                    hasFitAddon: !!this.fitAddon,
                    isAttached: this.isAttached
                });
            }
        });

        this.resizeObserver.observe(this.container);
        logger.debug('terminal', 'ResizeObserver set up for terminal:', this.terminalId);
    }

    /**
     * Setup 240Hz resize check for ultra-responsive terminal resizing
     */
    setup240HzResizeCheck() {
        // 240Hz = 1000ms / 240 = ~4.17ms per frame
        const RESIZE_CHECK_INTERVAL = Math.floor(1000 / 240);

        this.resizeInterval = setInterval(() => {
            if (!this.fitAddon || !this.isAttached || !this.xterm) {
                return;
            }

            try {
                // Quick visibility check (no logging here - too frequent!)
                const isVisible = this.container.style.display !== 'none' &&
                                 this.container.offsetParent !== null;

                if (!isVisible) {
                    return;
                }

                const currentWidth = this.container.clientWidth;
                const currentHeight = this.container.clientHeight;

                // Only refit if dimensions actually changed
                if (currentWidth !== this.lastWidth || currentHeight !== this.lastHeight) {
                    this.lastWidth = currentWidth;
                    this.lastHeight = currentHeight;

                    // Only refit if dimensions are valid
                    if (currentWidth > 0 && currentHeight > 0) {
                        // Use debounced resize to prevent race conditions
                        // NO LOGGING HERE - runs 240 times per second!
                        this.debouncedResize();
                    }
                }
            } catch (error) {
                // Silently ignore errors in high-frequency loop
            }
        }, RESIZE_CHECK_INTERVAL);

        logger.debug('terminal', '240Hz resize check enabled (silent mode) for terminal:', this.terminalId);
    }

    /**
     * Debounced resize - prevents multiple concurrent resize operations
     * All resize mechanisms (ResizeObserver, 240Hz polling, manual) should call this
     */
    debouncedResize() {
        // Clear any existing debounce timer
        if (this.resizeDebounceTimer) {
            clearTimeout(this.resizeDebounceTimer);
        }

        // If already resizing, mark that we need another resize after this one completes
        if (this.isResizing) {
            this.pendingResize = true;
            return;
        }

        // Schedule the resize
        this.resizeDebounceTimer = setTimeout(() => {
            this.performResize();
        }, this.RESIZE_DEBOUNCE_DELAY);
    }

    /**
     * Perform the actual resize operation
     * Internal method called by debouncedResize()
     */
    performResize() {
        if (!this.fitAddon || !this.isAttached || !this.xterm) {
            return;
        }

        // Check if container is visible
        const isVisible = this.container.style.display !== 'none' &&
                         this.container.offsetParent !== null &&
                         this.container.clientWidth > 0 &&
                         this.container.clientHeight > 0;

        if (!isVisible) {
            return;
        }

        // Set resizing flag to prevent concurrent operations
        this.isResizing = true;

        try {
            const currentCols = this.xterm.cols;
            const currentRows = this.xterm.rows;

            // Perform the resize
            this.fitAddon.fit();

            const newCols = this.xterm.cols;
            const newRows = this.xterm.rows;

            // If size changed, refresh the display to prevent corruption
            if (currentCols !== newCols || currentRows !== newRows) {
                this.xterm.refresh(0, this.xterm.rows - 1);
                logger.debug('terminal', 'Terminal resized:', {
                    terminalId: this.terminalId,
                    from: { cols: currentCols, rows: currentRows },
                    to: { cols: newCols, rows: newRows }
                });
            }
        } catch (error) {
            logger.error('terminal', 'Error performing resize:', error);
        } finally {
            // Clear resizing flag
            this.isResizing = false;

            // If a resize was requested while we were resizing, perform it now
            if (this.pendingResize) {
                this.pendingResize = false;
                // Use a small delay to avoid immediate re-entry
                setTimeout(() => this.debouncedResize(), 10);
            }
        }
    }

    /**
     * Manually trigger terminal resize
     * Public API - uses debounced resize internally
     */
    resize() {
        this.debouncedResize();
    }

    /**
     * Write text to terminal
     * @param {string} text - Text to write
     */
    write(text) {
        if (this.xterm) {
            this.xterm.write(text);
        }
    }

    /**
     * Clear terminal
     */
    clear() {
        if (this.xterm) {
            this.xterm.clear();
        }
    }

    /**
     * Focus terminal
     */
    focus() {
        if (this.xterm) {
            this.xterm.focus();
        }
    }

    /**
     * Scroll to bottom
     */
    scrollToBottom() {
        if (this.xterm) {
            this.xterm.scrollToBottom();
        }
    }

    /**
     * Get terminal ID
     */
    getTerminalId() {
        return this.terminalId;
    }

    /**
     * Get terminal info from backend
     */
    async getInfo() {
        if (this.terminalId === null) {
            return { success: false, error: 'Terminal not initialized' };
        }

        try {
            const result = await ipcRenderer.invoke('terminal-get-info', this.terminalId);
            return result;
        } catch (error) {
            logger.error('terminal', 'Error getting terminal info:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Destroy terminal
     */
    async destroy() {
        logger.debug('terminal', 'Destroying terminal:', this.terminalId);

        // Remove IPC listeners
        if (this.dataListener) {
            ipcRenderer.removeListener('terminal-data', this.dataListener);
        }
        if (this.exitListener) {
            ipcRenderer.removeListener('terminal-exit', this.exitListener);
        }

        // Clear 240Hz resize interval
        if (this.resizeInterval) {
            clearInterval(this.resizeInterval);
            this.resizeInterval = null;
        }

        // Clear resize debounce timer
        if (this.resizeDebounceTimer) {
            clearTimeout(this.resizeDebounceTimer);
            this.resizeDebounceTimer = null;
        }

        // Disconnect resize observer
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
            this.resizeObserver = null;
        }

        // Close backend terminal (PTY or SSH shell)
        if (this.terminalId !== null) {
            try {
                const closeHandler = this.terminalType === 'ssh' ? 'ssh-terminal-close' : 'terminal-close';
                await ipcRenderer.invoke(closeHandler, this.terminalId);
                logger.debug('terminal', '✓ Backend terminal closed');
            } catch (error) {
                logger.error('terminal', 'Error closing backend terminal:', error);
            }
            this.terminalId = null;
        }

        // Dispose xterm instance
        if (this.xterm) {
            this.xterm.dispose();
            this.xterm = null;
            logger.debug('terminal', '✓ xterm.js disposed');
        }

        this.fitAddon = null;
        this.isAttached = false;

        logger.debug('terminal', '✓ Terminal destroyed successfully');

        // Emit destroyed event
        eventBus.emit('terminal:destroyed');
    }
}

module.exports = Terminal;

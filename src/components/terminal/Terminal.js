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
        this.isAttached = false;
        this.resizeObserver = null;
        this.resizeInterval = null;  // High-frequency resize check
        this.lastWidth = 0;
        this.lastHeight = 0;
        this.terminalType = options.type || 'local'; // 'local' or 'ssh'
        this.sshConnectionId = options.sshConnectionId || null;

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
                logger.debug('terminal', 'Data input to terminal:', {
                    terminalId: this.terminalId,
                    dataLength: data.length,
                    dataPreview: data.substring(0, 50)
                });

                // Send input to backend (PTY or SSH shell)
                const writeHandler = this.terminalType === 'ssh' ? 'ssh-terminal-write' : 'terminal-write';
                ipcRenderer.invoke(writeHandler, this.terminalId, data).catch(err => {
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
     * Setup IPC listeners for terminal events from backend
     */
    setupIPCListeners() {
        // Listen for terminal data from backend
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

                    this.fitAddon.fit();

                    logger.debug('terminal', 'ResizeObserver fit complete:', {
                        terminalId: this.terminalId,
                        newCols: this.xterm.cols,
                        newRows: this.xterm.rows
                    });
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
                        // NO LOGGING HERE - runs 240 times per second!
                        this.fitAddon.fit();
                    }
                }
            } catch (error) {
                // Silently ignore errors in high-frequency loop
            }
        }, RESIZE_CHECK_INTERVAL);

        logger.debug('terminal', '240Hz resize check enabled (silent mode) for terminal:', this.terminalId);
    }

    /**
     * Manually trigger terminal resize
     */
    resize() {
        if (this.fitAddon && this.isAttached && this.xterm) {
            try {
                logger.debug('terminal', 'Resizing terminal:', this.terminalId);
                logger.debug('terminal', 'Container dimensions:', {
                    width: this.container.clientWidth,
                    height: this.container.clientHeight,
                    display: this.container.style.display,
                    visibility: this.container.style.visibility
                });

                // Clear any corruption before resize
                const currentCols = this.xterm.cols;
                const currentRows = this.xterm.rows;
                logger.debug('terminal', 'Current terminal size:', { cols: currentCols, rows: currentRows });

                // Perform the resize
                this.fitAddon.fit();

                const newCols = this.xterm.cols;
                const newRows = this.xterm.rows;
                logger.debug('terminal', 'New terminal size:', { cols: newCols, rows: newRows });

                // If size changed, refresh the display
                if (currentCols !== newCols || currentRows !== newRows) {
                    logger.debug('terminal', 'Terminal size changed, refreshing display');
                    this.xterm.refresh(0, this.xterm.rows - 1);
                }

                logger.debug('terminal', '✓ Terminal manually resized');
            } catch (error) {
                logger.error('terminal', 'Error fitting terminal:', error);
                logger.error('terminal', 'Error stack:', error.stack);
            }
        } else {
            logger.warn('terminal', 'Cannot resize terminal:', {
                hasFitAddon: !!this.fitAddon,
                isAttached: this.isAttached,
                hasXterm: !!this.xterm
            });
        }
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

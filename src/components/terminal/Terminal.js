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
     */
    constructor(container, options = {}) {
        this.container = container;
        this.options = options;
        this.terminalId = null;
        this.xterm = null;
        this.fitAddon = null;
        this.isAttached = false;
        this.resizeObserver = null;

        logger.debug('terminal', 'Terminal component created');
    }

    /**
     * Initialize and attach the terminal
     */
    async init() {
        try {
            logger.debug('terminal', 'Initializing terminal...');

            // Create xterm.js instance
            this.xterm = new XTerm({
                cursorBlink: true,
                cursorStyle: 'block',
                fontFamily: 'Menlo, Monaco, "Courier New", monospace',
                fontSize: 14,
                lineHeight: 1.2,
                theme: {
                    background: '#1e1e1e',
                    foreground: '#d4d4d4',
                    cursor: '#ffffff',
                    cursorAccent: '#000000',
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
                convertEol: false
            });

            // Add fit addon (essential for proper sizing)
            this.fitAddon = new FitAddon();
            this.xterm.loadAddon(this.fitAddon);

            // Add web links addon (makes URLs clickable)
            const webLinksAddon = new WebLinksAddon();
            this.xterm.loadAddon(webLinksAddon);

            // Open terminal in container
            this.xterm.open(this.container);

            // Fit terminal to container size
            this.fitAddon.fit();

            // Get terminal dimensions
            const cols = this.xterm.cols;
            const rows = this.xterm.rows;

            logger.debug('terminal', 'xterm.js initialized:', { cols, rows });

            // Create PTY in backend
            const result = await ipcRenderer.invoke('terminal-create', {
                cwd: this.options.cwd,
                env: this.options.env,
                shell: this.options.shell,
                cols: cols,
                rows: rows
            });

            if (!result.success) {
                throw new Error(result.error || 'Failed to create terminal');
            }

            this.terminalId = result.terminalId;

            logger.debug('terminal', '✓ PTY created:', {
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

                // Send input to backend PTY
                ipcRenderer.invoke('terminal-write', this.terminalId, data).catch(err => {
                    logger.error('terminal', 'Error writing to terminal:', err);
                });
            }
        });

        // Handle resize
        this.xterm.onResize(({ cols, rows }) => {
            if (this.terminalId !== null) {
                logger.debug('terminal', 'Terminal resize event fired:', {
                    terminalId: this.terminalId,
                    cols,
                    rows,
                    containerVisible: this.container.style.display !== 'none',
                    containerWidth: this.container.clientWidth,
                    containerHeight: this.container.clientHeight
                });

                // Notify backend to resize PTY
                ipcRenderer.invoke('terminal-resize', this.terminalId, cols, rows).catch(err => {
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
        this.container.addEventListener('keydown', (e) => {
            const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
            const ctrlOrCmd = isMac ? e.metaKey : e.ctrlKey;

            // Ctrl+Shift+C / Cmd+Shift+C - Copy
            if (ctrlOrCmd && e.shiftKey && e.key === 'C') {
                e.preventDefault();
                const selection = this.xterm.getSelection();
                if (selection) {
                    logger.debug('terminal', 'Copying text:', selection.substring(0, 50));
                    navigator.clipboard.writeText(selection).then(() => {
                        logger.debug('terminal', '✓ Text copied to clipboard');
                    }).catch(err => {
                        logger.error('terminal', 'Failed to copy:', err);
                    });
                }
            }

            // Ctrl+Shift+V / Cmd+Shift+V - Paste
            if (ctrlOrCmd && e.shiftKey && e.key === 'V') {
                e.preventDefault();
                logger.debug('terminal', 'Paste triggered');
                navigator.clipboard.readText().then(text => {
                    if (text) {
                        logger.debug('terminal', 'Pasting text:', text.substring(0, 50));
                        this.xterm.paste(text);
                    }
                }).catch(err => {
                    logger.error('terminal', 'Failed to paste:', err);
                });
            }
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

        // Disconnect resize observer
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
            this.resizeObserver = null;
        }

        // Close backend terminal
        if (this.terminalId !== null) {
            try {
                await ipcRenderer.invoke('terminal-close', this.terminalId);
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

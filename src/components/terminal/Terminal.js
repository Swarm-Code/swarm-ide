/**
 * Terminal - xterm.js wrapper component
 *
 * Simplified terminal implementation inspired by VSCode's architecture.
 * Wraps xterm.js with essential addons and provides a clean API for:
 * - Creating and displaying terminals
 * - Writing/reading data
 * - Resizing terminals
 * - Managing lifecycle
 *
 * Usage:
 *   const terminal = new Terminal(container, { cols: 80, rows: 24 });
 *   terminal.init();
 *   terminal.write('Hello World\r\n');
 */

const { Terminal: XtermTerminal } = require('xterm');
const { FitAddon } = require('@xterm/addon-fit');
const { WebLinksAddon } = require('@xterm/addon-web-links');
const { WebglAddon } = require('@xterm/addon-webgl');
const eventBus = require('../../modules/EventBus');
const logger = require('../../utils/Logger');

class Terminal {
    constructor(container, options = {}) {
        this.container = container;
        this.id = options.id || `terminal-${Date.now()}`;
        this.cols = options.cols || 80;
        this.rows = options.rows || 24;

        // Connection type: 'local' or 'ssh'
        this.connectionType = options.connectionType || 'local';
        this.connectionId = options.connectionId || null; // SSH connection ID (for SSH terminals)

        // xterm.js instance
        this.xterm = null;

        // Addons
        this.fitAddon = null;
        this.webLinksAddon = null;
        this.webglAddon = null;

        // PTY connection
        this.ptyId = null;

        // State
        this.isAttached = false;
        this.isDisposed = false;

        // Initial data buffering (VSCode pattern)
        // Buffer data events during initialization to prevent race conditions
        this._initialDataBuffer = [];
        this._isBufferingData = true;
        this._bufferTimeout = null;

        // Resize handling
        this._resizeObserver = null;
        this._resizeTimeout = null;

        logger.debug('terminal', `Terminal instance created: ${this.id}`);
    }

    /**
     * Initialize the terminal
     */
    async init() {
        if (this.xterm) {
            logger.warn('terminal', 'Terminal already initialized');
            return;
        }

        logger.debug('terminal', `Initializing terminal: ${this.id}`);

        // Create xterm.js instance (following official xterm.js initialization order)
        this.xterm = new XtermTerminal({
            cols: this.cols,
            rows: this.rows,
            cursorBlink: true,
            cursorStyle: 'block',
            fontFamily: 'Menlo, Monaco, "Courier New", monospace',
            fontSize: 14,
            letterSpacing: 0,
            lineHeight: 1.0,
            scrollback: 1000,
            tabStopWidth: 8,
            theme: this.getTheme(),
            allowProposedApi: true,
            windowOptions: {
                setWinSizePixels: false,
            },
        });

        // Create addon instances but DON'T load them yet
        // Per xterm.js docs: addons must be loaded AFTER terminal.open()
        this.fitAddon = new FitAddon();
        this.webLinksAddon = new WebLinksAddon();
        this.webglAddon = null; // Will be created after open()

        // Attach event listeners
        this.setupEventListeners();

        logger.debug('terminal', `Terminal initialized: ${this.id}`);
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Handle user input
        this.xterm.onData((data) => {
            if (this.ptyId) {
                // Send input to PTY (route based on connection type)
                if (this.connectionType === 'ssh') {
                    window.electronAPI.sshTerminalWrite(this.ptyId, data);
                } else {
                    window.electronAPI.terminalWrite(this.ptyId, data);
                }
            }
        });

        // Handle terminal resize
        this.xterm.onResize(({ cols, rows }) => {
            logger.debug('terminal', `Terminal resized: ${cols}x${rows}`);
            if (this.ptyId) {
                // Route resize based on connection type
                if (this.connectionType === 'ssh') {
                    window.electronAPI.sshTerminalResize(this.ptyId, cols, rows);
                } else {
                    window.electronAPI.terminalResize(this.ptyId, cols, rows);
                }
            }
        });

        // Handle selection changes
        this.xterm.onSelectionChange(() => {
            const selection = this.xterm.getSelection();
            if (selection) {
                // Could emit event or copy to clipboard
                eventBus.emit('terminal:selection-changed', { id: this.id, selection });
            }
        });

        // Setup keyboard shortcuts for copy/paste
        this.setupClipboardShortcuts();

        // Setup context menu for copy/paste
        this.setupContextMenu();

        logger.debug('terminal', 'Event listeners setup complete');
    }

    /**
     * Setup keyboard shortcuts for copy/paste
     * Ctrl+C, Ctrl+V (Windows/Linux) or Cmd+C, Cmd+V (Mac)
     */
    setupClipboardShortcuts() {
        if (!this.xterm) return;

        const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
        const ctrlOrCmd = isMac ? 'meta' : 'ctrl';

        this.xterm.attachCustomKeyEventHandler((arg) => {
            const { key, shiftKey, ctrlKey, altKey, metaKey } = arg;

            // Ctrl+C (Cmd+C on Mac) - Copy selection
            if ((isMac ? metaKey : ctrlKey) && key === 'c') {
                // Only copy if there's a selection
                const selection = this.xterm.getSelection();
                if (selection) {
                    navigator.clipboard.writeText(selection).then(() => {
                        logger.debug('terminal', 'Selection copied to clipboard');
                        eventBus.emit('notification:show', {
                            type: 'info',
                            message: 'Copied to clipboard',
                            duration: 2000
                        });
                    }).catch(err => {
                        logger.error('terminal', 'Failed to copy to clipboard:', err);
                    });
                    return false; // Prevent default
                }
                // If no selection, let it pass through to terminal
                return true;
            }

            // Ctrl+V (Cmd+V on Mac) - Paste from clipboard
            if ((isMac ? metaKey : ctrlKey) && key === 'v') {
                navigator.clipboard.readText().then((text) => {
                    if (this.ptyId && text) {
                        // Send pasted text to PTY
                        if (this.connectionType === 'ssh') {
                            window.electronAPI.sshTerminalWrite(this.ptyId, text);
                        } else {
                            window.electronAPI.terminalWrite(this.ptyId, text);
                        }
                        logger.debug('terminal', 'Text pasted from clipboard');
                        eventBus.emit('notification:show', {
                            type: 'info',
                            message: 'Pasted from clipboard',
                            duration: 2000
                        });
                    }
                }).catch(err => {
                    logger.error('terminal', 'Failed to paste from clipboard:', err);
                });
                return false; // Prevent default
            }

            // Ctrl+A (Cmd+A on Mac) - Select all
            if ((isMac ? metaKey : ctrlKey) && key === 'a' && !shiftKey && !altKey) {
                this.selectAll();
                return false; // Prevent default
            }

            return true;
        });

        logger.debug('terminal', 'Clipboard shortcuts configured');
    }

    /**
     * Setup context menu for copy/paste
     */
    setupContextMenu() {
        if (!this.xterm) return;

        // Store reference to current context menu
        this._currentContextMenu = null;

        // Handle right-click on terminal element
        this.container.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.showContextMenu(e.clientX, e.clientY);
        });

        logger.debug('terminal', 'Context menu configured');
    }

    /**
     * Show context menu for copy/paste
     */
    showContextMenu(x, y) {
        const selection = this.xterm.getSelection();

        // Destroy previous context menu if it exists
        if (this._currentContextMenu) {
            this._currentContextMenu.destroy();
            this._currentContextMenu = null;
        }

        // Create context menu items with onClick instead of action
        const items = [
            {
                label: 'Copy',
                disabled: !selection,
                onClick: () => {
                    this.copySelection();
                    this.closeContextMenu();
                }
            },
            {
                label: 'Paste',
                onClick: () => {
                    this.pasteFromClipboard();
                    this.closeContextMenu();
                }
            },
            { type: 'separator' },
            {
                label: 'Select All',
                onClick: () => {
                    this.selectAll();
                    this.closeContextMenu();
                }
            },
            {
                label: 'Clear',
                onClick: () => {
                    this.clear();
                    this.closeContextMenu();
                }
            }
        ];

        // Create and show context menu at correct position
        const ContextMenu = require('../ContextMenu');
        this._currentContextMenu = new ContextMenu(items);
        
        // Show with x, y coordinates
        this._currentContextMenu.show(x, y);
        
        logger.debug('terminal', 'Context menu shown at', x, y);
    }

    /**
     * Close current context menu
     */
    closeContextMenu() {
        if (this._currentContextMenu) {
            this._currentContextMenu.destroy();
            this._currentContextMenu = null;
            logger.debug('terminal', 'Context menu closed');
        }
    }

    /**
     * Copy selection to clipboard
     */
    copySelection() {
        const selection = this.xterm.getSelection();
        if (selection) {
            navigator.clipboard.writeText(selection).then(() => {
                logger.debug('terminal', 'Selection copied to clipboard');
                eventBus.emit('notification:show', {
                    type: 'success',
                    message: 'Copied to clipboard',
                    duration: 2000
                });
            }).catch(err => {
                logger.error('terminal', 'Failed to copy to clipboard:', err);
                eventBus.emit('notification:show', {
                    type: 'error',
                    message: 'Failed to copy to clipboard',
                    duration: 2000
                });
            });
        }
    }

    /**
     * Paste from clipboard
     */
    pasteFromClipboard() {
        navigator.clipboard.readText().then((text) => {
            if (this.ptyId && text) {
                // Send pasted text to PTY
                if (this.connectionType === 'ssh') {
                    window.electronAPI.sshTerminalWrite(this.ptyId, text);
                } else {
                    window.electronAPI.terminalWrite(this.ptyId, text);
                }
                logger.debug('terminal', 'Text pasted from clipboard');
                eventBus.emit('notification:show', {
                    type: 'success',
                    message: 'Pasted from clipboard',
                    duration: 2000
                });
            }
        }).catch(err => {
            logger.error('terminal', 'Failed to paste from clipboard:', err);
            eventBus.emit('notification:show', {
                type: 'error',
                message: 'Failed to paste from clipboard',
                duration: 2000
            });
        });
    }

    /**
     * Attach terminal to DOM and create PTY
     */
    async attach() {
        if (this.isAttached) {
            logger.warn('terminal', 'Terminal already attached');
            return;
        }

        logger.debug('terminal', 'Attaching terminal to DOM');

        // CRITICAL: Follow xterm.js initialization order
        // 1. Open terminal in DOM FIRST
        this.xterm.open(this.container);
        this.isAttached = true;

        // Log container dimensions immediately after open
        const rectAfterOpen = this.container.getBoundingClientRect();
        console.log(`[TERMINAL ${this.id}] Container after open():`, {
            width: rectAfterOpen.width,
            height: rectAfterOpen.height,
            top: rectAfterOpen.top,
            left: rectAfterOpen.left,
            className: this.container.className,
            display: window.getComputedStyle(this.container).display,
            position: window.getComputedStyle(this.container).position
        });

        // 2. THEN load addons (per xterm.js documentation)
        logger.debug('terminal', 'Loading addons after open()');
        this.xterm.loadAddon(this.fitAddon);
        this.xterm.loadAddon(this.webLinksAddon);

        // Try to load WebGL addon for better performance
        try {
            this.webglAddon = new WebglAddon();
            this.xterm.loadAddon(this.webglAddon);
            logger.debug('terminal', 'WebGL renderer enabled');
        } catch (error) {
            logger.warn('terminal', 'WebGL renderer not available, using canvas:', error.message);
            // Notify user about performance degradation due to WebGL unavailability
            eventBus.emit('notification:show', {
                type: 'warning',
                message: 'Terminal using canvas renderer (WebGL unavailable). Performance may be reduced.',
                duration: 5000
            });
        }

        // 3. Wait for container to be properly sized in the DOM
        // Give extra time for the active class to apply and container to have dimensions
        await new Promise(resolve => setTimeout(resolve, 200));

        // Log container dimensions before first fit
        const rectBeforeFit = this.container.getBoundingClientRect();
        console.log(`[TERMINAL ${this.id}] Container before fit():`, {
            width: rectBeforeFit.width,
            height: rectBeforeFit.height,
            className: this.container.className,
            display: window.getComputedStyle(this.container).display
        });

        // 4. Fit terminal to container multiple times to ensure proper sizing
        this.fit();
        await new Promise(resolve => setTimeout(resolve, 100));
        this.fit();

        // Get final dimensions for PTY creation
        const dimensions = this.fitAddon.proposeDimensions();
        const cols = dimensions ? dimensions.cols : this.cols;
        const rows = dimensions ? dimensions.rows : this.rows;

        logger.debug('terminal', `Creating ${this.connectionType} terminal with dimensions: ${cols}x${rows}`);

        // Start listening for data BEFORE creating PTY
        // Data will be buffered until terminal is fully ready (VSCode pattern)
        this.startDataListener();

        try {
            // Route terminal creation based on connection type
            let result;
            if (this.connectionType === 'ssh') {
                if (!this.connectionId) {
                    throw new Error('SSH connection ID is required for SSH terminals');
                }
                result = await window.electronAPI.sshTerminalCreate(this.connectionId, cols, rows, this.id);
            } else {
                result = await window.electronAPI.terminalCreate(cols, rows, this.id);
            }

            if (result.success) {
                this.ptyId = result.ptyId;
                logger.info('terminal', `${this.connectionType.toUpperCase()} terminal created: ${this.ptyId}`);

                // Wait a bit for terminal to be fully ready, then flush buffered data
                // This prevents corrupted ANSI sequences from being displayed
                await new Promise(resolve => setTimeout(resolve, 100));

                // Flush any buffered data now that terminal is ready
                this.flushDataBuffer();

                // Set a safety timeout to stop buffering after 3 seconds (reduced from 10s)
                this._bufferTimeout = setTimeout(() => {
                    if (this._isBufferingData) {
                        logger.warn('terminal', 'Buffer timeout reached, flushing data');
                        this.flushDataBuffer();
                    }
                }, 3000);
            } else {
                logger.error('terminal', 'Failed to create PTY:', result.error);
                this.write(`\x1b[31mError: Failed to create terminal: ${result.error}\x1b[0m\r\n`);
            }
        } catch (error) {
            logger.error('terminal', 'Error creating PTY:', error);
            this.write(`\x1b[31mError: ${error.message}\x1b[0m\r\n`);
        }

        // Set up ResizeObserver to handle container size changes
        this.setupResizeObserver();

        logger.debug('terminal', 'Terminal attached successfully');
    }

    /**
     * Setup ResizeObserver to handle container resizing
     * This ensures terminal refits when dev console opens/closes or window resizes
     */
    setupResizeObserver() {
        if (!this.container || !window.ResizeObserver) {
            logger.warn('terminal', 'ResizeObserver not available');
            return;
        }

        this._resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                // Debounce resize events to avoid excessive refitting
                if (this._resizeTimeout) {
                    clearTimeout(this._resizeTimeout);
                }

                this._resizeTimeout = setTimeout(() => {
                    const { width, height } = entry.contentRect;
                    console.log(`[TERMINAL ${this.id}] ResizeObserver detected size change:`, {
                        width,
                        height,
                        target: entry.target.className
                    });

                    // Only refit if we have meaningful dimensions
                    if (width > 0 && height > 0 && this.isAttached && !this.isDisposed) {
                        console.log(`[TERMINAL ${this.id}] Refitting due to container resize`);
                        this.fit();
                    }
                }, 100); // 100ms debounce
            }
        });

        this._resizeObserver.observe(this.container);
        console.log(`[TERMINAL ${this.id}] ResizeObserver attached to container`);
        logger.debug('terminal', 'ResizeObserver setup complete');
    }

    /**
     * Start listening for data from PTY
     * Implements VSCode's buffering pattern to prevent race conditions
     */
    startDataListener() {
        // Listen for PTY data events
        const handleData = (data) => {
            if (this.ptyId && data.ptyId === this.ptyId) {
                // If still buffering initial data, store it
                if (this._isBufferingData) {
                    this._initialDataBuffer.push(data.data);
                } else {
                    this.write(data.data);
                }
            }
        };

        const handleExit = (data) => {
            if (this.ptyId && data.ptyId === this.ptyId) {
                logger.info('terminal', `PTY exited: ${this.ptyId}, code: ${data.exitCode}`);
                this.write(`\r\n\x1b[33mProcess exited with code ${data.exitCode}\x1b[0m\r\n`);
                eventBus.emit('terminal:exit', { id: this.id, exitCode: data.exitCode });
            }
        };

        eventBus.on('terminal:data', handleData);
        eventBus.on('terminal:exit', handleExit);

        // Store for cleanup
        this._dataHandler = handleData;
        this._exitHandler = handleExit;
    }

    /**
     * Flush buffered data and stop buffering (VSCode pattern)
     * Call this after terminal is fully attached and sized
     */
    flushDataBuffer() {
        if (!this._isBufferingData) {
            return;
        }

        logger.debug('terminal', `Flushing ${this._initialDataBuffer.length} buffered data events`);

        // Write all buffered data in order
        for (const data of this._initialDataBuffer) {
            this.write(data);
        }

        // Clear buffer and stop buffering
        this._initialDataBuffer = [];
        this._isBufferingData = false;

        // Clear timeout if it exists
        if (this._bufferTimeout) {
            clearTimeout(this._bufferTimeout);
            this._bufferTimeout = null;
        }

        logger.debug('terminal', 'Data buffer flushed, normal operation started');
    }

    /**
     * Write data to terminal
     */
    write(data) {
        if (this.xterm && !this.isDisposed) {
            this.xterm.write(data);
        }
    }

    /**
     * Fit terminal to container
     */
    fit() {
        if (this.fitAddon && this.isAttached) {
            try {
                // Log container dimensions before fit
                const rect = this.container.getBoundingClientRect();
                const computedStyle = window.getComputedStyle(this.container);

                console.log(`[TERMINAL ${this.id}] fit() called - Container state:`, {
                    boundingRect: {
                        width: rect.width,
                        height: rect.height,
                        top: rect.top,
                        left: rect.left
                    },
                    computedStyle: {
                        display: computedStyle.display,
                        position: computedStyle.position,
                        width: computedStyle.width,
                        height: computedStyle.height,
                        top: computedStyle.top,
                        left: computedStyle.left,
                        right: computedStyle.right,
                        bottom: computedStyle.bottom
                    },
                    className: this.container.className,
                    parentElement: this.container.parentElement ? this.container.parentElement.className : 'none'
                });

                // Get proposed dimensions before fit
                const proposedBefore = this.fitAddon.proposeDimensions();
                console.log(`[TERMINAL ${this.id}] proposeDimensions() BEFORE fit():`, proposedBefore);

                // Perform fit
                this.fitAddon.fit();

                // Get actual dimensions after fit
                const proposedAfter = this.fitAddon.proposeDimensions();
                console.log(`[TERMINAL ${this.id}] proposeDimensions() AFTER fit():`, proposedAfter);
                console.log(`[TERMINAL ${this.id}] xterm.cols x rows:`, this.xterm.cols, 'x', this.xterm.rows);

                if (proposedAfter) {
                    logger.debug('terminal', `Fit dimensions: ${proposedAfter.cols}x${proposedAfter.rows}`);
                }
            } catch (error) {
                console.error(`[TERMINAL ${this.id}] Error fitting terminal:`, error);
                logger.error('terminal', 'Error fitting terminal:', error);
            }
        } else {
            console.warn(`[TERMINAL ${this.id}] fit() skipped - fitAddon: ${!!this.fitAddon}, isAttached: ${this.isAttached}`);
        }
    }

    /**
     * Resize terminal
     */
    resize(cols, rows) {
        if (this.xterm && !this.isDisposed) {
            this.xterm.resize(cols, rows);
            logger.debug('terminal', `Terminal resized: ${cols}x${rows}`);
        }
    }

    /**
     * Focus terminal
     */
    focus() {
        if (this.xterm && !this.isDisposed) {
            this.xterm.focus();
        }
    }

    /**
     * Clear terminal
     */
    clear() {
        if (this.xterm && !this.isDisposed) {
            this.xterm.clear();
        }
    }

    /**
     * Get terminal theme
     */
    getTheme() {
        return {
            background: '#1e1e1e',
            foreground: '#cccccc',
            cursor: '#ffffff',
            cursorAccent: '#000000',
            selection: 'rgba(255, 255, 255, 0.3)',
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
            brightWhite: '#ffffff',
        };
    }

    /**
     * Get selection
     */
    getSelection() {
        return this.xterm ? this.xterm.getSelection() : '';
    }

    /**
     * Select all
     */
    selectAll() {
        if (this.xterm && !this.isDisposed) {
            this.xterm.selectAll();
        }
    }

    /**
     * Clear selection
     */
    clearSelection() {
        if (this.xterm && !this.isDisposed) {
            this.xterm.clearSelection();
        }
    }

    /**
     * Dispose terminal
     */
    async dispose() {
        if (this.isDisposed) {
            return;
        }

        logger.debug('terminal', `Disposing terminal: ${this.id}`);

        this.isDisposed = true;

        // Clear buffer timeout if it exists
        if (this._bufferTimeout) {
            clearTimeout(this._bufferTimeout);
            this._bufferTimeout = null;
        }

        // Clear resize timeout and observer
        if (this._resizeTimeout) {
            clearTimeout(this._resizeTimeout);
            this._resizeTimeout = null;
        }
        if (this._resizeObserver) {
            this._resizeObserver.disconnect();
            this._resizeObserver = null;
        }

        // Clear data buffer
        this._initialDataBuffer = [];
        this._isBufferingData = false;

        // Remove event listeners
        if (this._dataHandler) {
            eventBus.off('terminal:data', this._dataHandler);
        }
        if (this._exitHandler) {
            eventBus.off('terminal:exit', this._exitHandler);
        }

        // Close PTY (route based on connection type)
        if (this.ptyId) {
            try {
                if (this.connectionType === 'ssh') {
                    await window.electronAPI.sshTerminalClose(this.ptyId);
                } else {
                    await window.electronAPI.terminalClose(this.ptyId);
                }
                logger.debug('terminal', `${this.connectionType.toUpperCase()} terminal closed: ${this.ptyId}`);
            } catch (error) {
                logger.error('terminal', 'Error closing terminal:', error);
            }
        }

        // Dispose addons
        if (this.webglAddon) {
            try {
                this.webglAddon.dispose();
            } catch (error) {
                // Ignore
            }
        }

        // Dispose xterm
        if (this.xterm) {
            this.xterm.dispose();
        }

        logger.debug('terminal', `Terminal disposed: ${this.id}`);
    }
}

module.exports = Terminal;

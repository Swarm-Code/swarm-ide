/**
 * TerminalPanel - VSCode-style terminal panel with tabs
 *
 * Manages multiple terminal instances in a resizable bottom panel.
 * Features:
 * - Multiple terminal tabs
 * - Tab creation/deletion
 * - Resizable panel
 * - Keyboard shortcuts (Ctrl+`)
 * - Terminal lifecycle management
 *
 * Usage:
 *   const panel = new TerminalPanel(container);
 *   panel.init();
 */

const Terminal = require('./Terminal');
const eventBus = require('../../modules/EventBus');
const logger = require('../../utils/Logger');

class TerminalPanel {
    constructor(container) {
        this.container = container;
        this.panel = null;
        this.header = null;
        this.tabBar = null;
        this.content = null;
        this.resizeHandle = null;

        // Terminal instances
        this.terminals = new Map(); // id -> Terminal instance
        this.activeTerminalId = null;
        this.nextTerminalId = 1;

        // Panel state
        this.isVisible = false;
        this.height = 320; // Default height
        this.minHeight = 100;
        this.maxHeight = 600;

        // Resize state
        this.isResizing = false;
        this.resizeStartY = 0;
        this.resizeStartHeight = 0;

        logger.debug('terminalPanel', 'TerminalPanel instance created');
    }

    /**
     * Initialize the terminal panel
     */
    init() {
        logger.debug('terminalPanel', 'Initializing TerminalPanel');

        this.render();
        this.setupEventListeners();

        logger.info('terminalPanel', 'TerminalPanel initialized');
    }

    /**
     * Render the terminal panel
     */
    render() {
        this.panel = document.createElement('div');
        this.panel.className = 'terminal-panel';
        this.panel.style.display = 'none'; // Hidden by default
        this.panel.style.height = `${this.height}px`;

        this.panel.innerHTML = `
            <div class="terminal-panel-resize-handle"></div>
            <div class="terminal-panel-header">
                <div class="terminal-panel-title">TERMINAL</div>
                <div class="terminal-panel-tabs"></div>
                <div class="terminal-panel-actions">
                    <button class="terminal-panel-btn terminal-panel-new" title="New Terminal (Ctrl+Shift+\`)">
                        <span class="icon">+</span>
                    </button>
                    <button class="terminal-panel-btn terminal-panel-split" title="Split Terminal">
                        <span class="icon">⊞</span>
                    </button>
                    <button class="terminal-panel-btn terminal-panel-trash" title="Kill Terminal">
                        <span class="icon">🗑</span>
                    </button>
                    <button class="terminal-panel-btn terminal-panel-close" title="Close Panel">
                        <span class="icon">×</span>
                    </button>
                </div>
            </div>
            <div class="terminal-panel-content"></div>
        `;

        this.resizeHandle = this.panel.querySelector('.terminal-panel-resize-handle');
        this.header = this.panel.querySelector('.terminal-panel-header');
        this.tabBar = this.panel.querySelector('.terminal-panel-tabs');
        this.content = this.panel.querySelector('.terminal-panel-content');

        this.container.appendChild(this.panel);

        logger.debug('terminalPanel', 'Panel rendered');
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Panel action buttons
        const newBtn = this.panel.querySelector('.terminal-panel-new');
        const splitBtn = this.panel.querySelector('.terminal-panel-split');
        const trashBtn = this.panel.querySelector('.terminal-panel-trash');
        const closeBtn = this.panel.querySelector('.terminal-panel-close');

        newBtn.addEventListener('click', () => this.createTerminal());
        splitBtn.addEventListener('click', () => this.splitTerminal());
        trashBtn.addEventListener('click', () => this.killActiveTerminal());
        closeBtn.addEventListener('click', () => this.hide());

        // Resize handle
        this.resizeHandle.addEventListener('mousedown', (e) => this.startResize(e));

        // Global events
        eventBus.on('terminal:toggle-panel', () => this.toggle());
        eventBus.on('terminal:create', () => this.createTerminal());
        eventBus.on('terminal:exit', (data) => this.onTerminalExit(data));

        logger.debug('terminalPanel', 'Event listeners setup');
    }

    /**
     * Create a new terminal
     */
    async createTerminal() {
        const id = `terminal-${this.nextTerminalId++}`;
        logger.debug('terminalPanel', `Creating terminal: ${id}`);

        // Create terminal container
        const terminalContainer = document.createElement('div');
        terminalContainer.className = 'terminal-instance';
        terminalContainer.dataset.terminalId = id;
        // Don't set display: none, use 'active' class for visibility

        this.content.appendChild(terminalContainer);

        // Create terminal instance
        const terminal = new Terminal(terminalContainer, { id });
        await terminal.init();
        await terminal.attach();

        this.terminals.set(id, terminal);

        // Create tab
        this.createTab(id);

        // Activate terminal
        this.setActiveTerminal(id);

        // Focus terminal
        terminal.focus();

        logger.info('terminalPanel', `Terminal created: ${id}`);

        return terminal;
    }

    /**
     * Create tab for terminal
     */
    createTab(terminalId) {
        const tab = document.createElement('div');
        tab.className = 'terminal-tab';
        tab.dataset.terminalId = terminalId;

        const terminal = this.terminals.get(terminalId);
        const tabNumber = this.terminals.size;

        tab.innerHTML = `
            <span class="terminal-tab-label">${tabNumber}: bash</span>
            <button class="terminal-tab-close" title="Kill Terminal">×</button>
        `;

        // Tab click - activate terminal
        tab.addEventListener('click', (e) => {
            if (!e.target.classList.contains('terminal-tab-close')) {
                this.setActiveTerminal(terminalId);
            }
        });

        // Close button
        const closeBtn = tab.querySelector('.terminal-tab-close');
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.killTerminal(terminalId);
        });

        this.tabBar.appendChild(tab);

        logger.debug('terminalPanel', `Tab created for: ${terminalId}`);
    }

    /**
     * Set active terminal
     */
    setActiveTerminal(terminalId) {
        if (this.activeTerminalId === terminalId) {
            return;
        }

        logger.debug('terminalPanel', `Setting active terminal: ${terminalId}`);

        // Hide current terminal
        if (this.activeTerminalId) {
            const currentContainer = this.content.querySelector(`[data-terminal-id="${this.activeTerminalId}"]`);
            if (currentContainer) {
                currentContainer.classList.remove('active');
            }

            const currentTab = this.tabBar.querySelector(`[data-terminal-id="${this.activeTerminalId}"]`);
            if (currentTab) {
                currentTab.classList.remove('active');
            }
        }

        // Show new terminal
        const newContainer = this.content.querySelector(`[data-terminal-id="${terminalId}"]`);
        if (newContainer) {
            console.log(`[TERMINAL PANEL] Setting active class on container:`, terminalId);
            const rectBefore = newContainer.getBoundingClientRect();
            console.log(`[TERMINAL PANEL] Container BEFORE active class:`, {
                width: rectBefore.width,
                height: rectBefore.height,
                className: newContainer.className
            });

            newContainer.classList.add('active');

            const rectAfter = newContainer.getBoundingClientRect();
            console.log(`[TERMINAL PANEL] Container AFTER active class:`, {
                width: rectAfter.width,
                height: rectAfter.height,
                className: newContainer.className,
                display: window.getComputedStyle(newContainer).display
            });
        }

        const newTab = this.tabBar.querySelector(`[data-terminal-id="${terminalId}"]`);
        if (newTab) {
            newTab.classList.add('active');
        }

        this.activeTerminalId = terminalId;

        // Focus and fit terminal AFTER it's visible
        const terminal = this.terminals.get(terminalId);
        if (terminal) {
            // Wait for DOM to update with active class, then fit
            console.log(`[TERMINAL PANEL] Scheduling fit() in 50ms for:`, terminalId);
            setTimeout(() => {
                console.log(`[TERMINAL PANEL] Executing focus() and fit() for:`, terminalId);
                terminal.focus();
                terminal.fit();
            }, 50);
        }

        logger.debug('terminalPanel', `Active terminal set: ${terminalId}`);
    }

    /**
     * Kill terminal
     */
    async killTerminal(terminalId) {
        logger.debug('terminalPanel', `Killing terminal: ${terminalId}`);

        const terminal = this.terminals.get(terminalId);
        if (terminal) {
            await terminal.dispose();
            this.terminals.delete(terminalId);
        }

        // Remove container
        const container = this.content.querySelector(`[data-terminal-id="${terminalId}"]`);
        if (container) {
            container.remove();
        }

        // Remove tab
        const tab = this.tabBar.querySelector(`[data-terminal-id="${terminalId}"]`);
        if (tab) {
            tab.remove();
        }

        // If this was the active terminal, activate another
        if (this.activeTerminalId === terminalId) {
            this.activeTerminalId = null;

            if (this.terminals.size > 0) {
                const firstTerminalId = Array.from(this.terminals.keys())[0];
                this.setActiveTerminal(firstTerminalId);
            }
        }

        logger.info('terminalPanel', `Terminal killed: ${terminalId}`);
    }

    /**
     * Kill active terminal
     */
    async killActiveTerminal() {
        if (this.activeTerminalId) {
            await this.killTerminal(this.activeTerminalId);
        }
    }

    /**
     * Split terminal
     */
    async splitTerminal() {
        // For now, just create a new terminal
        // In the future, could implement true split view
        await this.createTerminal();
    }

    /**
     * Handle terminal exit
     */
    onTerminalExit(data) {
        logger.debug('terminalPanel', `Terminal exit event: ${data.id}, code: ${data.exitCode}`);
        // Terminal instance already handled showing exit message
        // We could auto-close the terminal here if desired
    }

    /**
     * Show panel
     */
    async show() {
        if (this.isVisible) {
            return;
        }

        logger.debug('terminalPanel', 'Showing terminal panel');

        this.panel.style.display = 'flex';
        this.isVisible = true;

        // Create first terminal if none exist
        if (this.terminals.size === 0) {
            await this.createTerminal();
        }

        // Fit active terminal
        if (this.activeTerminalId) {
            const terminal = this.terminals.get(this.activeTerminalId);
            if (terminal) {
                // Delay fit to ensure panel is visible
                setTimeout(() => terminal.fit(), 50);
            }
        }

        // Emit event for layout adjustments (BrowserView, etc.)
        eventBus.emit('terminal-panel:shown', { height: this.height });

        logger.info('terminalPanel', 'Terminal panel shown');
    }

    /**
     * Hide panel
     */
    hide() {
        if (!this.isVisible) {
            return;
        }

        logger.debug('terminalPanel', 'Hiding terminal panel');

        this.panel.style.display = 'none';
        this.isVisible = false;

        // Emit event for layout adjustments
        eventBus.emit('terminal-panel:hidden');

        logger.info('terminalPanel', 'Terminal panel hidden');
    }

    /**
     * Toggle panel visibility
     */
    async toggle() {
        logger.debug('terminalPanel', `Toggle called, isVisible: ${this.isVisible}`);
        if (this.isVisible) {
            this.hide();
        } else {
            await this.show();
        }
    }

    /**
     * Start resize
     */
    startResize(e) {
        this.isResizing = true;
        this.resizeStartY = e.clientY;
        this.resizeStartHeight = this.height;

        document.addEventListener('mousemove', this.onResize.bind(this));
        document.addEventListener('mouseup', this.stopResize.bind(this));

        e.preventDefault();
    }

    /**
     * Handle resize
     */
    onResize(e) {
        if (!this.isResizing) {
            return;
        }

        const delta = this.resizeStartY - e.clientY;
        const newHeight = Math.max(this.minHeight, Math.min(this.maxHeight, this.resizeStartHeight + delta));

        this.height = newHeight;
        this.panel.style.height = `${newHeight}px`;

        // Fit active terminal
        if (this.activeTerminalId) {
            const terminal = this.terminals.get(this.activeTerminalId);
            if (terminal) {
                terminal.fit();
            }
        }

        // Emit resize event
        eventBus.emit('terminal-panel:shown', { height: this.height });

        e.preventDefault();
    }

    /**
     * Stop resize
     */
    stopResize(e) {
        if (!this.isResizing) {
            return;
        }

        this.isResizing = false;

        document.removeEventListener('mousemove', this.onResize.bind(this));
        document.removeEventListener('mouseup', this.stopResize.bind(this));

        logger.debug('terminalPanel', `Panel resized to: ${this.height}px`);

        e.preventDefault();
    }

    /**
     * Dispose panel
     */
    async dispose() {
        logger.debug('terminalPanel', 'Disposing TerminalPanel');

        // Dispose all terminals
        for (const [id, terminal] of this.terminals) {
            await terminal.dispose();
        }

        this.terminals.clear();

        // Remove panel
        if (this.panel && this.panel.parentNode) {
            this.panel.parentNode.removeChild(this.panel);
        }

        // Remove event listeners
        eventBus.off('terminal:toggle-panel');
        eventBus.off('terminal:create');
        eventBus.off('terminal:exit');

        logger.info('terminalPanel', 'TerminalPanel disposed');
    }
}

module.exports = TerminalPanel;

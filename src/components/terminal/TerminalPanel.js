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
                    <div class="terminal-panel-new-dropdown">
                        <button class="terminal-panel-btn terminal-panel-new" title="New Terminal (Ctrl+Shift+\`)">
                            <span class="icon">+</span>
                        </button>
                        <button class="terminal-panel-btn terminal-panel-new-dropdown-toggle" title="Terminal Options">
                            <span class="icon">▼</span>
                        </button>
                        <div class="terminal-panel-dropdown-menu" style="display: none;">
                            <div class="terminal-panel-dropdown-item terminal-new-local">Local Terminal</div>
                            <div class="terminal-panel-dropdown-item terminal-new-ssh">SSH Terminal</div>
                        </div>
                    </div>
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
        const dropdownToggle = this.panel.querySelector('.terminal-panel-new-dropdown-toggle');
        const dropdownMenu = this.panel.querySelector('.terminal-panel-dropdown-menu');
        const newLocalBtn = this.panel.querySelector('.terminal-new-local');
        const newSSHBtn = this.panel.querySelector('.terminal-new-ssh');
        const splitBtn = this.panel.querySelector('.terminal-panel-split');
        const trashBtn = this.panel.querySelector('.terminal-panel-trash');
        const closeBtn = this.panel.querySelector('.terminal-panel-close');

        // New terminal button (default: local)
        newBtn.addEventListener('click', () => this.createTerminal());

        // Dropdown toggle
        dropdownToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            const isVisible = dropdownMenu.style.display === 'block';
            dropdownMenu.style.display = isVisible ? 'none' : 'block';
        });

        // Dropdown options
        newLocalBtn.addEventListener('click', () => {
            dropdownMenu.style.display = 'none';
            this.createTerminal();
        });

        newSSHBtn.addEventListener('click', () => {
            dropdownMenu.style.display = 'none';
            this.createSSHTerminal();
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.terminal-panel-new-dropdown')) {
                dropdownMenu.style.display = 'none';
            }
        });

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
     * Create SSH terminal with connection selector
     */
    async createSSHTerminal() {
        logger.debug('terminalPanel', 'Creating SSH terminal with connection selector');

        // Import SSHConnectionManager dynamically
        const sshConnectionManager = require('../../services/SSHConnectionManager');

        // Get active connections
        const connections = sshConnectionManager.getAllConnections();

        if (connections.length === 0) {
            eventBus.emit('notification:show', {
                type: 'warning',
                message: 'No active SSH connections. Please connect to an SSH server first.',
                duration: 5000
            });
            logger.warn('terminalPanel', 'No active SSH connections available');
            return;
        }

        // For now, use the first connection (in future, show a picker dialog)
        // TODO: Implement connection picker UI
        const connection = connections[0];

        logger.info('terminalPanel', `Creating SSH terminal for connection: ${connection.id}`);

        await this.createTerminal({
            connectionType: 'ssh',
            connectionId: connection.id
        });
    }

    /**
     * Create a new terminal
     * @param {Object} options - Terminal options
     * @param {string} options.connectionType - 'local' or 'ssh'
     * @param {string} options.connectionId - SSH connection ID (required for SSH terminals)
     */
    async createTerminal(options = {}) {
        const connectionType = options.connectionType || 'local';
        const connectionId = options.connectionId || null;

        const id = `terminal-${this.nextTerminalId++}`;
        logger.debug('terminalPanel', `Creating ${connectionType} terminal: ${id}`);

        // Create terminal container
        const terminalContainer = document.createElement('div');
        terminalContainer.className = 'terminal-instance';
        terminalContainer.dataset.terminalId = id;
        terminalContainer.dataset.connectionType = connectionType;
        if (connectionId) {
            terminalContainer.dataset.connectionId = connectionId;
        }
        // Don't set display: none, use 'active' class for visibility

        this.content.appendChild(terminalContainer);

        // Create terminal instance with connection options
        const terminal = new Terminal(terminalContainer, {
            id,
            connectionType,
            connectionId
        });
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

        // Get terminal label based on connection type
        const container = this.content.querySelector(`[data-terminal-id="${terminalId}"]`);
        const connectionType = container ? container.dataset.connectionType : 'local';
        const label = connectionType === 'ssh' ? 'ssh' : 'bash';

        tab.innerHTML = `
            <span class="terminal-tab-label">${tabNumber}: ${label}</span>
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
     * Switch between terminal tabs using CSS class toggling
     *
     * CRITICAL FOR TERMINAL PERSISTENCE:
     * This method switches which terminal tab is visible within the TerminalPanel
     * by adding/removing the 'active' CSS class. Terminals are NOT destroyed when
     * switched - they remain in memory with active connections and accumulated output.
     *
     * Switching Mechanism:
     * 1. Remove 'active' class from current terminal's container and tab
     * 2. This triggers CSS rule: .terminal-instance { display: none; }
     * 3. Add 'active' class to new terminal's container and tab
     * 4. This triggers CSS rule: .terminal-instance.active { display: block; }
     * 5. Call terminal.focus() and terminal.fit() to ensure proper rendering
     *
     * Why Switching Preserves State:
     * - xterm.js instance stays in memory while hidden (CSS display: none)
     * - PTY connection remains open even when terminal not visible
     * - Output buffer continues accumulating while hidden
     * - No reconnection or re-creation needed when switching back
     * - User's scroll position and selection preserved
     *
     * Double-Persistence Layer:
     * - Workspace Level: Panes hidden with display: none when switching workspaces
     * - Terminal Level: Individual tabs hidden with display: none when switching tabs
     * - Both mechanisms keep terminals alive, just invisible
     *
     * @param {string} terminalId - The terminal ID to make active
     */
    setActiveTerminal(terminalId) {
        if (this.activeTerminalId === terminalId) {
            return;
        }

        logger.debug('terminalPanel', `Setting active terminal: ${terminalId}`);

        // Hide current terminal by removing 'active' class
        // This triggers CSS: .terminal-instance { display: none; }
        // Terminal stays in memory, just hidden from view
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

        // Show new terminal by adding 'active' class
        // This triggers CSS: .terminal-instance.active { display: block; }
        // Terminal becomes visible immediately with all its previous output
        const newContainer = this.content.querySelector(`[data-terminal-id="${terminalId}"]`);
        if (newContainer) {
            newContainer.classList.add('active');
        }

        const newTab = this.tabBar.querySelector(`[data-terminal-id="${terminalId}"]`);
        if (newTab) {
            newTab.classList.add('active');
        }

        this.activeTerminalId = terminalId;

        // Focus and fit terminal AFTER it's visible
        // 50ms timeout ensures DOM has fully updated and layout is complete
        // before calling terminal.fit() which measures container dimensions
        const terminal = this.terminals.get(terminalId);
        if (terminal) {
            setTimeout(() => {
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

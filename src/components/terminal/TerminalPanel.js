/**
 * TerminalPanel - VS Code-style terminal panel
 *
 * A dedicated panel at the bottom of the IDE that hosts multiple terminal instances
 * with tabs, splitting, and full terminal management.
 *
 * Architecture inspired by VS Code's TerminalViewPane.
 */

const Terminal = require('./Terminal');
const eventBus = require('../../modules/EventBus');
const logger = require('../../utils/Logger');

class TerminalPanel {
    constructor(container) {
        this.container = container;
        this.terminals = new Map(); // terminalId -> { terminal, element, tab }
        this.activeTerminalId = null;
        this.nextTerminalId = 1;
        this.isVisible = false;
        this.panelHeight = 320; // Default height in pixels (~30% of typical screen)

        // Panel elements
        this.panel = null;
        this.resizeHandle = null;
        this.header = null;
        this.tabsContainer = null;
        this.terminalContainer = null;

        logger.debug('terminalPanel', 'TerminalPanel created');
    }

    /**
     * Initialize the terminal panel
     */
    init() {
        logger.debug('terminalPanel', 'Initializing TerminalPanel...');

        // Create panel structure
        this.createPanelStructure();

        // Setup event listeners
        this.setupEventListeners();

        // Initially hidden
        this.hide();

        logger.debug('terminalPanel', '✓ TerminalPanel initialized');
    }

    /**
     * Create the panel DOM structure
     */
    createPanelStructure() {
        // Main panel container
        this.panel = document.createElement('div');
        this.panel.className = 'terminal-panel';
        this.panel.style.cssText = `
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            height: ${this.panelHeight}px;
            background: #1e1e1e;
            border-top: 1px solid #333;
            display: flex;
            flex-direction: column;
            z-index: 100;
        `;

        // Resize handle
        this.resizeHandle = document.createElement('div');
        this.resizeHandle.className = 'terminal-panel-resize-handle';
        this.resizeHandle.style.cssText = `
            height: 4px;
            background: transparent;
            cursor: ns-resize;
            position: absolute;
            top: -2px;
            left: 0;
            right: 0;
            z-index: 1;
        `;
        this.resizeHandle.addEventListener('mousedown', (e) => this.startResize(e));
        this.panel.appendChild(this.resizeHandle);

        // Header with tabs and controls
        this.header = document.createElement('div');
        this.header.className = 'terminal-panel-header';
        this.header.style.cssText = `
            height: 35px;
            background: #252526;
            border-bottom: 1px solid #333;
            display: flex;
            align-items: center;
            padding: 0 8px;
            flex-shrink: 0;
        `;

        // Title
        const title = document.createElement('div');
        title.className = 'terminal-panel-title';
        title.textContent = 'TERMINAL';
        title.style.cssText = `
            font-size: 11px;
            font-weight: 600;
            color: #ccc;
            text-transform: uppercase;
            margin-right: 12px;
            letter-spacing: 0.5px;
        `;
        this.header.appendChild(title);

        // Tabs container
        this.tabsContainer = document.createElement('div');
        this.tabsContainer.className = 'terminal-panel-tabs';
        this.tabsContainer.style.cssText = `
            display: flex;
            align-items: center;
            flex: 1;
            overflow-x: auto;
            gap: 2px;
        `;
        this.header.appendChild(this.tabsContainer);

        // Controls
        const controls = this.createControls();
        this.header.appendChild(controls);

        this.panel.appendChild(this.header);

        // Terminal container
        this.terminalContainer = document.createElement('div');
        this.terminalContainer.className = 'terminal-panel-content';
        this.terminalContainer.style.cssText = `
            flex: 1;
            position: relative;
            overflow: hidden;
        `;
        this.panel.appendChild(this.terminalContainer);

        // Add to container
        this.container.appendChild(this.panel);
    }

    /**
     * Create control buttons
     */
    createControls() {
        const controls = document.createElement('div');
        controls.className = 'terminal-panel-controls';
        controls.style.cssText = `
            display: flex;
            align-items: center;
            gap: 4px;
            margin-left: 8px;
        `;

        // New Terminal button
        const newBtn = this.createButton('New Terminal', () => this.createNewTerminal());
        newBtn.innerHTML = '<span style="font-size: 16px;">+</span>';
        controls.appendChild(newBtn);

        // Split Terminal button (dropdown)
        const splitBtn = this.createButton('Split Terminal', () => this.showSplitMenu());
        splitBtn.innerHTML = '<span style="font-size: 14px;">⊞</span>';
        controls.appendChild(splitBtn);

        // Kill Terminal button
        const killBtn = this.createButton('Kill Terminal', () => this.killActiveTerminal());
        killBtn.innerHTML = '<span style="font-size: 14px;">×</span>';
        controls.appendChild(killBtn);

        // Close Panel button
        const closeBtn = this.createButton('Close Panel', () => this.hide());
        closeBtn.innerHTML = '<span style="font-size: 14px;">⌄</span>';
        controls.appendChild(closeBtn);

        return controls;
    }

    /**
     * Create a control button
     */
    createButton(title, onclick) {
        const btn = document.createElement('button');
        btn.className = 'terminal-panel-btn';
        btn.title = title;
        btn.style.cssText = `
            background: transparent;
            border: none;
            color: #ccc;
            cursor: pointer;
            padding: 4px 8px;
            border-radius: 3px;
            font-size: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
        `;
        btn.addEventListener('click', onclick);
        btn.addEventListener('mouseenter', () => {
            btn.style.background = '#3a3a3a';
        });
        btn.addEventListener('mouseleave', () => {
            btn.style.background = 'transparent';
        });
        return btn;
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Listen for terminal events
        eventBus.on('terminal:ready', ({ terminalId }) => {
            logger.debug('terminalPanel', 'Terminal ready:', terminalId);
        });

        eventBus.on('terminal:exit', ({ terminalId }) => {
            logger.debug('terminalPanel', 'Terminal exited:', terminalId);
            this.closeTerminal(terminalId);
        });

        // Listen for SSH terminal open requests
        eventBus.on('ssh:openTerminal', ({ connectionId }) => {
            logger.info('terminalPanel', 'SSH terminal open requested for connection:', connectionId);
            this.createNewTerminal({
                type: 'ssh',
                sshConnectionId: connectionId,
                title: `SSH: ${connectionId}`
            });
        });
    }

    /**
     * Create a new terminal
     */
    async createNewTerminal(options = {}) {
        logger.debug('terminalPanel', 'Creating new terminal...');

        const terminalId = this.nextTerminalId++;

        // Create terminal container
        const terminalElement = document.createElement('div');
        terminalElement.className = 'terminal-instance';
        terminalElement.dataset.terminalId = terminalId;
        terminalElement.style.cssText = `
            width: 100%;
            height: 100%;
            position: absolute;
            top: 0;
            left: 0;
            display: none;
        `;

        // Create Terminal instance
        const terminal = new Terminal(terminalElement, options);

        // Initialize terminal
        const result = await terminal.init();
        if (!result.success) {
            logger.error('terminalPanel', 'Failed to initialize terminal:', result.error);
            return { success: false, error: result.error };
        }

        // Create tab
        const tab = this.createTab(terminalId, options.title || `bash (${terminalId})`);

        // Store terminal
        this.terminals.set(terminalId, {
            terminal,
            element: terminalElement,
            tab,
            title: options.title || `bash (${terminalId})`
        });

        // Add to container
        this.terminalContainer.appendChild(terminalElement);

        // Make it active
        this.setActiveTerminal(terminalId);

        // Show panel if hidden
        if (!this.isVisible) {
            this.show();
        }

        logger.debug('terminalPanel', '✓ Terminal created:', terminalId);

        return { success: true, terminalId };
    }

    /**
     * Create a tab for a terminal
     */
    createTab(terminalId, title) {
        const tab = document.createElement('div');
        tab.className = 'terminal-tab';
        tab.dataset.terminalId = terminalId;
        tab.style.cssText = `
            padding: 6px 12px;
            background: #1e1e1e;
            border: 1px solid #333;
            border-radius: 3px 3px 0 0;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 12px;
            color: #ccc;
            white-space: nowrap;
            user-select: none;
        `;

        // Icon
        const icon = document.createElement('span');
        icon.textContent = '▶';
        icon.style.cssText = 'font-size: 10px;';
        tab.appendChild(icon);

        // Title
        const titleSpan = document.createElement('span');
        titleSpan.textContent = title;
        tab.appendChild(titleSpan);

        // Close button
        const closeBtn = document.createElement('span');
        closeBtn.textContent = '×';
        closeBtn.style.cssText = `
            font-size: 16px;
            opacity: 0.6;
            cursor: pointer;
        `;
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.closeTerminal(terminalId);
        });
        closeBtn.addEventListener('mouseenter', () => {
            closeBtn.style.opacity = '1';
        });
        closeBtn.addEventListener('mouseleave', () => {
            closeBtn.style.opacity = '0.6';
        });
        tab.appendChild(closeBtn);

        // Tab click handler
        tab.addEventListener('click', () => {
            this.setActiveTerminal(terminalId);
        });

        // Hover effect
        tab.addEventListener('mouseenter', () => {
            if (this.activeTerminalId !== terminalId) {
                tab.style.background = '#2a2a2a';
            }
        });
        tab.addEventListener('mouseleave', () => {
            if (this.activeTerminalId !== terminalId) {
                tab.style.background = '#1e1e1e';
            }
        });

        this.tabsContainer.appendChild(tab);

        return tab;
    }

    /**
     * Set active terminal
     */
    setActiveTerminal(terminalId) {
        logger.debug('terminalPanel', 'Setting active terminal:', terminalId);

        // Hide all terminals
        for (const [id, { element, tab }] of this.terminals) {
            element.style.display = 'none';
            tab.style.background = '#1e1e1e';
            tab.style.borderBottom = '1px solid #333';
        }

        // Show active terminal
        const active = this.terminals.get(terminalId);
        if (active) {
            active.element.style.display = 'block';
            active.tab.style.background = '#252526';
            active.tab.style.borderBottom = 'none';
            active.terminal.focus();
            this.activeTerminalId = terminalId;
        }
    }

    /**
     * Close a terminal
     */
    async closeTerminal(terminalId) {
        logger.debug('terminalPanel', 'Closing terminal:', terminalId);

        const terminalData = this.terminals.get(terminalId);
        if (!terminalData) return;

        // Destroy terminal
        await terminalData.terminal.destroy();

        // Remove tab
        terminalData.tab.remove();

        // Remove element
        terminalData.element.remove();

        // Remove from map
        this.terminals.delete(terminalId);

        // If this was active, switch to another
        if (this.activeTerminalId === terminalId) {
            const remaining = Array.from(this.terminals.keys());
            if (remaining.length > 0) {
                this.setActiveTerminal(remaining[0]);
            } else {
                this.activeTerminalId = null;
                // Optionally hide panel when no terminals
                // this.hide();
            }
        }

        logger.debug('terminalPanel', '✓ Terminal closed:', terminalId);
    }

    /**
     * Kill active terminal
     */
    async killActiveTerminal() {
        if (this.activeTerminalId) {
            await this.closeTerminal(this.activeTerminalId);
        }
    }

    /**
     * Show split menu (placeholder)
     */
    showSplitMenu() {
        logger.debug('terminalPanel', 'Split menu - not implemented yet');
        // TODO: Implement split menu
    }

    /**
     * Show panel
     */
    show() {
        if (this.isVisible) return;

        logger.debug('terminalPanel', 'Showing panel...');

        // Use display flex instead of visibility to completely hide/show
        this.panel.style.display = 'flex';
        this.isVisible = true;

        // Adjust main content area
        this.container.style.paddingBottom = `${this.panelHeight}px`;

        // If no terminals, create one
        if (this.terminals.size === 0) {
            logger.debug('terminalPanel', 'No terminals, creating first terminal');
            this.createNewTerminal();
        } else {
            // Wait for layout to complete, then resize terminals
            logger.debug('terminalPanel', `Refreshing ${this.terminals.size} terminals after show`);

            // Use a longer delay to ensure layout is complete
            setTimeout(() => {
                for (const [id, { terminal }] of this.terminals) {
                    try {
                        logger.debug('terminalPanel', `Refreshing terminal ${id}...`);
                        terminal.resize();
                    } catch (error) {
                        logger.error('terminalPanel', `Error resizing terminal ${id}:`, error);
                    }
                }
                logger.debug('terminalPanel', '✓ All terminals refreshed');
            }, 100);
        }

        logger.debug('terminalPanel', '✓ Panel shown');
        eventBus.emit('terminal-panel:shown');
    }

    /**
     * Hide panel
     */
    hide() {
        if (!this.isVisible) return;

        logger.debug('terminalPanel', 'Hiding panel...');

        // Use display none to completely hide and prevent resize events
        this.panel.style.display = 'none';
        this.isVisible = false;

        // Reset main content area
        this.container.style.paddingBottom = '0';

        logger.debug('terminalPanel', '✓ Panel hidden');
        eventBus.emit('terminal-panel:hidden');
    }

    /**
     * Toggle panel visibility
     */
    toggle() {
        if (this.isVisible) {
            this.hide();
        } else {
            this.show();
        }
    }

    /**
     * Start resizing the panel
     */
    startResize(e) {
        e.preventDefault();

        const startY = e.clientY;
        const startHeight = this.panelHeight;

        const onMouseMove = (e) => {
            const deltaY = startY - e.clientY;
            const newHeight = Math.max(100, Math.min(window.innerHeight - 200, startHeight + deltaY));
            this.setPanelHeight(newHeight);
        };

        const onMouseUp = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    }

    /**
     * Set panel height
     */
    setPanelHeight(height) {
        this.panelHeight = height;
        this.panel.style.height = `${height}px`;
        if (this.isVisible) {
            this.container.style.paddingBottom = `${height}px`;
        }

        // Resize active terminal
        if (this.activeTerminalId) {
            const active = this.terminals.get(this.activeTerminalId);
            if (active) {
                active.terminal.resize();
            }
        }
    }

    /**
     * Get all terminals
     */
    getAllTerminals() {
        return Array.from(this.terminals.values());
    }

    /**
     * Cleanup
     */
    async destroy() {
        logger.debug('terminalPanel', 'Destroying panel...');

        // Close all terminals
        for (const terminalId of this.terminals.keys()) {
            await this.closeTerminal(terminalId);
        }

        // Remove panel
        if (this.panel) {
            this.panel.remove();
        }

        logger.debug('terminalPanel', 'Panel destroyed');
    }
}

module.exports = TerminalPanel;

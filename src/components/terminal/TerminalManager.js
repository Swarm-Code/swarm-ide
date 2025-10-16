/**
 * TerminalManager - Coordinates multiple terminal instances
 *
 * Manages terminal creation, lifecycle, and integration with PaneManager.
 * Handles terminal-to-pane mappings and provides centralized terminal management.
 */

const Terminal = require('./Terminal');
const eventBus = require('../modules/EventBus');
const logger = require('../utils/Logger');

class TerminalManager {
    constructor() {
        this.terminals = new Map(); // terminalId -> { terminal, paneId }
        this.paneManager = null;
        this.nextLocalId = 1; // For generating client-side terminal IDs

        logger.debug('terminalManager', 'Initialized');
    }

    /**
     * Initialize with PaneManager
     * @param {Object} paneManager - PaneManager instance
     */
    init(paneManager) {
        this.paneManager = paneManager;

        // Listen for terminal events
        this.setupEventListeners();

        logger.debug('terminalManager', 'Initialized with PaneManager');
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Handle terminal ready
        eventBus.on('terminal:ready', ({ terminalId }) => {
            logger.debug('terminalManager', 'Terminal ready:', terminalId);
        });

        // Handle terminal exit
        eventBus.on('terminal:exit', ({ terminalId, exitCode }) => {
            logger.debug('terminalManager', 'Terminal exited:', { terminalId, exitCode });

            // Optionally show "Press any key to close" or auto-close
            // For now, we'll keep the terminal open to show the exit message
        });

        // Handle terminal destroyed
        eventBus.on('terminal:destroyed', () => {
            logger.debug('terminalManager', 'Terminal destroyed');
        });

        // Handle pane close - cleanup terminals
        eventBus.on('pane:closed', ({ paneId }) => {
            logger.debug('terminalManager', 'Pane closed:', paneId);
            this.closeTerminalsInPane(paneId);
        });
    }

    /**
     * Create and open a terminal in a pane
     * @param {string} paneId - Pane ID
     * @param {Object} options - Terminal options
     * @param {string} [options.cwd] - Working directory
     * @param {Object} [options.env] - Environment variables
     * @param {string} [options.shell] - Shell to use
     * @returns {Promise<Object>} Result with terminal instance
     */
    async openTerminalInPane(paneId, options = {}) {
        logger.debug('terminalManager', 'Opening terminal in pane:', paneId);

        try {
            if (!this.paneManager) {
                throw new Error('PaneManager not initialized');
            }

            const pane = this.paneManager.getPane(paneId);
            if (!pane) {
                throw new Error('Pane not found: ' + paneId);
            }

            // Create container for terminal
            const container = document.createElement('div');
            container.className = 'terminal-container';
            container.style.cssText = 'width: 100%; height: 100%; position: absolute; top: 0; left: 0; right: 0; bottom: 0;';

            // Create Terminal instance
            const terminal = new Terminal(container, options);

            // Initialize terminal
            const result = await terminal.init();
            if (!result.success) {
                throw new Error(result.error || 'Failed to initialize terminal');
            }

            const terminalId = result.terminalId;

            // Store terminal instance
            this.terminals.set(terminalId, {
                terminal: terminal,
                paneId: paneId,
                container: container
            });

            // Set terminal content in pane
            this.paneManager.setPaneContent(paneId, container, 'terminal', 'Terminal');

            // Update pane title
            const titleElement = pane.element.querySelector('.pane-title');
            if (titleElement) {
                titleElement.textContent = 'Terminal';
            }

            logger.debug('terminalManager', '✓ Terminal opened in pane:', {
                terminalId,
                paneId
            });

            // Focus terminal
            terminal.focus();

            return {
                success: true,
                terminalId: terminalId,
                terminal: terminal
            };

        } catch (error) {
            logger.error('terminalManager', 'Failed to open terminal in pane:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Create and open a terminal in the active pane
     * @param {Object} options - Terminal options
     * @returns {Promise<Object>} Result with terminal instance
     */
    async openTerminalInActivePane(options = {}) {
        if (!this.paneManager) {
            return { success: false, error: 'PaneManager not initialized' };
        }

        const activePane = this.paneManager.getActivePane();
        if (!activePane) {
            return { success: false, error: 'No active pane' };
        }

        return await this.openTerminalInPane(activePane.id, options);
    }

    /**
     * Create a new terminal in a new pane (split)
     * @param {string} direction - 'horizontal' or 'vertical'
     * @param {Object} options - Terminal options
     * @returns {Promise<Object>} Result with terminal instance
     */
    async openTerminalInNewPane(direction = 'horizontal', options = {}) {
        if (!this.paneManager) {
            return { success: false, error: 'PaneManager not initialized' };
        }

        const activePane = this.paneManager.getActivePane();
        if (!activePane) {
            return { success: false, error: 'No active pane' };
        }

        // Split the active pane
        this.paneManager.splitPane(activePane.id, direction);

        // The new pane becomes active after split
        const newActivePane = this.paneManager.getActivePane();

        // Open terminal in the new pane
        return await this.openTerminalInPane(newActivePane.id, options);
    }

    /**
     * Get terminal by ID
     * @param {number} terminalId - Terminal ID
     * @returns {Terminal|null} Terminal instance
     */
    getTerminal(terminalId) {
        const entry = this.terminals.get(terminalId);
        return entry ? entry.terminal : null;
    }

    /**
     * Get all terminals in a pane
     * @param {string} paneId - Pane ID
     * @returns {Terminal[]} Array of Terminal instances
     */
    getTerminalsInPane(paneId) {
        const terminals = [];
        for (const [terminalId, entry] of this.terminals) {
            if (entry.paneId === paneId) {
                terminals.push(entry.terminal);
            }
        }
        return terminals;
    }

    /**
     * Close a terminal
     * @param {number} terminalId - Terminal ID
     */
    async closeTerminal(terminalId) {
        logger.debug('terminalManager', 'Closing terminal:', terminalId);

        const entry = this.terminals.get(terminalId);
        if (!entry) {
            logger.warn('terminalManager', 'Terminal not found:', terminalId);
            return;
        }

        try {
            // Destroy terminal instance
            await entry.terminal.destroy();

            // Remove from map
            this.terminals.delete(terminalId);

            logger.debug('terminalManager', '✓ Terminal closed:', terminalId);
        } catch (error) {
            logger.error('terminalManager', 'Error closing terminal:', error);
        }
    }

    /**
     * Close all terminals in a pane
     * @param {string} paneId - Pane ID
     */
    async closeTerminalsInPane(paneId) {
        logger.debug('terminalManager', 'Closing all terminals in pane:', paneId);

        const terminalsToClose = [];
        for (const [terminalId, entry] of this.terminals) {
            if (entry.paneId === paneId) {
                terminalsToClose.push(terminalId);
            }
        }

        for (const terminalId of terminalsToClose) {
            await this.closeTerminal(terminalId);
        }

        logger.debug('terminalManager', '✓ Closed', terminalsToClose.length, 'terminals in pane:', paneId);
    }

    /**
     * Close all terminals
     */
    async closeAllTerminals() {
        logger.debug('terminalManager', 'Closing all terminals');

        const terminalIds = Array.from(this.terminals.keys());

        for (const terminalId of terminalIds) {
            await this.closeTerminal(terminalId);
        }

        logger.debug('terminalManager', '✓ All terminals closed');
    }

    /**
     * Get all terminal instances
     * @returns {Array} Array of { terminalId, terminal, paneId }
     */
    getAllTerminals() {
        const result = [];
        for (const [terminalId, entry] of this.terminals) {
            result.push({
                terminalId: terminalId,
                terminal: entry.terminal,
                paneId: entry.paneId
            });
        }
        return result;
    }

    /**
     * Focus terminal by ID
     * @param {number} terminalId - Terminal ID
     */
    focusTerminal(terminalId) {
        const entry = this.terminals.get(terminalId);
        if (entry) {
            entry.terminal.focus();
        }
    }

    /**
     * Cleanup
     */
    async destroy() {
        logger.debug('terminalManager', 'Destroying...');
        await this.closeAllTerminals();
        logger.debug('terminalManager', 'Destroyed');
    }
}

// Export singleton instance
module.exports = new TerminalManager();

/**
 * SSHPanel - SSH connections management panel
 *
 * Displays SSH connections list with status indicators and management actions.
 * Provides connection, disconnection, editing, and monitoring capabilities.
 *
 * Features:
 * - SSH connections list with status indicators
 * - Connect/disconnect actions
 * - Create, edit, delete connections
 * - Real-time status updates
 * - Connection health monitoring
 * - Integration with SSH service and dialog
 *
 * Usage:
 *   const sshPanel = new SSHPanel();
 *   sshPanel.render(container);
 */

const eventBus = require('../modules/EventBus');
const logger = require('../utils/Logger');
const SSHConnectionDialog = require('./SSHConnectionDialog');

class SSHPanel {
    constructor() {
        this.panel = null;
        this.connectionsList = null;
        this.noConnectionsMessage = null;
        this.addConnectionBtn = null;
        this.refreshBtn = null;
        this.statusDiv = null;
        this.isVisible = false;

        // SSH Dialog instance
        this.sshDialog = new SSHConnectionDialog();

        // Connection data
        this.connections = new Map(); // connectionId -> connection data
        this.connectionElements = new Map(); // connectionId -> DOM element

        // Update intervals
        this.statusUpdateInterval = null;
        this.healthCheckInterval = null;

        this.setupEventListeners();
        logger.debug('sshPanel', 'SSH Panel initialized');
    }

    /**
     * Render the SSH panel
     * @param {HTMLElement} container - Container element
     */
    render(container) {
        try {
            logger.info('sshPanel', '🎨 Starting SSH Panel render...');

            // Create panel element
            logger.debug('sshPanel', 'Creating panel element...');
            this.panel = document.createElement('div');
            this.panel.className = 'ssh-panel panel';
            this.panel.style.display = 'none'; // Hidden by default
            logger.debug('sshPanel', 'Panel element created');

            // Set HTML content
            logger.debug('sshPanel', 'Setting panel HTML content...');
            this.panel.innerHTML = this.getHTML();
            logger.debug('sshPanel', 'Panel HTML content set');

            // Initialize elements
            logger.debug('sshPanel', 'Initializing elements...');
            this.initializeElements();
            logger.debug('sshPanel', 'Elements initialized');

            // Setup event listeners
            logger.debug('sshPanel', 'Setting up panel event listeners...');
            this.setupPanelEventListeners();
            logger.debug('sshPanel', 'Panel event listeners setup complete');

            // Add styles
            logger.debug('sshPanel', 'Adding panel styles...');
            this.addPanelStyles();
            logger.debug('sshPanel', 'Panel styles added');

            // Append to DOM
            logger.debug('sshPanel', 'Appending panel to DOM...');
            if (container) {
                container.appendChild(this.panel);
                logger.debug('sshPanel', 'Panel appended to provided container');
            } else {
                document.body.appendChild(this.panel);
                logger.debug('sshPanel', 'Panel appended to document.body');
            }

            // Load connections (async)
            logger.debug('sshPanel', 'Starting connection loading...');
            this.loadConnections().catch(error => {
                logger.error('sshPanel', 'Failed to load connections during render:', error);
            });

            // Start status updates
            logger.debug('sshPanel', 'Starting status updates...');
            this.startStatusUpdates();
            logger.debug('sshPanel', 'Status updates started');

            logger.info('sshPanel', '✅ SSH Panel rendered successfully');
        } catch (error) {
            logger.error('ssh', '❌ Failed to render SSH Panel:', error);
            logger.error('ssh', 'Render error stack:', error.stack);
            throw error;
        }
    }

    /**
     * Get HTML structure
     */
    getHTML() {
        return `
            <div class="ssh-panel-header">
                <div class="ssh-panel-title">
                    <h3>SSH Connections</h3>
                    <div class="ssh-panel-actions">
                        <button class="ssh-refresh-btn" title="Refresh Connections">
                            <span class="icon">↻</span>
                        </button>
                        <button class="ssh-add-btn" title="Add SSH Connection">
                            <span class="icon">+</span>
                        </button>
                    </div>
                </div>
                <div class="ssh-panel-status"></div>
            </div>

            <div class="ssh-panel-content">
                <div class="ssh-connections-list"></div>
                <div class="ssh-no-connections" style="display: none;">
                    <div class="ssh-no-connections-icon">🔗</div>
                    <p>No SSH connections configured</p>
                    <button class="ssh-add-first-btn">Add SSH Connection</button>
                </div>
            </div>
        `;
    }

    /**
     * Initialize DOM element references
     */
    initializeElements() {
        this.connectionsList = this.panel.querySelector('.ssh-connections-list');
        this.noConnectionsMessage = this.panel.querySelector('.ssh-no-connections');
        this.addConnectionBtn = this.panel.querySelector('.ssh-add-btn');
        this.refreshBtn = this.panel.querySelector('.ssh-refresh-btn');
        this.statusDiv = this.panel.querySelector('.ssh-panel-status');

        // Add first connection button
        const addFirstBtn = this.panel.querySelector('.ssh-add-first-btn');
        addFirstBtn.addEventListener('click', () => this.showAddConnectionDialog());
    }

    /**
     * Setup panel event listeners
     */
    setupPanelEventListeners() {
        this.addConnectionBtn.addEventListener('click', () => this.showAddConnectionDialog());
        this.refreshBtn.addEventListener('click', () => this.refreshConnections());
    }

    /**
     * Setup global event listeners
     */
    setupEventListeners() {
        // SSH service events
        eventBus.on('ssh:connectionCreated', (data) => {
            this.onConnectionCreated(data);
        });

        eventBus.on('ssh:connected', (data) => {
            this.onConnectionStateChanged(data.id, 'connected');
        });

        eventBus.on('ssh:disconnected', (data) => {
            this.onConnectionStateChanged(data.id, 'disconnected');
        });

        eventBus.on('ssh:connectionError', (data) => {
            this.onConnectionStateChanged(data.id, 'error');
            this.showStatus(`Connection error: ${data.error?.message || 'Unknown error'}`, 'error');
        });

        eventBus.on('ssh:connectionRemoved', (data) => {
            this.onConnectionRemoved(data.id);
        });

        eventBus.on('ssh:connectionSaved', (data) => {
            this.onConnectionSaved(data);
        });

        // Panel visibility events
        eventBus.on('ssh:toggle-panel', () => {
            logger.info('sshPanel', '🎛️ SSH TOGGLE PANEL EVENT RECEIVED!');
            logger.info('sshPanel', 'Current panel state - isVisible:', this.isVisible);
            logger.info('sshPanel', 'Panel element exists:', !!this.panel);
            this.toggle();
        });

        eventBus.on('ssh:hide-panel', () => {
            logger.info('sshPanel', '🔒 SSH HIDE PANEL EVENT RECEIVED!');
            this.hide();
        });

        logger.debug('sshPanel', 'SSH Panel event listeners setup');
    }

    /**
     * Load SSH connections from service
     */
    async loadConnections() {
        try {
            this.showStatus('Loading connections...', 'info');

            if (!window.sshService || !window.sshService.isInitialized()) {
                this.showStatus('SSH service not available', 'error');
                return;
            }

            const connections = await window.sshService.getConnections();
            this.connections.clear();
            this.connectionElements.clear();

            connections.forEach(conn => {
                this.connections.set(conn.id, conn);
            });

            this.renderConnections();
            this.showStatus(`${connections.length} connections loaded`, 'success');

            setTimeout(() => this.clearStatus(), 2000);

        } catch (error) {
            this.showStatus('Failed to load connections: ' + error.message, 'error');
            logger.error('ssh', 'Failed to load connections:', error);
        }
    }

    /**
     * Render connections list
     */
    renderConnections() {
        this.connectionsList.innerHTML = '';

        if (this.connections.size === 0) {
            this.noConnectionsMessage.style.display = 'block';
            this.connectionsList.style.display = 'none';
            return;
        }

        this.noConnectionsMessage.style.display = 'none';
        this.connectionsList.style.display = 'block';

        this.connections.forEach((connection, id) => {
            const element = this.createConnectionElement(connection);
            this.connectionElements.set(id, element);
            this.connectionsList.appendChild(element);
        });
    }

    /**
     * Create connection element
     */
    createConnectionElement(connection) {
        const element = document.createElement('div');
        element.className = 'ssh-connection-item';
        element.dataset.connectionId = connection.id;

        element.innerHTML = `
            <div class="ssh-connection-header">
                <div class="ssh-connection-info">
                    <div class="ssh-connection-name">${this.escapeHtml(connection.name || connection.host)}</div>
                    <div class="ssh-connection-details">${this.escapeHtml(connection.username)}@${this.escapeHtml(connection.host)}:${connection.port}</div>
                </div>
                <div class="ssh-connection-status" data-status="${connection.state || 'disconnected'}">
                    <span class="ssh-status-indicator"></span>
                    <span class="ssh-status-text">${this.getStatusText(connection.state || 'disconnected')}</span>
                </div>
            </div>

            <div class="ssh-connection-actions">
                <button class="ssh-action-btn ssh-connect-btn" title="Connect" ${connection.state === 'connected' ? 'style="display: none;"' : ''}>
                    <span class="icon">🔗</span>
                    Connect
                </button>
                <button class="ssh-action-btn ssh-disconnect-btn" title="Disconnect" ${connection.state !== 'connected' ? 'style="display: none;"' : ''}>
                    <span class="icon">🔌</span>
                    Disconnect
                </button>
                <button class="ssh-action-btn ssh-terminal-btn" title="Open Terminal" ${connection.state !== 'connected' ? 'disabled' : ''}>
                    <span class="icon">💻</span>
                    Terminal
                </button>
                <button class="ssh-action-btn ssh-files-btn" title="Browse Files" ${connection.state !== 'connected' ? 'disabled' : ''}>
                    <span class="icon">📁</span>
                    Files
                </button>
                <button class="ssh-action-btn ssh-edit-btn" title="Edit Connection">
                    <span class="icon">✏️</span>
                    Edit
                </button>
                <button class="ssh-action-btn ssh-delete-btn" title="Delete Connection">
                    <span class="icon">🗑️</span>
                    Delete
                </button>
            </div>
        `;

        this.setupConnectionEventListeners(element, connection);

        return element;
    }

    /**
     * Setup event listeners for connection element
     */
    setupConnectionEventListeners(element, connection) {
        const connectBtn = element.querySelector('.ssh-connect-btn');
        const disconnectBtn = element.querySelector('.ssh-disconnect-btn');
        const terminalBtn = element.querySelector('.ssh-terminal-btn');
        const filesBtn = element.querySelector('.ssh-files-btn');
        const editBtn = element.querySelector('.ssh-edit-btn');
        const deleteBtn = element.querySelector('.ssh-delete-btn');

        connectBtn.addEventListener('click', () => this.connectToSSH(connection.id));
        disconnectBtn.addEventListener('click', () => this.disconnectFromSSH(connection.id));
        terminalBtn.addEventListener('click', () => this.openTerminal(connection.id));
        filesBtn.addEventListener('click', () => this.browseFiles(connection.id));
        editBtn.addEventListener('click', () => this.editConnection(connection.id));
        deleteBtn.addEventListener('click', () => this.deleteConnection(connection.id));
    }

    /**
     * Connect to SSH server
     */
    async connectToSSH(connectionId) {
        try {
            const element = this.connectionElements.get(connectionId);
            const connectBtn = element.querySelector('.ssh-connect-btn');

            connectBtn.disabled = true;
            connectBtn.innerHTML = '<span class="icon">⏳</span> Connecting...';

            await window.sshService.connect(connectionId);

            this.showStatus('Connected successfully', 'success');
            setTimeout(() => this.clearStatus(), 2000);

        } catch (error) {
            this.showStatus('Connection failed: ' + error.message, 'error');
            logger.error('ssh', 'Connection failed:', error);

            // Reset button state
            const element = this.connectionElements.get(connectionId);
            const connectBtn = element.querySelector('.ssh-connect-btn');
            connectBtn.disabled = false;
            connectBtn.innerHTML = '<span class="icon">🔗</span> Connect';
        }
    }

    /**
     * Disconnect from SSH server
     */
    async disconnectFromSSH(connectionId) {
        try {
            const element = this.connectionElements.get(connectionId);
            const disconnectBtn = element.querySelector('.ssh-disconnect-btn');

            disconnectBtn.disabled = true;
            disconnectBtn.innerHTML = '<span class="icon">⏳</span> Disconnecting...';

            await window.sshService.disconnect(connectionId);

            this.showStatus('Disconnected successfully', 'success');
            setTimeout(() => this.clearStatus(), 2000);

        } catch (error) {
            this.showStatus('Disconnection failed: ' + error.message, 'error');
            logger.error('ssh', 'Disconnection failed:', error);

            // Reset button state
            const element = this.connectionElements.get(connectionId);
            const disconnectBtn = element.querySelector('.ssh-disconnect-btn');
            disconnectBtn.disabled = false;
            disconnectBtn.innerHTML = '<span class="icon">🔌</span> Disconnect';
        }
    }

    /**
     * Open SSH terminal
     */
    openTerminal(connectionId) {
        // TODO: Implement terminal integration
        eventBus.emit('ssh:openTerminal', { connectionId });
        this.showStatus('Terminal functionality coming soon', 'info');
    }

    /**
     * Browse SSH files
     */
    browseFiles(connectionId) {
        // TODO: Implement file browser integration
        eventBus.emit('ssh:browseFiles', { connectionId });
        this.showStatus('File browser functionality coming soon', 'info');
    }

    /**
     * Edit SSH connection
     */
    async editConnection(connectionId) {
        try {
            const connection = await window.sshService.getConnection(connectionId);
            this.sshDialog.show(connection);
        } catch (error) {
            this.showStatus('Failed to load connection data: ' + error.message, 'error');
            logger.error('ssh', 'Failed to load connection for editing:', error);
        }
    }

    /**
     * Delete SSH connection
     */
    async deleteConnection(connectionId) {
        const connection = this.connections.get(connectionId);
        if (!connection) return;

        const confirmed = confirm(`Are you sure you want to delete the SSH connection "${connection.name || connection.host}"?`);
        if (!confirmed) return;

        try {
            await window.sshService.removeConnection(connectionId);
            this.showStatus('Connection deleted successfully', 'success');
            setTimeout(() => this.clearStatus(), 2000);
        } catch (error) {
            this.showStatus('Failed to delete connection: ' + error.message, 'error');
            logger.error('ssh', 'Failed to delete connection:', error);
        }
    }

    /**
     * Show add connection dialog
     */
    showAddConnectionDialog() {
        this.sshDialog.show();
    }

    /**
     * Refresh connections list
     */
    async refreshConnections() {
        this.refreshBtn.disabled = true;
        this.refreshBtn.innerHTML = '<span class="icon">⏳</span>';

        await this.loadConnections();

        this.refreshBtn.disabled = false;
        this.refreshBtn.innerHTML = '<span class="icon">↻</span>';
    }

    /**
     * Event handlers
     */
    onConnectionCreated(data) {
        this.loadConnections(); // Reload all connections
    }

    onConnectionStateChanged(connectionId, state) {
        const connection = this.connections.get(connectionId);
        if (connection) {
            connection.state = state;
            this.updateConnectionElement(connectionId, connection);
        }
    }

    onConnectionRemoved(connectionId) {
        this.connections.delete(connectionId);
        const element = this.connectionElements.get(connectionId);
        if (element) {
            element.remove();
            this.connectionElements.delete(connectionId);
        }

        // Update UI if no connections left
        if (this.connections.size === 0) {
            this.renderConnections();
        }
    }

    onConnectionSaved(data) {
        this.loadConnections(); // Reload all connections
    }

    /**
     * Update connection element
     */
    updateConnectionElement(connectionId, connection) {
        const element = this.connectionElements.get(connectionId);
        if (!element) return;

        // Update status
        const statusElement = element.querySelector('.ssh-connection-status');
        const statusText = element.querySelector('.ssh-status-text');

        statusElement.dataset.status = connection.state || 'disconnected';
        statusText.textContent = this.getStatusText(connection.state || 'disconnected');

        // Update action buttons
        const connectBtn = element.querySelector('.ssh-connect-btn');
        const disconnectBtn = element.querySelector('.ssh-disconnect-btn');
        const terminalBtn = element.querySelector('.ssh-terminal-btn');
        const filesBtn = element.querySelector('.ssh-files-btn');

        if (connection.state === 'connected') {
            connectBtn.style.display = 'none';
            disconnectBtn.style.display = 'inline-flex';
            terminalBtn.disabled = false;
            filesBtn.disabled = false;
        } else {
            connectBtn.style.display = 'inline-flex';
            disconnectBtn.style.display = 'none';
            terminalBtn.disabled = true;
            filesBtn.disabled = true;

            // Reset button text
            connectBtn.innerHTML = '<span class="icon">🔗</span> Connect';
            disconnectBtn.innerHTML = '<span class="icon">🔌</span> Disconnect';
            connectBtn.disabled = false;
            disconnectBtn.disabled = false;
        }
    }

    /**
     * Start status update intervals
     */
    startStatusUpdates() {
        // Update connection statuses every 10 seconds
        this.statusUpdateInterval = setInterval(() => {
            this.updateConnectionStatuses();
        }, 10000);

        // Health check every 30 seconds
        this.healthCheckInterval = setInterval(() => {
            this.performHealthCheck();
        }, 30000);
    }

    /**
     * Stop status update intervals
     */
    stopStatusUpdates() {
        if (this.statusUpdateInterval) {
            clearInterval(this.statusUpdateInterval);
            this.statusUpdateInterval = null;
        }

        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
        }
    }

    /**
     * Update connection statuses
     */
    async updateConnectionStatuses() {
        try {
            const connections = await window.sshService.getConnections();
            connections.forEach(conn => {
                const existing = this.connections.get(conn.id);
                if (existing && existing.state !== conn.state) {
                    this.onConnectionStateChanged(conn.id, conn.state);
                }
            });
        } catch (error) {
            logger.error('ssh', 'Failed to update connection statuses:', error);
        }
    }

    /**
     * Perform health check
     */
    async performHealthCheck() {
        try {
            const status = await window.sshService.getHealthStatus();
            logger.debug('ssh', 'Health check:', status);

            // Update panel status
            if (status.unhealthy > 0) {
                this.showStatus(`${status.unhealthy} connections have issues`, 'warning');
            }
        } catch (error) {
            logger.error('ssh', 'Health check failed:', error);
        }
    }

    /**
     * Utility methods
     */
    getStatusText(state) {
        switch (state) {
            case 'connected': return 'Connected';
            case 'connecting': return 'Connecting...';
            case 'disconnected': return 'Disconnected';
            case 'reconnecting': return 'Reconnecting...';
            case 'error': return 'Error';
            default: return 'Unknown';
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    showStatus(message, type = 'info') {
        if (!this.statusDiv) {
            logger.warn('ssh', 'Status div not available, status:', message);
            return;
        }
        this.statusDiv.textContent = message;
        this.statusDiv.className = `ssh-panel-status ssh-status-${type}`;
    }

    clearStatus() {
        if (!this.statusDiv) {
            return;
        }
        this.statusDiv.textContent = '';
        this.statusDiv.className = 'ssh-panel-status';
    }

    /**
     * Add panel styles
     */
    addPanelStyles() {
        try {
            logger.debug('ssh', 'Checking for existing SSH panel styles...');
            if (document.getElementById('ssh-panel-styles')) {
                logger.debug('ssh', 'SSH panel styles already exist, skipping');
                return; // Styles already added
            }

            logger.debug('ssh', 'Creating new style element...');
            const style = document.createElement('style');
            style.id = 'ssh-panel-styles';

            logger.debug('ssh', 'Setting style content...');
            style.textContent = `
            .ssh-panel {
                position: fixed;
                top: 32px;
                left: 48px;
                width: 320px;
                height: calc(100vh - 32px);
                background: var(--color-bg-primary, #1e1e1e);
                color: var(--color-text-primary, #cccccc);
                font-family: var(--font-family, 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif);
                border-right: 1px solid var(--color-border, #333);
                display: flex;
                flex-direction: column;
                z-index: 100;
                box-shadow: 2px 0 8px rgba(0, 0, 0, 0.3);
            }

            .ssh-panel-header {
                padding: 16px;
                border-bottom: 1px solid var(--color-border, #333);
                background: var(--color-bg-secondary, #252526);
                min-height: 60px;
                display: flex;
                flex-direction: column;
                justify-content: center;
            }

            .ssh-panel-title {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 8px;
            }

            .ssh-panel-title h3 {
                margin: 0;
                font-size: 13px;
                font-weight: 600;
                color: var(--color-text-primary, #cccccc);
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }

            .ssh-panel-actions {
                display: flex;
                gap: 6px;
            }

            .ssh-refresh-btn,
            .ssh-add-btn {
                background: transparent;
                border: 1px solid transparent;
                color: var(--color-text-secondary, #969696);
                padding: 6px 8px;
                border-radius: 3px;
                cursor: pointer;
                font-size: 14px;
                display: flex;
                align-items: center;
                justify-content: center;
                width: 28px;
                height: 28px;
                transition: all 0.2s ease;
            }

            .ssh-refresh-btn:hover,
            .ssh-add-btn:hover {
                background: var(--color-button-secondary-hover, #37373d);
                color: var(--color-text-primary, #cccccc);
                border-color: var(--color-border, #5a5a5a);
            }

            .ssh-refresh-btn:disabled {
                opacity: 0.5;
                cursor: not-allowed;
            }

            .ssh-panel-status {
                font-size: 12px;
                padding: 4px 8px;
                border-radius: 4px;
            }

            .ssh-status-info {
                background: rgba(0, 122, 204, 0.1);
                color: #007acc;
            }

            .ssh-status-success {
                background: rgba(0, 150, 0, 0.1);
                color: #00aa00;
            }

            .ssh-status-warning {
                background: rgba(255, 165, 0, 0.1);
                color: #ffa500;
            }

            .ssh-status-error {
                background: rgba(200, 0, 0, 0.1);
                color: #ff6b6b;
            }

            .ssh-panel-content {
                flex: 1;
                overflow-y: auto;
                padding: 0;
            }

            .ssh-connections-list {
                display: flex;
                flex-direction: column;
                gap: 1px;
                padding: 8px 0;
            }

            .ssh-connection-item {
                background: transparent;
                border: none;
                border-radius: 0;
                padding: 12px 16px;
                transition: background-color 0.15s ease;
                cursor: pointer;
                border-left: 3px solid transparent;
            }

            .ssh-connection-item:hover {
                background: var(--color-bg-hover, #2a2d2e);
                border-left-color: var(--color-accent, #0e639c);
            }

            .ssh-connection-header {
                display: flex;
                justify-content: space-between;
                align-items: flex-start;
                margin-bottom: 12px;
            }

            .ssh-connection-info {
                flex: 1;
            }

            .ssh-connection-name {
                font-weight: 600;
                font-size: 14px;
                color: var(--color-text-primary, #cccccc);
                margin-bottom: 4px;
            }

            .ssh-connection-details {
                font-size: 12px;
                color: var(--color-text-secondary, #969696);
            }

            .ssh-connection-status {
                display: flex;
                align-items: center;
                gap: 6px;
                font-size: 12px;
            }

            .ssh-status-indicator {
                width: 8px;
                height: 8px;
                border-radius: 50%;
                display: inline-block;
            }

            .ssh-connection-status[data-status="connected"] .ssh-status-indicator {
                background: #00aa00;
            }

            .ssh-connection-status[data-status="connecting"] .ssh-status-indicator,
            .ssh-connection-status[data-status="reconnecting"] .ssh-status-indicator {
                background: #ffa500;
                animation: pulse 1s infinite;
            }

            .ssh-connection-status[data-status="disconnected"] .ssh-status-indicator {
                background: #666;
            }

            .ssh-connection-status[data-status="error"] .ssh-status-indicator {
                background: #ff6b6b;
            }

            @keyframes pulse {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.5; }
            }

            .ssh-connection-actions {
                display: flex;
                flex-wrap: wrap;
                gap: 4px;
                margin-top: 8px;
                opacity: 0;
                transition: opacity 0.15s ease;
            }

            .ssh-connection-item:hover .ssh-connection-actions {
                opacity: 1;
            }

            .ssh-action-btn {
                background: transparent;
                border: 1px solid var(--color-border, #5a5a5a);
                color: var(--color-text-secondary, #969696);
                padding: 4px 8px;
                border-radius: 3px;
                cursor: pointer;
                font-size: 11px;
                display: inline-flex;
                align-items: center;
                gap: 4px;
                transition: all 0.15s ease;
                min-height: 24px;
            }

            .ssh-action-btn:hover:not(:disabled) {
                background: var(--color-button-secondary-hover, #37373d);
                color: var(--color-text-primary, #cccccc);
                border-color: var(--color-accent, #0e639c);
            }

            .ssh-action-btn:disabled {
                opacity: 0.4;
                cursor: not-allowed;
            }

            .ssh-action-btn .icon {
                font-size: 14px;
            }

            .ssh-connect-btn {
                background: var(--color-accent, #007acc);
                border-color: var(--color-accent, #007acc);
                color: white;
            }

            .ssh-connect-btn:hover:not(:disabled) {
                background: var(--color-accent-hover, #005a9e);
            }

            .ssh-disconnect-btn {
                background: #dc3545;
                border-color: #dc3545;
                color: white;
            }

            .ssh-disconnect-btn:hover:not(:disabled) {
                background: #c82333;
            }

            .ssh-delete-btn {
                background: #dc3545;
                border-color: #dc3545;
                color: white;
            }

            .ssh-delete-btn:hover:not(:disabled) {
                background: #c82333;
            }

            .ssh-no-connections {
                text-align: center;
                padding: 32px 20px;
                color: var(--color-text-secondary, #969696);
                margin-top: 20px;
            }

            .ssh-no-connections-icon {
                font-size: 32px;
                margin-bottom: 12px;
                opacity: 0.7;
            }

            .ssh-no-connections p {
                margin: 0 0 16px 0;
                font-size: 13px;
                line-height: 1.4;
            }

            .ssh-add-first-btn {
                background: var(--color-accent, #007acc);
                border: 1px solid var(--color-accent, #007acc);
                color: white;
                padding: 8px 16px;
                border-radius: 3px;
                cursor: pointer;
                font-size: 12px;
                transition: background-color 0.15s ease;
            }

            .ssh-add-first-btn:hover {
                background: var(--color-accent-hover, #005a9e);
            }
        `;
            logger.debug('ssh', 'Appending style element to document head...');
            document.head.appendChild(style);
            logger.debug('ssh', 'SSH panel styles added successfully');
        } catch (error) {
            logger.error('ssh', 'Failed to add SSH panel styles:', error);
            logger.error('ssh', 'Style error stack:', error.stack);
        }
    }

    /**
     * Show the panel
     */
    show() {
        logger.info('sshPanel', '👁️ SHOW SSH PANEL CALLED');
        logger.info('sshPanel', 'Panel exists:', !!this.panel);

        if (!this.panel) {
            logger.error('sshPanel', 'Cannot show panel - panel element is null!');
            return;
        }

        // Hide file explorer sidebar
        const sidebar = document.querySelector('.sidebar');
        logger.info('sshPanel', 'Sidebar found:', !!sidebar);
        if (sidebar) {
            sidebar.style.display = 'none';
            logger.info('sshPanel', 'Sidebar hidden');
        }

        // Show SSH panel
        logger.info('sshPanel', 'Setting panel display to flex');
        this.panel.style.display = 'flex';
        this.isVisible = true;
        logger.info('sshPanel', 'Panel is now visible, loading connections...');
        this.loadConnections();
        logger.info('sshPanel', '✅ SSH Panel shown successfully');
    }

    /**
     * Hide the panel
     */
    hide() {
        logger.info('sshPanel', '🙈 HIDE SSH PANEL CALLED');
        logger.info('sshPanel', 'Panel exists:', !!this.panel);

        if (!this.panel) {
            logger.error('sshPanel', 'Cannot hide panel - panel element is null!');
            return;
        }

        // Show file explorer sidebar
        const sidebar = document.querySelector('.sidebar');
        logger.info('sshPanel', 'Sidebar found:', !!sidebar);
        if (sidebar) {
            sidebar.style.display = 'flex';
            logger.info('sshPanel', 'Sidebar restored');
        }

        // Hide SSH panel
        logger.info('sshPanel', 'Setting panel display to none');
        this.panel.style.display = 'none';
        this.isVisible = false;
        logger.info('sshPanel', '✅ SSH Panel hidden successfully');
    }

    /**
     * Toggle panel visibility
     */
    toggle() {
        logger.info('ssh', '🔄 TOGGLE SSH PANEL CALLED');
        logger.info('ssh', 'Current state - isVisible:', this.isVisible);
        logger.info('ssh', 'Panel exists:', !!this.panel);

        if (this.isVisible) {
            logger.info('ssh', 'Panel is visible, calling hide()');
            this.hide();
        } else {
            logger.info('ssh', 'Panel is hidden, calling show()');
            this.show();
        }

        logger.info('ssh', 'Toggle completed, new state - isVisible:', this.isVisible);
    }

    /**
     * Clean up resources
     */
    destroy() {
        this.stopStatusUpdates();

        if (this.sshDialog) {
            this.sshDialog.destroy();
        }

        if (this.panel && this.panel.parentNode) {
            this.panel.parentNode.removeChild(this.panel);
        }
    }
}

module.exports = SSHPanel;
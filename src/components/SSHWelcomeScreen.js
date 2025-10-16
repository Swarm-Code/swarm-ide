/**
 * SSHWelcomeScreen - Dedicated SSH server selection and management interface
 *
 * Provides:
 * - SSH server list with connection status
 * - Quick connect functionality
 * - Server configuration management
 * - Recent connections history
 * - Seamless integration with main IDE
 *
 * Usage:
 *   const sshWelcome = new SSHWelcomeScreen(container, config, sshService);
 *   sshWelcome.show();
 */

const eventBus = require('../modules/EventBus');
const logger = require('../utils/Logger');
const modal = require('./Modal');
const SSHServerConfigDialog = require('./SSHServerConfigDialog');
const keytarService = require('../services/KeytarService');
const SSHConnectionProgress = require('./SSHConnectionProgress');

class SSHWelcomeScreen {
    constructor(container, config, sshService) {
        this.container = container;
        this.config = config;
        this.sshService = sshService;
        this.isVisible = false;
        this.savedServers = [];
        this.recentConnections = [];
    }

    /**
     * Initialize the SSH welcome screen
     */
    async init() {
        logger.info('sshWelcome', 'Initializing SSH Welcome Screen...');

        // Initialize keytar for secure password storage
        await keytarService.init();

        // Load saved servers and recent connections
        await this.loadSavedServers();
        await this.loadRecentConnections();

        // Render the UI
        this.render();

        // Setup event listeners
        this.setupEventListeners();

        logger.info('sshWelcome', '✓ SSH Welcome Screen initialized');
    }

    /**
     * Load saved SSH server configurations
     */
    async loadSavedServers() {
        try {
            this.savedServers = this.config.get('sshServers', []);
            logger.debug('sshWelcome', 'Loaded saved servers:', this.savedServers.length);
        } catch (error) {
            logger.error('sshWelcome', 'Failed to load saved servers:', error);
            this.savedServers = [];
        }
    }

    /**
     * Load recent SSH connections
     */
    async loadRecentConnections() {
        try {
            this.recentConnections = this.config.get('sshRecentConnections', []);
            logger.debug('sshWelcome', 'Loaded recent connections:', this.recentConnections.length);
        } catch (error) {
            logger.error('sshWelcome', 'Failed to load recent connections:', error);
            this.recentConnections = [];
        }
    }

    /**
     * Render the SSH welcome screen
     */
    render() {
        logger.debug('sshWelcome', 'Rendering SSH Welcome Screen...');

        this.container.innerHTML = `
            <div class="ssh-welcome-screen">
                <!-- Back Button -->
                <button class="ssh-welcome-back-btn" id="ssh-back-btn">
                    <span>← Back</span>
                </button>

                <div class="ssh-welcome-content">
                    <!-- Header -->
                    <div class="ssh-welcome-header">
                        <h1 class="ssh-welcome-title">SWARM IDE SSH</h1>
                        <p class="ssh-welcome-subtitle">Remote Workspace</p>
                    </div>

                    <!-- Quick Actions -->
                    <div class="ssh-welcome-section">
                        <h2 class="ssh-welcome-section-title">Start</h2>
                        <div class="ssh-welcome-actions">
                            <button class="ssh-welcome-action-btn" id="ssh-quick-connect-btn">
                                <span class="welcome-action-icon">🔗</span>
                                <div class="welcome-action-content">
                                    <div class="welcome-action-title">Quick Connect</div>
                                    <div class="welcome-action-desc">Connect to an SSH server quickly</div>
                                </div>
                            </button>
                            <button class="ssh-welcome-action-btn" id="ssh-add-server-btn">
                                <span class="welcome-action-icon">➕</span>
                                <div class="welcome-action-content">
                                    <div class="welcome-action-title">Add Server</div>
                                    <div class="welcome-action-desc">Save a new SSH server configuration</div>
                                </div>
                            </button>
                            <button class="ssh-welcome-action-btn" id="ssh-settings-btn">
                                <span class="welcome-action-icon">⚙️</span>
                                <div class="welcome-action-content">
                                    <div class="welcome-action-title">SSH Settings</div>
                                    <div class="welcome-action-desc">Configure SSH preferences</div>
                                </div>
                            </button>
                            <button class="ssh-welcome-action-btn" id="ssh-import-btn">
                                <span class="welcome-action-icon">📋</span>
                                <div class="welcome-action-content">
                                    <div class="welcome-action-title">Import Config</div>
                                    <div class="welcome-action-desc">Import SSH configurations from file</div>
                                </div>
                            </button>
                        </div>
                    </div>

                    <!-- Saved Servers -->
                    ${this.savedServers.length > 0 ? `
                        <div class="ssh-welcome-section">
                            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
                                <h2 class="ssh-welcome-section-title" style="margin: 0;">
                                    Saved Servers (${this.savedServers.length})
                                </h2>
                                <button class="ssh-export-btn" id="ssh-export-btn" style="padding: 6px 12px; background: #0e639c; color: white; border: none; border-radius: 4px; font-size: 12px; cursor: pointer;">
                                    📤 Export
                                </button>
                            </div>
                            <div class="ssh-welcome-servers-list">
                                ${this.savedServers.map(server => this.renderServerItem(server)).join('')}
                            </div>
                        </div>
                    ` : ''}

                    <!-- Recent Connections -->
                    ${this.recentConnections.length > 0 ? `
                        <div class="ssh-welcome-section">
                            <h2 class="ssh-welcome-section-title">Recent Connections</h2>
                            <div class="ssh-welcome-recent-list">
                                ${this.recentConnections.slice(0, 8).map(conn => `
                                    <div class="ssh-recent-item" data-connection='${this.escapeHtml(JSON.stringify(conn))}'>
                                        <span class="ssh-recent-icon">🔗</span>
                                        <div class="ssh-recent-content">
                                            <div class="ssh-recent-name">${this.escapeHtml(conn.name || conn.host)}</div>
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    ` : ''}

                    <!-- Footer -->
                    <div class="ssh-welcome-footer">
                        <div class="ssh-welcome-help">
                            <p>Press <kbd>Ctrl+Shift+S</kbd> for quick connect • <kbd>Esc</kbd> to go back</p>
                        </div>
                    </div>
                </div>
            </div>
        `;

        logger.debug('sshWelcome', '✓ SSH Welcome Screen rendered');
    }

    /**
     * Render a single server item
     * @param {Object} server - Server configuration
     * @returns {string} HTML string for server item
     */
    renderServerItem(server) {
        const statusIcon = this.getServerStatusIcon(server);
        const statusClass = this.getServerStatusClass(server);
        const lastConnected = server.lastConnected
            ? this.formatRelativeTime(server.lastConnected)
            : 'Never connected';

        return `
            <div class="ssh-server-item" data-server-id="${server.id}">
                <span class="ssh-server-status ${statusClass}">${statusIcon}</span>
                <div class="ssh-server-content">
                    <div class="ssh-server-name">${this.escapeHtml(server.name)}</div>
                    <div class="ssh-server-host">${this.escapeHtml(server.username)}@${this.escapeHtml(server.host)}:${server.port || 22}</div>
                    <div class="ssh-server-meta">Last connected: ${lastConnected}</div>
                </div>
                <div class="ssh-server-actions">
                    <button class="ssh-server-btn-connect" data-action="connect">Connect</button>
                    <button class="ssh-server-btn-edit" data-action="edit">Edit</button>
                    <button class="ssh-server-btn-delete" data-action="delete">Delete</button>
                </div>
            </div>
        `;
    }

    /**
     * Get server status icon
     * @param {Object} server - Server configuration
     * @returns {string} Status emoji
     */
    getServerStatusIcon(server) {
        if (server.status === 'connected') return '🟢';
        if (server.status === 'connecting') return '🟡';
        if (server.status === 'error') return '🔴';
        return '⚫';
    }

    /**
     * Update server status in real-time
     * @param {string} serverId - Server ID
     * @param {string} status - New status (connecting, connected, disconnected, error)
     * @param {string} errorMessage - Optional error message
     */
    updateServerStatus(serverId, status, errorMessage = null) {
        const server = this.savedServers.find(s => s.id === serverId);
        if (!server) return;

        server.status = status;
        if (errorMessage) {
            server.lastError = errorMessage;
        }

        // Update in config
        this.config.set('sshServers', this.savedServers, true);

        // Update UI if visible
        if (!this.isVisible) return;

        const serverItem = this.container.querySelector(`[data-server-id="${serverId}"]`);
        if (!serverItem) return;

        const statusEl = serverItem.querySelector('.ssh-server-status');
        if (statusEl) {
            statusEl.className = `ssh-server-status ${status}`;
            statusEl.textContent = this.getServerStatusIcon(server);
        }

        // Update last connected time if connected
        if (status === 'connected' && !server.lastConnected) {
            server.lastConnected = Date.now();
            const metaEl = serverItem.querySelector('.ssh-server-meta');
            if (metaEl) {
                metaEl.textContent = `Last connected: ${this.formatRelativeTime(server.lastConnected)}`;
            }
        }

        logger.debug('sshWelcome', `Server status updated: ${serverId} -> ${status}`);
    }

    /**
     * Get server status CSS class
     * @param {Object} server - Server configuration
     * @returns {string} Status class name
     */
    getServerStatusClass(server) {
        return server.status || 'disconnected';
    }

    /**
     * Format relative time (e.g., "2 hours ago")
     * @param {number|string} timestamp - Timestamp to format
     * @returns {string} Relative time string
     */
    formatRelativeTime(timestamp) {
        const now = Date.now();
        const then = typeof timestamp === 'number' ? timestamp : new Date(timestamp).getTime();
        const diff = now - then;

        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
        if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
        if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
        return 'just now';
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        logger.debug('sshWelcome', 'Setting up event listeners...');

        // Back button
        const backBtn = this.container.querySelector('#ssh-back-btn');
        if (backBtn) {
            backBtn.addEventListener('click', () => {
                logger.debug('sshWelcome', 'Back button clicked');
                this.hide();
                eventBus.emit('welcome:show-main-screen');
            });
        }

        // Quick Connect button
        const quickConnectBtn = this.container.querySelector('#ssh-quick-connect-btn');
        if (quickConnectBtn) {
            quickConnectBtn.addEventListener('click', async () => {
                logger.debug('sshWelcome', 'Quick Connect button clicked');
                await this.handleQuickConnect();
            });
        }

        // Add Server button
        const addServerBtn = this.container.querySelector('#ssh-add-server-btn');
        if (addServerBtn) {
            addServerBtn.addEventListener('click', async () => {
                logger.debug('sshWelcome', 'Add Server button clicked');
                await this.handleAddServer();
            });
        }

        // SSH Settings button
        const settingsBtn = this.container.querySelector('#ssh-settings-btn');
        if (settingsBtn) {
            settingsBtn.addEventListener('click', async () => {
                logger.debug('sshWelcome', 'SSH Settings button clicked');
                await modal.alert('Coming Soon', 'SSH Settings functionality coming soon!');
            });
        }

        // Import Config button
        const importBtn = this.container.querySelector('#ssh-import-btn');
        if (importBtn) {
            importBtn.addEventListener('click', async () => {
                logger.debug('sshWelcome', 'Import Config button clicked');
                await this.handleImportConfig();
            });
        }

        // Export button
        const exportBtn = this.container.querySelector('#ssh-export-btn');
        if (exportBtn) {
            exportBtn.addEventListener('click', async () => {
                logger.debug('sshWelcome', 'Export button clicked');
                await this.handleExportConfig();
            });
        }

        // Server item actions
        const serverItems = this.container.querySelectorAll('.ssh-server-item');
        serverItems.forEach(item => {
            const serverId = item.dataset.serverId;

            // Click on item to connect
            item.addEventListener('click', async (e) => {
                // Don't trigger if clicking on action buttons
                if (e.target.closest('.ssh-server-actions')) return;

                logger.debug('sshWelcome', 'Server item clicked:', serverId);
                await this.handleServerConnect(serverId);
            });

            // Action buttons
            const connectBtn = item.querySelector('[data-action="connect"]');
            const editBtn = item.querySelector('[data-action="edit"]');
            const deleteBtn = item.querySelector('[data-action="delete"]');

            if (connectBtn) {
                connectBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    logger.debug('sshWelcome', 'Connect button clicked for:', serverId);
                    await this.handleServerConnect(serverId);
                });
            }

            if (editBtn) {
                editBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    logger.debug('sshWelcome', 'Edit button clicked for:', serverId);
                    await this.handleServerEdit(serverId);
                });
            }

            if (deleteBtn) {
                deleteBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    logger.debug('sshWelcome', 'Delete button clicked for:', serverId);
                    await this.handleServerDelete(serverId);
                });
            }
        });

        // Recent connection items
        const recentItems = this.container.querySelectorAll('.ssh-recent-item');
        recentItems.forEach(item => {
            item.addEventListener('click', async () => {
                try {
                    const connData = JSON.parse(item.dataset.connection);
                    logger.debug('sshWelcome', 'Recent connection clicked:', connData);
                    await this.handleRecentConnectionClick(connData);
                } catch (error) {
                    logger.error('sshWelcome', 'Failed to parse recent connection data:', error);
                }
            });
        });

        // Keyboard shortcuts
        const handleKeydown = (e) => {
            // Esc to go back
            if (e.key === 'Escape' && this.isVisible) {
                this.hide();
                eventBus.emit('welcome:show-main-screen');
            }

            // Ctrl+Shift+S for quick connect
            if (e.ctrlKey && e.shiftKey && e.key === 'S' && this.isVisible) {
                e.preventDefault();
                this.handleQuickConnect();
            }
        };

        document.addEventListener('keydown', handleKeydown);
        this._keydownHandler = handleKeydown;

        logger.debug('sshWelcome', '✓ Event listeners setup complete');
    }

    /**
     * Handle quick connect action
     */
    async handleQuickConnect() {
        try {
            logger.info('sshWelcome', 'Starting quick connect flow...');

            // Get host
            const host = await modal.prompt('SSH Quick Connect', 'Enter SSH host (e.g., user@hostname):');
            if (!host || !host.trim()) return;

            const parts = host.includes('@') ? host.split('@') : ['', host];
            let username = parts[0];
            const hostname = parts[1] || host;

            // Get username if not provided
            if (!username) {
                username = await modal.prompt('SSH Quick Connect', 'Enter username:');
            }

            if (!username || !hostname) {
                await modal.alert('Invalid Input', 'Invalid host format. Please use user@hostname or provide username separately.');
                return;
            }

            // Get port
            const portStr = await modal.prompt('SSH Quick Connect', 'Enter port (default: 22):', '22');
            const port = parseInt(portStr) || 22;

            // Get password
            const password = await modal.prompt('SSH Quick Connect', 'Enter password (leave empty for key authentication):');

            const connectionConfig = {
                name: `Quick Connect - ${hostname}`,
                host: hostname,
                username: username,
                port: port,
                isQuickConnect: true
            };

            if (password && password.trim()) {
                connectionConfig.password = password;
            }

            // Add to recent connections
            await this.addToRecentConnections(connectionConfig);

            // Create and connect
            await this.createAndConnectSSH(connectionConfig);

        } catch (error) {
            logger.error('sshWelcome', 'Quick connect error:', error);
            await modal.alert('Connection Error', 'Failed to process quick connect: ' + error.message);
        }
    }

    /**
     * Handle add server action
     */
    async handleAddServer() {
        try {
            logger.info('sshWelcome', 'Opening Add Server dialog...');

            const dialog = new SSHServerConfigDialog();
            const result = await dialog.show();

            if (result) {
                // Generate unique ID for the server
                const serverId = 'ssh_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

                // Extract password and passphrase before saving config
                const password = result.password;
                const passphrase = result.passphrase;

                // Create server config without sensitive data
                const serverConfig = {
                    ...result,
                    id: serverId,
                    status: 'disconnected',
                    lastConnected: null,
                    createdAt: Date.now()
                };

                // Remove sensitive data from config
                delete serverConfig.password;
                delete serverConfig.passphrase;

                // Store password/passphrase in keytar if provided
                if (password && keytarService.isKeytarAvailable()) {
                    const stored = await keytarService.setPassword(serverId, password);
                    if (stored) {
                        logger.debug('sshWelcome', 'Password stored securely for server:', serverId);
                    } else {
                        logger.warn('sshWelcome', 'Failed to store password securely');
                    }
                }

                if (passphrase && keytarService.isKeytarAvailable()) {
                    const stored = await keytarService.setKeyPassphrase(serverId, passphrase);
                    if (stored) {
                        logger.debug('sshWelcome', 'Passphrase stored securely for server:', serverId);
                    } else {
                        logger.warn('sshWelcome', 'Failed to store passphrase securely');
                    }
                }

                // Add to saved servers
                this.savedServers.push(serverConfig);
                this.config.set('sshServers', this.savedServers, true);

                logger.info('sshWelcome', 'Server added successfully:', serverConfig.name);

                // Re-render to show new server
                this.render();
                this.setupEventListeners();

                // Show success message
                await modal.alert('Server Added', `Server "${serverConfig.name}" has been added successfully!`);
            }

        } catch (error) {
            logger.error('sshWelcome', 'Failed to add server:', error);
            await modal.alert('Add Server Failed', 'Failed to add server: ' + error.message);
        }
    }

    /**
     * Handle server connect action
     * @param {string} serverId - Server ID
     */
    async handleServerConnect(serverId) {
        try {
            const server = this.savedServers.find(s => s.id === serverId);
            if (!server) {
                logger.error('sshWelcome', 'Server not found:', serverId);
                return;
            }

            logger.info('sshWelcome', 'Connecting to server:', server.name);

            // Load credentials from keytar
            const connectionConfig = { ...server };

            if (keytarService.isKeytarAvailable()) {
                const password = await keytarService.getPassword(serverId);
                const passphrase = await keytarService.getKeyPassphrase(serverId);

                if (password) {
                    connectionConfig.password = password;
                    logger.debug('sshWelcome', 'Password loaded from keytar for server:', serverId);
                }

                if (passphrase) {
                    connectionConfig.passphrase = passphrase;
                    logger.debug('sshWelcome', 'Passphrase loaded from keytar for server:', serverId);
                }
            }

            await this.createAndConnectSSH(connectionConfig);

        } catch (error) {
            logger.error('sshWelcome', 'Server connect error:', error);
            await modal.alert('Connection Failed', 'Failed to connect to server: ' + error.message);
        }
    }

    /**
     * Handle server edit action
     * @param {string} serverId - Server ID
     */
    async handleServerEdit(serverId) {
        try {
            const server = this.savedServers.find(s => s.id === serverId);
            if (!server) {
                logger.error('sshWelcome', 'Server not found for editing:', serverId);
                await modal.alert('Server Not Found', 'The selected server could not be found.');
                return;
            }

            logger.info('sshWelcome', 'Opening Edit Server dialog for:', server.name);

            // Load existing password/passphrase from keytar for the dialog
            const existingPassword = await keytarService.getPassword(serverId);
            const existingPassphrase = await keytarService.getKeyPassphrase(serverId);

            const serverWithCredentials = {
                ...server,
                password: existingPassword || '',
                passphrase: existingPassphrase || ''
            };

            const dialog = new SSHServerConfigDialog();
            const result = await dialog.show(serverWithCredentials);

            if (result) {
                // Extract password and passphrase
                const password = result.password;
                const passphrase = result.passphrase;

                // Update the server configuration (preserve id and timestamps)
                const updatedServer = {
                    ...result,
                    id: server.id,
                    createdAt: server.createdAt,
                    lastConnected: server.lastConnected,
                    status: server.status
                };

                // Remove sensitive data from config
                delete updatedServer.password;
                delete updatedServer.passphrase;

                // Update password in keytar if changed
                if (password && password !== existingPassword && keytarService.isKeytarAvailable()) {
                    const stored = await keytarService.setPassword(serverId, password);
                    if (stored) {
                        logger.debug('sshWelcome', 'Password updated securely for server:', serverId);
                    } else {
                        logger.warn('sshWelcome', 'Failed to update password securely');
                    }
                } else if (!password && existingPassword) {
                    // Password was removed
                    await keytarService.deletePassword(serverId);
                    logger.debug('sshWelcome', 'Password removed from keytar for server:', serverId);
                }

                // Update passphrase in keytar if changed
                if (passphrase && passphrase !== existingPassphrase && keytarService.isKeytarAvailable()) {
                    const stored = await keytarService.setKeyPassphrase(serverId, passphrase);
                    if (stored) {
                        logger.debug('sshWelcome', 'Passphrase updated securely for server:', serverId);
                    } else {
                        logger.warn('sshWelcome', 'Failed to update passphrase securely');
                    }
                } else if (!passphrase && existingPassphrase) {
                    // Passphrase was removed
                    await keytarService.deleteKeyPassphrase(serverId);
                    logger.debug('sshWelcome', 'Passphrase removed from keytar for server:', serverId);
                }

                // Replace the server in the array
                const index = this.savedServers.findIndex(s => s.id === serverId);
                if (index !== -1) {
                    this.savedServers[index] = updatedServer;
                    this.config.set('sshServers', this.savedServers, true);

                    logger.info('sshWelcome', 'Server updated successfully:', updatedServer.name);

                    // Re-render to show updated server
                    this.render();
                    this.setupEventListeners();

                    await modal.alert('Server Updated', `Server "${updatedServer.name}" has been updated successfully!`);
                }
            }

        } catch (error) {
            logger.error('sshWelcome', 'Failed to edit server:', error);
            await modal.alert('Edit Server Failed', 'Failed to update server: ' + error.message);
        }
    }

    /**
     * Handle server delete action
     * @param {string} serverId - Server ID
     */
    async handleServerDelete(serverId) {
        const confirmed = await modal.confirm(
            'Delete Server',
            'Are you sure you want to delete this server configuration?'
        );

        if (confirmed) {
            try {
                // Clear credentials from keytar
                if (keytarService.isKeytarAvailable()) {
                    await keytarService.clearServerCredentials(serverId);
                    logger.debug('sshWelcome', 'Server credentials cleared from keytar:', serverId);
                }

                // Remove from saved servers
                this.savedServers = this.savedServers.filter(s => s.id !== serverId);
                this.config.set('sshServers', this.savedServers, true);

                // Re-render
                this.render();
                this.setupEventListeners();

                logger.info('sshWelcome', 'Server deleted:', serverId);
            } catch (error) {
                logger.error('sshWelcome', 'Failed to delete server:', error);
                await modal.alert('Delete Failed', 'Failed to delete server: ' + error.message);
            }
        }
    }

    /**
     * Handle recent connection click
     * @param {Object} connData - Connection data
     */
    async handleRecentConnectionClick(connData) {
        logger.info('sshWelcome', 'Reconnecting to recent connection:', connData.name);
        await this.createAndConnectSSH(connData);
    }

    /**
     * Create and connect SSH connection
     * @param {Object} connectionConfig - SSH connection configuration
     */
    async createAndConnectSSH(connectionConfig) {
        const progress = new SSHConnectionProgress();

        try {
            if (!this.sshService || !this.sshService.isInitialized()) {
                await modal.alert('Service Unavailable', 'SSH service not available.');
                return;
            }

            // Update server status to connecting if it's a saved server
            if (connectionConfig.id) {
                this.updateServerStatus(connectionConfig.id, 'connecting');
            }

            // Show progress indicator
            progress.show(connectionConfig.name || connectionConfig.host);

            logger.info('sshWelcome', 'Creating SSH connection:', connectionConfig.name);

            // Stage 1: Initializing
            progress.updateStage('initializing');
            await new Promise(resolve => setTimeout(resolve, 300)); // Brief pause for visual feedback

            // Stage 2: Connecting
            progress.updateStage('connecting', `${connectionConfig.username}@${connectionConfig.host}:${connectionConfig.port || 22}`);

            const connectionId = await this.sshService.createConnection(connectionConfig);
            logger.info('sshWelcome', 'SSH connection created with ID:', connectionId);

            // Stage 3: Authenticating
            progress.updateStage('authenticating');

            await this.sshService.connect(connectionId);
            logger.info('sshWelcome', 'SSH connection established successfully');

            // Stage 4: Establishing session
            progress.updateStage('establishing');
            await new Promise(resolve => setTimeout(resolve, 200)); // Brief pause

            // Stage 5: Loading workspace
            progress.updateStage('loading');

            // Update server status to connected and last connected time
            if (connectionConfig.id) {
                const server = this.savedServers.find(s => s.id === connectionConfig.id);
                if (server) {
                    server.lastConnected = Date.now();
                    server.status = 'connected';
                    this.config.set('sshServers', this.savedServers, true);
                }
                this.updateServerStatus(connectionConfig.id, 'connected');
            }

            // Treat SSH connection like opening a folder - transition to main IDE
            // Use explorer:open-folder to trigger the opening (not explorer:directory-opened to avoid empty handler)
            eventBus.emit('explorer:open-folder', {
                path: `ssh://${connectionConfig.host}`,
                type: 'ssh',
                connectionId: connectionId,
                connectionConfig: connectionConfig
            });

            // Mark as complete
            progress.complete();

            // Hide SSH welcome screen
            this.hide();

            logger.info('sshWelcome', `SSH workspace opened for ${connectionConfig.host}`);

        } catch (error) {
            logger.error('sshWelcome', 'Failed to create/connect SSH:', error);
            progress.error(error.message || 'Connection failed');

            // Update server status to error if it's a saved server
            if (connectionConfig.id) {
                this.updateServerStatus(connectionConfig.id, 'error', error.message);
            }

            // Wait a bit before showing alert so user can see the error in progress dialog
            await new Promise(resolve => setTimeout(resolve, 2000));
            await modal.alert('Connection Failed', 'Failed to connect to SSH server: ' + error.message);
        }
    }

    /**
     * Add connection to recent connections
     * @param {Object} connectionConfig - Connection configuration
     */
    async addToRecentConnections(connectionConfig) {
        try {
            // Don't add saved servers to recent connections
            if (!connectionConfig.isQuickConnect) return;

            // Remove password before saving to recent (security)
            const recentConn = {
                name: connectionConfig.name,
                host: connectionConfig.host,
                username: connectionConfig.username,
                port: connectionConfig.port,
                timestamp: Date.now()
            };

            // Remove duplicates based on host+username
            this.recentConnections = this.recentConnections.filter(
                conn => !(conn.host === recentConn.host && conn.username === recentConn.username)
            );

            // Add to beginning
            this.recentConnections.unshift(recentConn);

            // Limit to 8 most recent
            this.recentConnections = this.recentConnections.slice(0, 8);

            // Save to config
            this.config.set('sshRecentConnections', this.recentConnections);

            logger.debug('sshWelcome', 'Added to recent connections:', recentConn.name);

        } catch (error) {
            logger.error('sshWelcome', 'Failed to add to recent connections:', error);
        }
    }

    /**
     * Escape HTML to prevent XSS
     * @param {string} text - Text to escape
     * @returns {string} Escaped text
     */
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = String(text);
        return div.innerHTML;
    }

    /**
     * Show the SSH welcome screen
     */
    show() {
        logger.debug('sshWelcome', 'Showing SSH Welcome Screen');
        this.container.style.display = 'block';
        this.isVisible = true;

        // Re-render to update data
        this.loadSavedServers().then(() => {
            this.loadRecentConnections().then(() => {
                this.render();
                this.setupEventListeners();
            });
        });
    }

    /**
     * Hide the SSH welcome screen
     */
    hide() {
        logger.debug('sshWelcome', 'Hiding SSH Welcome Screen');
        this.container.style.display = 'none';
        this.isVisible = false;

        // Remove keyboard listener
        if (this._keydownHandler) {
            document.removeEventListener('keydown', this._keydownHandler);
            this._keydownHandler = null;
        }
    }

    /**
     * Handle import config action
     */
    async handleImportConfig() {
        try {
            logger.info('sshWelcome', 'Opening import dialog...');

            // Use Electron IPC to request file dialog
            const { ipcRenderer } = require('electron');
            const result = await ipcRenderer.invoke('show-open-dialog', {
                title: 'Import SSH Configuration',
                filters: [
                    { name: 'JSON Files', extensions: ['json'] },
                    { name: 'All Files', extensions: ['*'] }
                ],
                properties: ['openFile']
            });

            if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
                logger.debug('sshWelcome', 'Import canceled');
                return;
            }

            const filePath = result.filePaths[0];
            logger.info('sshWelcome', 'Importing from:', filePath);

            // Read and parse file
            const fs = require('fs');
            const fileContent = fs.readFileSync(filePath, 'utf8');
            const importedData = JSON.parse(fileContent);

            // Validate imported data
            if (!importedData.servers || !Array.isArray(importedData.servers)) {
                throw new Error('Invalid configuration file format. Expected a "servers" array.');
            }

            // Ask for confirmation
            const confirmed = await modal.confirm(
                'Import Configuration',
                `Import ${importedData.servers.length} server(s)?\n\nNote: Passwords are not included in exports for security. You'll need to re-enter them.`
            );

            if (!confirmed) return;

            // Import servers
            let importedCount = 0;
            let skippedCount = 0;

            for (const server of importedData.servers) {
                // Validate server structure
                if (!server.name || !server.host || !server.username) {
                    logger.warn('sshWelcome', 'Skipping invalid server:', server);
                    skippedCount++;
                    continue;
                }

                // Generate new ID
                const serverId = 'ssh_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

                // Create server config
                const serverConfig = {
                    ...server,
                    id: serverId,
                    status: 'disconnected',
                    lastConnected: null,
                    createdAt: Date.now()
                };

                // Add to saved servers
                this.savedServers.push(serverConfig);
                importedCount++;

                logger.debug('sshWelcome', 'Imported server:', serverConfig.name);
            }

            // Save to config
            this.config.set('sshServers', this.savedServers, true);

            // Re-render
            this.render();
            this.setupEventListeners();

            await modal.alert(
                'Import Complete',
                `Successfully imported ${importedCount} server(s).${skippedCount > 0 ? ` Skipped ${skippedCount} invalid entries.` : ''}`
            );

            logger.info('sshWelcome', `Import complete: ${importedCount} imported, ${skippedCount} skipped`);

        } catch (error) {
            logger.error('sshWelcome', 'Failed to import config:', error);
            await modal.alert('Import Failed', 'Failed to import configuration: ' + error.message);
        }
    }

    /**
     * Handle export config action
     */
    async handleExportConfig() {
        try {
            if (this.savedServers.length === 0) {
                await modal.alert('No Servers', 'No servers to export. Add some servers first.');
                return;
            }

            logger.info('sshWelcome', 'Opening export dialog...');

            // Use Electron IPC to request save dialog
            const { ipcRenderer } = require('electron');
            const result = await ipcRenderer.invoke('show-save-dialog', {
                title: 'Export SSH Configuration',
                defaultPath: `swarm-ssh-config-${new Date().toISOString().split('T')[0]}.json`,
                filters: [
                    { name: 'JSON Files', extensions: ['json'] },
                    { name: 'All Files', extensions: ['*'] }
                ]
            });

            if (result.canceled || !result.filePath) {
                logger.debug('sshWelcome', 'Export canceled');
                return;
            }

            const filePath = result.filePath;
            logger.info('sshWelcome', 'Exporting to:', filePath);

            // Prepare export data (exclude sensitive information)
            const exportData = {
                version: '1.0',
                exportDate: new Date().toISOString(),
                servers: this.savedServers.map(server => ({
                    name: server.name,
                    host: server.host,
                    port: server.port,
                    username: server.username,
                    authMethod: server.authMethod,
                    keyPath: server.keyPath,
                    defaultPath: server.defaultPath,
                    tags: server.tags,
                    autoConnect: server.autoConnect
                    // Note: password, passphrase, and other sensitive data excluded
                }))
            };

            // Write to file
            const fs = require('fs');
            fs.writeFileSync(filePath, JSON.stringify(exportData, null, 2), 'utf8');

            await modal.alert(
                'Export Complete',
                `Successfully exported ${exportData.servers.length} server(s) to:\n${filePath}\n\nNote: Passwords were not exported for security reasons.`
            );

            logger.info('sshWelcome', `Export complete: ${exportData.servers.length} servers`);

        } catch (error) {
            logger.error('sshWelcome', 'Failed to export config:', error);
            await modal.alert('Export Failed', 'Failed to export configuration: ' + error.message);
        }
    }

    /**
     * Cleanup
     */
    destroy() {
        this.hide();
        this.container.innerHTML = '';
    }
}

module.exports = SSHWelcomeScreen;

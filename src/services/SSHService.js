/**
 * SSHService - Renderer process SSH service
 *
 * Provides a clean API for SSH operations in the renderer process.
 * Communicates with the main process SSHConnectionManager via IPC.
 * Integrates with Swarm-IDE's EventBus system for real-time updates.
 *
 * Features:
 * - SSH connection management
 * - SFTP file operations
 * - Command execution
 * - File transfers
 * - Connection monitoring
 * - Event-driven state updates
 *
 * Usage:
 *   const sshService = require('./SSHService');
 *   await sshService.initialize(electronAPI);
 *   const connectionId = await sshService.createConnection(config);
 *   await sshService.connect(connectionId);
 */

const logger = require('../utils/Logger');
const eventBus = require('../modules/EventBus');

class SSHService {
    constructor() {
        this.api = null;
        this.initialized = false;
        this.connections = new Map(); // connectionId -> connection info
        this.cache = new Map(); // Cache for directory listings and file stats

        logger.debug('ssh', 'SSH Service initialized');
    }

    /**
     * Initialize the SSH service with Electron API
     * @param {Object} electronAPI - The API exposed via preload script
     */
    async initialize(electronAPI) {
        logger.debug('ssh', 'SSH Service initialize() called, current state:', this.initialized);

        if (this.initialized) {
            logger.debug('ssh', 'SSH Service already initialized, returning');
            return;
        }

        logger.debug('ssh', 'Setting up SSH Service with electronAPI:', !!electronAPI);
        this.api = electronAPI;

        try {
            logger.debug('ssh', 'Calling sshInit on main process...');
            // Initialize SSH in main process
            const result = await this.api.sshInit();
            logger.debug('ssh', 'sshInit result:', result);

            if (!result.success) {
                throw new Error(result.error);
            }

            logger.debug('ssh', 'Loading existing connections...');
            // Load existing connections
            await this.loadConnections();

            this.initialized = true;
            logger.debug('ssh', 'SSH Service initialization complete, emitting event');
            eventBus.emit('ssh:serviceInitialized');
            logger.info('ssh', 'SSH Service initialized successfully');

        } catch (error) {
            logger.error('ssh', 'Failed to initialize SSH Service:', error.message);
            logger.error('ssh', 'Error stack:', error.stack);
            throw error;
        }
    }

    /**
     * Create a new SSH connection
     * @param {Object} connectionConfig - SSH connection configuration
     * @returns {Promise<string>} Connection ID
     */
    async createConnection(connectionConfig) {
        if (!this.initialized) {
            throw new Error('SSH Service not initialized');
        }

        try {
            const result = await this.api.sshCreateConnection(connectionConfig);
            if (!result.success) {
                throw new Error(result.error);
            }

            const connectionId = result.connectionId;

            // Store connection info locally
            this.connections.set(connectionId, {
                id: connectionId,
                ...connectionConfig,
                state: 'disconnected',
                lastConnected: null
            });

            eventBus.emit('ssh:connectionCreated', { id: connectionId, config: connectionConfig });
            logger.info('ssh', `SSH connection created: ${connectionId}`);

            return connectionId;

        } catch (error) {
            logger.error('ssh', 'Failed to create SSH connection:', error.message);
            throw error;
        }
    }

    /**
     * Connect to SSH server
     * @param {string} connectionId - Connection ID
     */
    async connect(connectionId) {
        if (!this.initialized) {
            throw new Error('SSH Service not initialized');
        }

        try {
            const result = await this.api.sshConnect(connectionId);
            if (!result.success) {
                throw new Error(result.error);
            }

            // Update local connection info
            const connection = this.connections.get(connectionId);
            if (connection) {
                connection.state = 'connected';
                connection.lastConnected = new Date();
            }

            eventBus.emit('ssh:connected', { id: connectionId });
            logger.info('ssh', `Connected to SSH server: ${connectionId}`);

        } catch (error) {
            logger.error('ssh', `Failed to connect to SSH server ${connectionId}:`, error.message);
            eventBus.emit('ssh:connectionError', { id: connectionId, error });
            throw error;
        }
    }

    /**
     * Disconnect from SSH server
     * @param {string} connectionId - Connection ID
     */
    async disconnect(connectionId) {
        if (!this.initialized) {
            throw new Error('SSH Service not initialized');
        }

        try {
            const result = await this.api.sshDisconnect(connectionId);
            if (!result.success) {
                throw new Error(result.error);
            }

            // Update local connection info
            const connection = this.connections.get(connectionId);
            if (connection) {
                connection.state = 'disconnected';
            }

            // Clear cache for this connection
            this.clearCacheForConnection(connectionId);

            eventBus.emit('ssh:disconnected', { id: connectionId });
            logger.info('ssh', `Disconnected from SSH server: ${connectionId}`);

        } catch (error) {
            logger.error('ssh', `Failed to disconnect from SSH server ${connectionId}:`, error.message);
            throw error;
        }
    }

    /**
     * Remove SSH connection
     * @param {string} connectionId - Connection ID
     */
    async removeConnection(connectionId) {
        if (!this.initialized) {
            throw new Error('SSH Service not initialized');
        }

        try {
            const result = await this.api.sshRemoveConnection(connectionId);
            if (!result.success) {
                throw new Error(result.error);
            }

            // Remove from local storage
            this.connections.delete(connectionId);
            this.clearCacheForConnection(connectionId);

            eventBus.emit('ssh:connectionRemoved', { id: connectionId });
            logger.info('ssh', `SSH connection removed: ${connectionId}`);

        } catch (error) {
            logger.error('ssh', `Failed to remove SSH connection ${connectionId}:`, error.message);
            throw error;
        }
    }

    /**
     * Get all SSH connections
     * @returns {Promise<Array>} Array of connection info
     */
    async getConnections() {
        logger.debug('ssh', 'getConnections() called, initialized state:', this.initialized);

        if (!this.initialized) {
            logger.error('ssh', 'getConnections called but service not initialized!');
            throw new Error('SSH Service not initialized');
        }

        try {
            logger.debug('ssh', 'Calling sshGetConnections via API...');
            const result = await this.api.sshGetConnections();
            logger.debug('ssh', 'sshGetConnections result:', result);

            if (!result.success) {
                throw new Error(result.error);
            }

            // Update local cache
            result.connections.forEach(conn => {
                this.connections.set(conn.id, conn);
            });

            logger.debug('ssh', 'Successfully retrieved connections, count:', result.connections.length);
            return result.connections;

        } catch (error) {
            logger.error('ssh', 'Failed to get SSH connections:', error.message);
            logger.error('ssh', 'Get connections error stack:', error.stack);
            throw error;
        }
    }

    /**
     * Get specific SSH connection info
     * @param {string} connectionId - Connection ID
     * @returns {Promise<Object>} Connection info
     */
    async getConnection(connectionId) {
        if (!this.initialized) {
            throw new Error('SSH Service not initialized');
        }

        try {
            const result = await this.api.sshGetConnection(connectionId);
            if (!result.success) {
                throw new Error(result.error);
            }

            // Update local cache
            this.connections.set(connectionId, result.connection);

            return result.connection;

        } catch (error) {
            logger.error('ssh', `Failed to get SSH connection ${connectionId}:`, error.message);
            throw error;
        }
    }

    /**
     * Execute command on SSH server
     * @param {string} connectionId - Connection ID
     * @param {string} command - Command to execute
     * @param {Object} options - Execution options
     * @returns {Promise<Object>} Command result
     */
    async execCommand(connectionId, command, options = {}) {
        if (!this.initialized) {
            throw new Error('SSH Service not initialized');
        }

        try {
            const result = await this.api.sshExecCommand(connectionId, command, options);
            if (!result.success) {
                throw new Error(result.error);
            }

            logger.debug('ssh', `Command executed on ${connectionId}: ${command}`);
            return result.result;

        } catch (error) {
            logger.error('ssh', `Failed to execute command on ${connectionId}:`, error.message);
            throw error;
        }
    }

    /**
     * List directory contents on SSH server
     * @param {string} connectionId - Connection ID
     * @param {string} remotePath - Remote directory path
     * @param {boolean} useCache - Whether to use cached results
     * @returns {Promise<Array>} Directory entries
     */
    async listDirectory(connectionId, remotePath, useCache = false) {
        if (!this.initialized) {
            throw new Error('SSH Service not initialized');
        }

        const cacheKey = `${connectionId}:${remotePath}`;

        // Check cache first if enabled
        if (useCache && this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        try {
            const result = await this.api.sshListDirectory(connectionId, remotePath);
            if (!result.success) {
                throw new Error(result.error);
            }

            // Cache the result
            this.cache.set(cacheKey, result.entries);

            logger.debug('ssh', `Directory listed on ${connectionId}: ${remotePath}`);
            return result.entries;

        } catch (error) {
            logger.error('ssh', `Failed to list directory on ${connectionId}:`, error.message);
            throw error;
        }
    }

    /**
     * Read file contents from SSH server
     * @param {string} connectionId - Connection ID
     * @param {string} remotePath - Remote file path
     * @param {string} encoding - File encoding
     * @returns {Promise<string>} File content
     */
    async readFile(connectionId, remotePath, encoding = 'utf8') {
        if (!this.initialized) {
            throw new Error('SSH Service not initialized');
        }

        try {
            const result = await this.api.sshReadFile(connectionId, remotePath, encoding);
            if (!result.success) {
                throw new Error(result.error);
            }

            logger.debug('ssh', `File read from ${connectionId}: ${remotePath}`);
            return result.content;

        } catch (error) {
            logger.error('ssh', `Failed to read file from ${connectionId}:`, error.message);
            throw error;
        }
    }

    /**
     * Write file contents to SSH server
     * @param {string} connectionId - Connection ID
     * @param {string} remotePath - Remote file path
     * @param {string} content - File content
     * @param {string} encoding - File encoding
     */
    async writeFile(connectionId, remotePath, content, encoding = 'utf8') {
        if (!this.initialized) {
            throw new Error('SSH Service not initialized');
        }

        try {
            const result = await this.api.sshWriteFile(connectionId, remotePath, content, encoding);
            if (!result.success) {
                throw new Error(result.error);
            }

            // Invalidate cache for parent directory
            this.invalidateDirectoryCache(connectionId, remotePath);

            eventBus.emit('ssh:fileChanged', { connectionId, path: remotePath, type: 'write' });
            logger.debug('ssh', `File written to ${connectionId}: ${remotePath}`);

        } catch (error) {
            logger.error('ssh', `Failed to write file to ${connectionId}:`, error.message);
            throw error;
        }
    }

    /**
     * Create directory on SSH server
     * @param {string} connectionId - Connection ID
     * @param {string} remotePath - Remote directory path
     */
    async createDirectory(connectionId, remotePath) {
        if (!this.initialized) {
            throw new Error('SSH Service not initialized');
        }

        try {
            const result = await this.api.sshCreateDirectory(connectionId, remotePath);
            if (!result.success) {
                throw new Error(result.error);
            }

            // Invalidate cache for parent directory
            this.invalidateDirectoryCache(connectionId, remotePath);

            eventBus.emit('ssh:fileChanged', { connectionId, path: remotePath, type: 'create' });
            logger.debug('ssh', `Directory created on ${connectionId}: ${remotePath}`);

        } catch (error) {
            logger.error('ssh', `Failed to create directory on ${connectionId}:`, error.message);
            throw error;
        }
    }

    /**
     * Delete item from SSH server
     * @param {string} connectionId - Connection ID
     * @param {string} remotePath - Remote item path
     * @param {boolean} isDirectory - Whether the item is a directory
     */
    async deleteItem(connectionId, remotePath, isDirectory = false) {
        if (!this.initialized) {
            throw new Error('SSH Service not initialized');
        }

        try {
            const result = await this.api.sshDeleteItem(connectionId, remotePath, isDirectory);
            if (!result.success) {
                throw new Error(result.error);
            }

            // Invalidate cache for parent directory
            this.invalidateDirectoryCache(connectionId, remotePath);

            eventBus.emit('ssh:fileChanged', { connectionId, path: remotePath, type: 'delete' });
            logger.debug('ssh', `Item deleted from ${connectionId}: ${remotePath}`);

        } catch (error) {
            logger.error('ssh', `Failed to delete item from ${connectionId}:`, error.message);
            throw error;
        }
    }

    /**
     * Rename/move item on SSH server
     * @param {string} connectionId - Connection ID
     * @param {string} oldPath - Current path
     * @param {string} newPath - New path
     */
    async renameItem(connectionId, oldPath, newPath) {
        if (!this.initialized) {
            throw new Error('SSH Service not initialized');
        }

        try {
            const result = await this.api.sshRenameItem(connectionId, oldPath, newPath);
            if (!result.success) {
                throw new Error(result.error);
            }

            // Invalidate cache for both old and new parent directories
            this.invalidateDirectoryCache(connectionId, oldPath);
            this.invalidateDirectoryCache(connectionId, newPath);

            eventBus.emit('ssh:fileChanged', { connectionId, path: oldPath, newPath, type: 'rename' });
            logger.debug('ssh', `Item renamed on ${connectionId}: ${oldPath} -> ${newPath}`);

        } catch (error) {
            logger.error('ssh', `Failed to rename item on ${connectionId}:`, error.message);
            throw error;
        }
    }

    /**
     * Get file/directory stats from SSH server
     * @param {string} connectionId - Connection ID
     * @param {string} remotePath - Remote path
     * @returns {Promise<Object>} File stats
     */
    async getStats(connectionId, remotePath) {
        if (!this.initialized) {
            throw new Error('SSH Service not initialized');
        }

        try {
            const result = await this.api.sshGetStats(connectionId, remotePath);
            if (!result.success) {
                throw new Error(result.error);
            }

            return result.stats;

        } catch (error) {
            logger.error('ssh', `Failed to get stats from ${connectionId}:`, error.message);
            throw error;
        }
    }

    /**
     * Download file from SSH server
     * @param {string} connectionId - Connection ID
     * @param {string} remotePath - Remote file path
     * @param {string} localPath - Local file path
     */
    async downloadFile(connectionId, remotePath, localPath) {
        if (!this.initialized) {
            throw new Error('SSH Service not initialized');
        }

        try {
            const result = await this.api.sshDownloadFile(connectionId, remotePath, localPath);
            if (!result.success) {
                throw new Error(result.error);
            }

            eventBus.emit('ssh:fileTransfer', {
                connectionId,
                type: 'download',
                remotePath,
                localPath,
                status: 'completed'
            });
            logger.info('ssh', `File downloaded from ${connectionId}: ${remotePath} -> ${localPath}`);

        } catch (error) {
            eventBus.emit('ssh:fileTransfer', {
                connectionId,
                type: 'download',
                remotePath,
                localPath,
                status: 'error',
                error: error.message
            });
            logger.error('ssh', `Failed to download file from ${connectionId}:`, error.message);
            throw error;
        }
    }

    /**
     * Upload file to SSH server
     * @param {string} connectionId - Connection ID
     * @param {string} localPath - Local file path
     * @param {string} remotePath - Remote file path
     */
    async uploadFile(connectionId, localPath, remotePath) {
        if (!this.initialized) {
            throw new Error('SSH Service not initialized');
        }

        try {
            const result = await this.api.sshUploadFile(connectionId, localPath, remotePath);
            if (!result.success) {
                throw new Error(result.error);
            }

            // Invalidate cache for parent directory
            this.invalidateDirectoryCache(connectionId, remotePath);

            eventBus.emit('ssh:fileTransfer', {
                connectionId,
                type: 'upload',
                localPath,
                remotePath,
                status: 'completed'
            });
            logger.info('ssh', `File uploaded to ${connectionId}: ${localPath} -> ${remotePath}`);

        } catch (error) {
            eventBus.emit('ssh:fileTransfer', {
                connectionId,
                type: 'upload',
                localPath,
                remotePath,
                status: 'error',
                error: error.message
            });
            logger.error('ssh', `Failed to upload file to ${connectionId}:`, error.message);
            throw error;
        }
    }

    /**
     * Get SSH health status
     * @returns {Promise<Object>} Health status
     */
    async getHealthStatus() {
        if (!this.initialized) {
            throw new Error('SSH Service not initialized');
        }

        try {
            const result = await this.api.sshGetHealthStatus();
            if (!result.success) {
                throw new Error(result.error);
            }

            return result.status;

        } catch (error) {
            logger.error('ssh', 'Failed to get SSH health status:', error.message);
            throw error;
        }
    }

    /**
     * Clear cache for a specific connection
     * @param {string} connectionId - Connection ID
     */
    clearCacheForConnection(connectionId) {
        const keysToDelete = [];
        for (const key of this.cache.keys()) {
            if (key.startsWith(`${connectionId}:`)) {
                keysToDelete.push(key);
            }
        }
        keysToDelete.forEach(key => this.cache.delete(key));
        logger.debug('ssh', `Cache cleared for connection: ${connectionId}`);
    }

    /**
     * Invalidate directory cache for a path
     * @param {string} connectionId - Connection ID
     * @param {string} filePath - File path
     */
    invalidateDirectoryCache(connectionId, filePath) {
        const dirPath = filePath.substring(0, filePath.lastIndexOf('/'));
        const cacheKey = `${connectionId}:${dirPath}`;
        this.cache.delete(cacheKey);
        logger.debug('ssh', `Directory cache invalidated: ${cacheKey}`);
    }

    /**
     * Load existing connections from main process
     */
    async loadConnections() {
        try {
            logger.debug('ssh', 'loadConnections() called, initialized state:', this.initialized);
            logger.debug('ssh', 'API available:', !!this.api);

            const connections = await this.getConnections();
            logger.debug('ssh', `Loaded ${connections.length} SSH connections`);
        } catch (error) {
            logger.error('ssh', 'Failed to load SSH connections:', error.message);
            logger.error('ssh', 'Load connections error stack:', error.stack);
        }
    }

    /**
     * Clear all cache
     */
    clearCache() {
        this.cache.clear();
        logger.debug('ssh', 'SSH cache cleared');
    }

    /**
     * Get connection by ID from local cache
     * @param {string} connectionId - Connection ID
     * @returns {Object|null} Connection info
     */
    getConnectionFromCache(connectionId) {
        return this.connections.get(connectionId) || null;
    }

    /**
     * Check if service is initialized
     * @returns {boolean} Initialization status
     */
    isInitialized() {
        return this.initialized;
    }
}

// Export singleton instance
const sshService = new SSHService();

module.exports = sshService;
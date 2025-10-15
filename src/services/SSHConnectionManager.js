/**
 * SSHConnectionManager - Manages SSH connections and operations
 *
 * Provides connection pooling, health monitoring, and a clean API for SSH operations.
 * Integrates with Swarm-IDE's EventBus system and follows established architectural patterns.
 *
 * Features:
 * - Connection pooling and lifecycle management
 * - Automatic reconnection with exponential backoff
 * - Connection health monitoring with heartbeat
 * - Secure credential management
 * - Event-driven state management
 * - SFTP operations support
 *
 * Usage:
 *   const sshManager = require('./SSHConnectionManager');
 *   await sshManager.connect(connectionConfig);
 *   const files = await sshManager.listDirectory(connectionId, '/path');
 */

const { NodeSSH } = require('node-ssh');
const { Client: SSH2Client } = require('ssh2');
const EventEmitter = require('events');
const path = require('path');
const fs = require('fs').promises;
const eventBus = require('../modules/EventBus');
const logger = require('../utils/Logger');

// Connection states
const CONNECTION_STATES = {
    DISCONNECTED: 'disconnected',
    CONNECTING: 'connecting',
    CONNECTED: 'connected',
    RECONNECTING: 'reconnecting',
    ERROR: 'error'
};

// Default configuration
const DEFAULT_CONFIG = {
    port: 22,
    readyTimeout: 20000,
    keepaliveInterval: 0,
    keepaliveCountMax: 3,
    algorithms: {
        kex: [
            'ecdh-sha2-nistp256',
            'ecdh-sha2-nistp384',
            'ecdh-sha2-nistp521',
            'diffie-hellman-group14-sha256',
            'diffie-hellman-group16-sha512',
            'diffie-hellman-group18-sha512'
        ],
        cipher: [
            'aes128-gcm',
            'aes256-gcm',
            'aes128-ctr',
            'aes192-ctr',
            'aes256-ctr'
        ],
        hmac: [
            'hmac-sha2-256',
            'hmac-sha2-512',
            'hmac-sha1'
        ]
    }
};

class SSHConnection extends EventEmitter {
    constructor(id, config) {
        super();
        this.id = id;
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.ssh = null;
        this.sftp = null;
        this.state = CONNECTION_STATES.DISCONNECTED;
        this.lastConnected = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 1000; // Start with 1 second
        this.heartbeatInterval = null;
        this.heartbeatTimeout = null;

        logger.debug('ssh', `SSH connection created: ${this.id}`);
    }

    /**
     * Connect to SSH server
     */
    async connect() {
        if (this.state === CONNECTION_STATES.CONNECTING || this.state === CONNECTION_STATES.CONNECTED) {
            return;
        }

        this.setState(CONNECTION_STATES.CONNECTING);

        try {
            this.ssh = new NodeSSH();

            // Prepare connection config
            const connectConfig = {
                host: this.config.host,
                port: this.config.port,
                username: this.config.username,
                readyTimeout: this.config.readyTimeout,
                algorithms: this.config.algorithms
            };

            // Add authentication method
            if (this.config.privateKey) {
                connectConfig.privateKey = this.config.privateKey;
                if (this.config.passphrase) {
                    connectConfig.passphrase = this.config.passphrase;
                }
            } else if (this.config.password) {
                connectConfig.password = this.config.password;
            } else {
                throw new Error('No authentication method provided');
            }

            // Connect
            await this.ssh.connect(connectConfig);

            this.setState(CONNECTION_STATES.CONNECTED);
            this.lastConnected = new Date();
            this.reconnectAttempts = 0;
            this.reconnectDelay = 1000;

            // Initialize SFTP
            await this.initializeSFTP();

            // Start heartbeat
            this.startHeartbeat();

            logger.info('ssh', `Connected to ${this.config.host}:${this.config.port} as ${this.config.username}`);

        } catch (error) {
            logger.error('ssh', `Connection failed for ${this.id}:`, error.message);
            this.setState(CONNECTION_STATES.ERROR);
            this.emit('error', error);
            throw error;
        }
    }

    /**
     * Initialize SFTP connection
     */
    async initializeSFTP() {
        try {
            this.sftp = await this.ssh.requestSFTP();
            logger.debug('ssh', `SFTP initialized for ${this.id}`);
        } catch (error) {
            logger.error('ssh', `SFTP initialization failed for ${this.id}:`, error.message);
            throw error;
        }
    }

    /**
     * Disconnect from SSH server
     */
    async disconnect() {
        this.stopHeartbeat();

        if (this.ssh) {
            try {
                this.ssh.dispose();
                logger.info('ssh', `Disconnected from ${this.id}`);
            } catch (error) {
                logger.error('ssh', `Error during disconnect for ${this.id}:`, error.message);
            }
            this.ssh = null;
            this.sftp = null;
        }

        this.setState(CONNECTION_STATES.DISCONNECTED);
    }

    /**
     * Reconnect with exponential backoff
     */
    async reconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            logger.error('ssh', `Max reconnection attempts reached for ${this.id}`);
            this.setState(CONNECTION_STATES.ERROR);
            return;
        }

        this.setState(CONNECTION_STATES.RECONNECTING);
        this.reconnectAttempts++;

        const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1), 30000);

        logger.info('ssh', `Reconnecting to ${this.id} in ${delay}ms (attempt ${this.reconnectAttempts})`);

        setTimeout(async () => {
            try {
                await this.connect();
            } catch (error) {
                logger.error('ssh', `Reconnection failed for ${this.id}:`, error.message);
                await this.reconnect();
            }
        }, delay);
    }

    /**
     * Start heartbeat monitoring
     */
    startHeartbeat() {
        this.stopHeartbeat();

        this.heartbeatInterval = setInterval(async () => {
            try {
                // Simple command to check connection
                await this.ssh.execCommand('echo "heartbeat"');
            } catch (error) {
                logger.warn('ssh', `Heartbeat failed for ${this.id}, attempting reconnection`);
                await this.reconnect();
            }
        }, 30000); // Every 30 seconds
    }

    /**
     * Stop heartbeat monitoring
     */
    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
        if (this.heartbeatTimeout) {
            clearTimeout(this.heartbeatTimeout);
            this.heartbeatTimeout = null;
        }
    }

    /**
     * Set connection state and emit events
     */
    setState(state) {
        const oldState = this.state;
        this.state = state;

        if (oldState !== state) {
            this.emit('stateChange', { id: this.id, state, oldState });
            eventBus.emit('ssh:connectionStateChanged', { id: this.id, state, oldState });
            logger.debug('ssh', `Connection ${this.id} state changed: ${oldState} -> ${state}`);
        }
    }

    /**
     * Execute command on remote server
     */
    async execCommand(command, options = {}) {
        if (this.state !== CONNECTION_STATES.CONNECTED) {
            throw new Error(`Cannot execute command: connection ${this.id} is not connected`);
        }

        try {
            const result = await this.ssh.execCommand(command, options);
            return result;
        } catch (error) {
            logger.error('ssh', `Command execution failed for ${this.id}:`, error.message);
            throw error;
        }
    }

    /**
     * Check if connection is healthy
     */
    isHealthy() {
        return this.state === CONNECTION_STATES.CONNECTED && this.ssh && !this.ssh.connection._sock.destroyed;
    }

    /**
     * Get connection info
     */
    getInfo() {
        return {
            id: this.id,
            host: this.config.host,
            port: this.config.port,
            username: this.config.username,
            state: this.state,
            lastConnected: this.lastConnected,
            reconnectAttempts: this.reconnectAttempts,
            isHealthy: this.isHealthy()
        };
    }
}

class SSHConnectionManager {
    constructor() {
        this.connections = new Map(); // connectionId -> SSHConnection
        this.config = {};
        this.initialized = false;

        logger.debug('ssh', 'SSHConnectionManager initialized');
    }

    /**
     * Initialize the SSH connection manager
     */
    async init() {
        if (this.initialized) {
            return;
        }

        try {
            // Load saved connections from storage
            await this.loadConnections();

            this.initialized = true;
            eventBus.emit('ssh:initialized');
            logger.info('ssh', 'SSH Connection Manager initialized');

        } catch (error) {
            logger.error('ssh', 'Failed to initialize SSH Connection Manager:', error.message);
            throw error;
        }
    }

    /**
     * Create a new SSH connection
     */
    async createConnection(connectionConfig) {
        const id = connectionConfig.id || this.generateConnectionId();

        if (this.connections.has(id)) {
            throw new Error(`Connection with ID ${id} already exists`);
        }

        const connection = new SSHConnection(id, connectionConfig);

        // Set up event listeners
        connection.on('stateChange', (event) => {
            eventBus.emit('ssh:connectionStateChanged', event);
        });

        connection.on('error', (error) => {
            eventBus.emit('ssh:connectionError', { id, error });
        });

        this.connections.set(id, connection);

        // Save to storage
        await this.saveConnections();

        logger.info('ssh', `SSH connection created: ${id}`);
        eventBus.emit('ssh:connectionCreated', { id, config: connectionConfig });

        return id;
    }

    /**
     * Connect to SSH server
     */
    async connect(connectionId) {
        const connection = this.connections.get(connectionId);
        if (!connection) {
            throw new Error(`Connection ${connectionId} not found`);
        }

        await connection.connect();
        return connection;
    }

    /**
     * Disconnect from SSH server
     */
    async disconnect(connectionId) {
        const connection = this.connections.get(connectionId);
        if (!connection) {
            throw new Error(`Connection ${connectionId} not found`);
        }

        await connection.disconnect();
    }

    /**
     * Remove connection
     */
    async removeConnection(connectionId) {
        const connection = this.connections.get(connectionId);
        if (connection) {
            await connection.disconnect();
            this.connections.delete(connectionId);
            await this.saveConnections();

            logger.info('ssh', `SSH connection removed: ${connectionId}`);
            eventBus.emit('ssh:connectionRemoved', { id: connectionId });
        }
    }

    /**
     * Get connection by ID
     */
    getConnection(connectionId) {
        return this.connections.get(connectionId);
    }

    /**
     * Get all connections
     */
    getAllConnections() {
        return Array.from(this.connections.values()).map(conn => conn.getInfo());
    }

    /**
     * Execute command on specific connection
     */
    async execCommand(connectionId, command, options = {}) {
        const connection = this.connections.get(connectionId);
        if (!connection) {
            throw new Error(`Connection ${connectionId} not found`);
        }

        return await connection.execCommand(command, options);
    }

    /**
     * Generate unique connection ID
     */
    generateConnectionId() {
        return 'ssh-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    }

    /**
     * Load connections from storage
     */
    async loadConnections() {
        try {
            // Implementation depends on storage mechanism
            // For now, using localStorage (will be enhanced with secure storage)
            const stored = localStorage.getItem('ssh-connections');
            if (stored) {
                const connectionConfigs = JSON.parse(stored);
                for (const config of connectionConfigs) {
                    const connection = new SSHConnection(config.id, config);
                    this.connections.set(config.id, connection);
                }
                logger.debug('ssh', `Loaded ${connectionConfigs.length} SSH connections`);
            }
        } catch (error) {
            logger.error('ssh', 'Failed to load SSH connections:', error.message);
        }
    }

    /**
     * Save connections to storage
     */
    async saveConnections() {
        try {
            const connectionConfigs = Array.from(this.connections.values()).map(conn => ({
                id: conn.id,
                ...conn.config
            }));

            // Remove sensitive data before storing
            const sanitizedConfigs = connectionConfigs.map(config => ({
                ...config,
                password: undefined, // Don't store passwords
                privateKey: undefined, // Don't store private keys
                passphrase: undefined // Don't store passphrases
            }));

            localStorage.setItem('ssh-connections', JSON.stringify(sanitizedConfigs));
            logger.debug('ssh', `Saved ${connectionConfigs.length} SSH connections`);
        } catch (error) {
            logger.error('ssh', 'Failed to save SSH connections:', error.message);
        }
    }

    /**
     * Disconnect all connections
     */
    async disconnectAll() {
        const disconnectPromises = Array.from(this.connections.values()).map(conn =>
            conn.disconnect().catch(err => logger.error('ssh', `Error disconnecting ${conn.id}:`, err.message))
        );

        await Promise.all(disconnectPromises);
        logger.info('ssh', 'All SSH connections disconnected');
    }

    /**
     * Get connection health status
     */
    getHealthStatus() {
        const connections = this.getAllConnections();
        const healthy = connections.filter(conn => conn.isHealthy).length;
        const total = connections.length;

        return {
            healthy,
            total,
            unhealthy: total - healthy,
            connections
        };
    }

    /**
     * Cleanup and shutdown
     */
    async shutdown() {
        await this.disconnectAll();
        this.connections.clear();
        this.initialized = false;
        logger.info('ssh', 'SSH Connection Manager shutdown');
    }
}

// Export singleton instance
const sshConnectionManager = new SSHConnectionManager();

// Export connection states for external use
sshConnectionManager.CONNECTION_STATES = CONNECTION_STATES;

module.exports = sshConnectionManager;
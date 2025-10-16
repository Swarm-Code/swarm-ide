/**
 * KeytarService - Secure password storage using OS keychain
 *
 * Provides secure storage for SSH passwords and private keys using:
 * - macOS Keychain
 * - Windows Credential Vault
 * - Linux libsecret
 *
 * Usage:
 *   const keytarService = require('./services/KeytarService');
 *   await keytarService.setPassword('ssh_server_id', 'password123');
 *   const password = await keytarService.getPassword('ssh_server_id');
 */

const logger = require('../utils/Logger');

class KeytarService {
    constructor() {
        this.serviceName = 'Swarm-IDE-SSH';
        this.keytar = null;
        this.isAvailable = false;
        this.initialized = false;
    }

    /**
     * Initialize keytar service
     * @returns {Promise<boolean>} True if keytar is available
     */
    async init() {
        if (this.initialized) {
            return this.isAvailable;
        }

        try {
            // Try to load keytar
            this.keytar = require('keytar');
            this.isAvailable = true;
            logger.info('keytar', 'Keytar service initialized successfully');
        } catch (error) {
            logger.warn('keytar', 'Keytar not available:', error.message);
            logger.warn('keytar', 'Passwords will be stored in plain text (not recommended)');
            this.isAvailable = false;
        }

        this.initialized = true;
        return this.isAvailable;
    }

    /**
     * Check if keytar is available
     * @returns {boolean} True if keytar is available
     */
    isKeytarAvailable() {
        return this.isAvailable;
    }

    /**
     * Store a password securely
     * @param {string} account - Account/server identifier
     * @param {string} password - Password to store
     * @returns {Promise<boolean>} True if successful
     */
    async setPassword(account, password) {
        if (!this.initialized) {
            await this.init();
        }

        if (!this.isAvailable || !this.keytar) {
            logger.warn('keytar', 'Cannot store password securely - keytar not available');
            return false;
        }

        try {
            await this.keytar.setPassword(this.serviceName, account, password);
            logger.debug('keytar', `Password stored for account: ${account}`);
            return true;
        } catch (error) {
            logger.error('keytar', `Failed to store password for ${account}:`, error);
            return false;
        }
    }

    /**
     * Retrieve a password securely
     * @param {string} account - Account/server identifier
     * @returns {Promise<string|null>} Password or null if not found
     */
    async getPassword(account) {
        if (!this.initialized) {
            await this.init();
        }

        if (!this.isAvailable || !this.keytar) {
            logger.warn('keytar', 'Cannot retrieve password - keytar not available');
            return null;
        }

        try {
            const password = await this.keytar.getPassword(this.serviceName, account);
            if (password) {
                logger.debug('keytar', `Password retrieved for account: ${account}`);
            } else {
                logger.debug('keytar', `No password found for account: ${account}`);
            }
            return password;
        } catch (error) {
            logger.error('keytar', `Failed to retrieve password for ${account}:`, error);
            return null;
        }
    }

    /**
     * Delete a password
     * @param {string} account - Account/server identifier
     * @returns {Promise<boolean>} True if successful
     */
    async deletePassword(account) {
        if (!this.initialized) {
            await this.init();
        }

        if (!this.isAvailable || !this.keytar) {
            logger.warn('keytar', 'Cannot delete password - keytar not available');
            return false;
        }

        try {
            const result = await this.keytar.deletePassword(this.serviceName, account);
            if (result) {
                logger.debug('keytar', `Password deleted for account: ${account}`);
            } else {
                logger.debug('keytar', `No password to delete for account: ${account}`);
            }
            return result;
        } catch (error) {
            logger.error('keytar', `Failed to delete password for ${account}:`, error);
            return false;
        }
    }

    /**
     * Find all stored passwords for this service
     * @returns {Promise<Array<{account: string, password: string}>>} Array of credentials
     */
    async findCredentials() {
        if (!this.initialized) {
            await this.init();
        }

        if (!this.isAvailable || !this.keytar) {
            logger.warn('keytar', 'Cannot find credentials - keytar not available');
            return [];
        }

        try {
            const credentials = await this.keytar.findCredentials(this.serviceName);
            logger.debug('keytar', `Found ${credentials.length} stored credentials`);
            return credentials;
        } catch (error) {
            logger.error('keytar', 'Failed to find credentials:', error);
            return [];
        }
    }

    /**
     * Store SSH private key passphrase
     * @param {string} serverId - Server ID
     * @param {string} passphrase - Private key passphrase
     * @returns {Promise<boolean>} True if successful
     */
    async setKeyPassphrase(serverId, passphrase) {
        return await this.setPassword(`${serverId}_key_passphrase`, passphrase);
    }

    /**
     * Retrieve SSH private key passphrase
     * @param {string} serverId - Server ID
     * @returns {Promise<string|null>} Passphrase or null
     */
    async getKeyPassphrase(serverId) {
        return await this.getPassword(`${serverId}_key_passphrase`);
    }

    /**
     * Delete SSH private key passphrase
     * @param {string} serverId - Server ID
     * @returns {Promise<boolean>} True if successful
     */
    async deleteKeyPassphrase(serverId) {
        return await this.deletePassword(`${serverId}_key_passphrase`);
    }

    /**
     * Clear all stored credentials for a server
     * @param {string} serverId - Server ID
     * @returns {Promise<boolean>} True if all deletions successful
     */
    async clearServerCredentials(serverId) {
        const passwordDeleted = await this.deletePassword(serverId);
        const passphraseDeleted = await this.deleteKeyPassphrase(serverId);
        return passwordDeleted && passphraseDeleted;
    }
}

// Create singleton instance
const keytarService = new KeytarService();

module.exports = keytarService;

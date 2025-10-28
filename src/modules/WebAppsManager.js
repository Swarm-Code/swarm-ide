/**
 * WebAppsManager - Business logic layer for web apps
 * 
 * Singleton module that wraps WebAppsStore and adds:
 * - Input validation
 * - EventBus integration
 * - Error handling
 */

const { getInstance: getStoreInstance } = require('./WebAppsStore');
const eventBus = require('./EventBus');
const logger = require('../utils/Logger');

class WebAppsManager {
    constructor() {
        this.store = null;
        this.initialized = false;
    }

    /**
     * Initialize manager - get store instance
     */
    async init() {
        if (this.initialized) return;

        try {
            this.store = await getStoreInstance();
            this.initialized = true;
            logger.info('webApps', '✓ WebAppsManager initialized');
        } catch (error) {
            logger.error('webApps', 'Failed to initialize WebAppsManager:', error.message);
            throw error;
        }
    }

    /**
     * Get all web apps
     */
    getAll() {
        if (!this.store) return [];
        return this.store.getAll();
    }

    /**
     * Get web app by ID
     */
    getById(id) {
        if (!this.store) return null;
        return this.store.getById(id);
    }

    /**
     * Validate app name
     * @param {string} name - App name
     * @returns {Object} { valid: boolean, error: string|null }
     */
    validateName(name) {
        if (!name || typeof name !== 'string') {
            return { valid: false, error: 'Name is required' };
        }

        const trimmed = name.trim();
        if (trimmed.length === 0) {
            return { valid: false, error: 'Name cannot be empty' };
        }

        if (trimmed.length > 50) {
            return { valid: false, error: 'Name must be 50 characters or less' };
        }

        return { valid: true, error: null };
    }

    /**
     * Validate app URL
     * @param {string} url - App URL
     * @returns {Object} { valid: boolean, error: string|null }
     */
    validateUrl(url) {
        if (!url || typeof url !== 'string') {
            return { valid: false, error: 'URL is required' };
        }

        const trimmed = url.trim();
        if (trimmed.length === 0) {
            return { valid: false, error: 'URL cannot be empty' };
        }

        // Try to parse as URL
        try {
            const parsed = new URL(trimmed);
            
            // Whitelist safe protocols
            if (!['http:', 'https:'].includes(parsed.protocol)) {
                return { valid: false, error: 'Only HTTP and HTTPS URLs are allowed' };
            }

            return { valid: true, error: null };
        } catch (e) {
            // If URL parsing fails, suggest http://
            if (!trimmed.includes('://')) {
                return { 
                    valid: false, 
                    error: 'Invalid URL. Try adding http:// or https://' 
                };
            }
            return { valid: false, error: 'Invalid URL format' };
        }
    }

    /**
     * Validate icon data
     * @param {string|null} icon - Icon data (base64 or URL)
     * @returns {Object} { valid: boolean, error: string|null }
     */
    validateIcon(icon) {
        // Icon is optional
        if (!icon) {
            return { valid: true, error: null };
        }

        if (typeof icon !== 'string') {
            return { valid: false, error: 'Icon must be a string' };
        }

        // Very basic validation - just check it's a reasonable string
        if (icon.length > 1000000) {
            return { valid: false, error: 'Icon data is too large' };
        }

        return { valid: true, error: null };
    }

    /**
     * Add web app with validation
     * @param {Object} appData - { name, url, icon?, customIcon?, category? }
     * @returns {Promise<Object>} Created app
     */
    async addWebApp(appData) {
        if (!this.initialized) {
            throw new Error('WebAppsManager not initialized');
        }

        // Validate inputs
        const nameValidation = this.validateName(appData.name);
        if (!nameValidation.valid) {
            const error = new Error(nameValidation.error);
            error.validationError = true;
            throw error;
        }

        const urlValidation = this.validateUrl(appData.url);
        if (!urlValidation.valid) {
            const error = new Error(urlValidation.error);
            error.validationError = true;
            throw error;
        }

        const iconValidation = this.validateIcon(appData.icon);
        if (!iconValidation.valid) {
            const error = new Error(iconValidation.error);
            error.validationError = true;
            throw error;
        }

        try {
            const app = await this.store.add(appData);
            logger.info('webApps', `Added web app: ${app.name}`);
            
            // Emit event
            eventBus.emit('webapp:added', app);
            
            return app;
        } catch (error) {
            logger.error('webApps', 'Failed to add web app:', error.message);
            throw error;
        }
    }

    /**
     * Update web app with validation
     * @param {string} id - Web app ID
     * @param {Object} updates - Fields to update
     * @returns {Promise<Object>} Updated app
     */
    async updateWebApp(id, updates) {
        if (!this.initialized) {
            throw new Error('WebAppsManager not initialized');
        }

        // Validate changed fields
        if (updates.name !== undefined) {
            const nameValidation = this.validateName(updates.name);
            if (!nameValidation.valid) {
                const error = new Error(nameValidation.error);
                error.validationError = true;
                throw error;
            }
        }

        if (updates.url !== undefined) {
            const urlValidation = this.validateUrl(updates.url);
            if (!urlValidation.valid) {
                const error = new Error(urlValidation.error);
                error.validationError = true;
                throw error;
            }
        }

        if (updates.icon !== undefined) {
            const iconValidation = this.validateIcon(updates.icon);
            if (!iconValidation.valid) {
                const error = new Error(iconValidation.error);
                error.validationError = true;
                throw error;
            }
        }

        try {
            const app = await this.store.update(id, updates);
            logger.info('webApps', `Updated web app: ${app.name}`);
            
            // Emit event
            eventBus.emit('webapp:updated', app);
            
            return app;
        } catch (error) {
            logger.error('webApps', 'Failed to update web app:', error.message);
            throw error;
        }
    }

    /**
     * Delete web app
     * @param {string} id - Web app ID
     * @returns {Promise<Object>} Deleted app
     */
    async deleteWebApp(id) {
        if (!this.initialized) {
            throw new Error('WebAppsManager not initialized');
        }

        try {
            const app = await this.store.delete(id);
            logger.info('webApps', `Deleted web app: ${app.name}`);
            
            // Emit event
            eventBus.emit('webapp:deleted', app);
            
            return app;
        } catch (error) {
            logger.error('webApps', 'Failed to delete web app:', error.message);
            throw error;
        }
    }

    /**
     * Reorder web apps
     * @param {Array<string>} orderedIds - Array of app IDs in desired order
     * @returns {Promise<void>}
     */
    async reorderWebApps(orderedIds) {
        if (!this.initialized) {
            throw new Error('WebAppsManager not initialized');
        }

        try {
            await this.store.reorder(orderedIds);
            logger.debug('webApps', 'Web apps reordered');
            
            // Emit event with new order
            eventBus.emit('webapp:reordered', { orderedIds });
        } catch (error) {
            logger.error('webApps', 'Failed to reorder web apps:', error.message);
            throw error;
        }
    }

    /**
     * Get Applications section collapsed state
     */
    isSectionCollapsed() {
        if (!this.store) return false;
        return this.store.isSectionCollapsed();
    }

    /**
     * Toggle Applications section collapsed state
     */
    async toggleSectionCollapsed() {
        if (!this.initialized) {
            throw new Error('WebAppsManager not initialized');
        }

        try {
            const newState = await this.store.toggleSectionCollapsed();
            eventBus.emit('webapp:sectionToggled', { collapsed: newState });
            return newState;
        } catch (error) {
            logger.error('webApps', 'Failed to toggle section:', error.message);
            throw error;
        }
    }
}

// Export singleton
let instance = null;

async function getInstance() {
    if (!instance) {
        instance = new WebAppsManager();
        await instance.init();
    }
    return instance;
}

module.exports = { getInstance, WebAppsManager };

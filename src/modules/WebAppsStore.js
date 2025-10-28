/**
 * WebAppsStore - Persistent data layer for web apps
 * 
 * Singleton module that handles loading/saving web apps to ~/.swarmrc/web-apps.json
 * 
 * Features:
 * - Auto-load and auto-save on file changes
 * - CRUD operations with validation
 * - UUID generation for new apps
 * - Fallback to defaults if file doesn't exist
 */

const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/Logger');

/**
 * Generate a UUID v4 string (simple implementation)
 */
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

class WebAppsStore {
    constructor() {
        this.configDir = null;
        this.filePath = null;
        this.data = {
            version: '1.0',
            webApps: [],
            applicationsSectionCollapsed: false
        };
        this.initialized = false;
    }

    /**
     * Initialize store - called once on first access
     * Determines config directory and loads existing data
     */
    async init() {
        if (this.initialized) return;

        try {
            // Get home directory
            const homeDir = process.env.HOME || process.env.USERPROFILE;
            if (!homeDir) {
                throw new Error('Could not determine home directory');
            }

            this.configDir = path.join(homeDir, '.swarmrc');
            this.filePath = path.join(this.configDir, 'web-apps.json');

            // Ensure config directory exists
            try {
                await fs.mkdir(this.configDir, { recursive: true });
                logger.debug('webApps', '✓ Config directory ensured:', this.configDir);
            } catch (err) {
                logger.warn('webApps', 'Could not create config directory:', err.message);
            }

            // Load existing data
            await this.load();
            this.initialized = true;
            logger.info('webApps', '✓ WebAppsStore initialized successfully');
        } catch (error) {
            logger.error('webApps', 'Failed to initialize WebAppsStore:', error.message);
            this.initialized = true; // Mark as initialized even if failed, to avoid retry loops
        }
    }

    /**
     * Load web apps from JSON file
     * Creates file with defaults if it doesn't exist
     */
    async load() {
        try {
            // Try to read existing file
            const fileContent = await fs.readFile(this.filePath, 'utf-8');
            const parsed = JSON.parse(fileContent);

            // Validate structure
            if (parsed.version && Array.isArray(parsed.webApps)) {
                this.data = parsed;
                logger.debug('webApps', `✓ Loaded ${this.data.webApps.length} web apps from file`);
                return;
            }

            logger.warn('webApps', 'Invalid structure in web-apps.json, using defaults');
            await this.save();
        } catch (error) {
            if (error.code === 'ENOENT') {
                // File doesn't exist, create with defaults
                logger.debug('webApps', 'web-apps.json not found, creating with defaults');
                await this.save();
            } else {
                logger.warn('webApps', 'Error loading web-apps.json:', error.message);
                // Keep default data if load fails
            }
        }
    }

    /**
     * Save current data to JSON file
     */
    async save() {
        try {
            const json = JSON.stringify(this.data, null, 2);
            await fs.writeFile(this.filePath, json, 'utf-8');
            logger.debug('webApps', '✓ Web apps saved to file');
        } catch (error) {
            logger.error('webApps', 'Failed to save web-apps.json:', error.message);
            throw error;
        }
    }

    /**
     * Get all web apps
     */
    getAll() {
        return [...this.data.webApps]; // Return copy to prevent external modification
    }

    /**
     * Get web app by ID
     * @param {string} id - Web app ID
     * @returns {Object|null} Web app object or null if not found
     */
    getById(id) {
        const app = this.data.webApps.find(app => app.id === id);
        return app ? { ...app } : null; // Return copy
    }

    /**
     * Add new web app
     * @param {Object} appData - App data (name, url, icon, etc.)
     * @returns {Object} Created app with ID
     */
    async add(appData) {
        const app = {
            id: generateUUID(),
            name: appData.name.trim(),
            url: appData.url.trim(),
            icon: appData.icon || null,
            customIcon: appData.customIcon || false,
            category: appData.category || null,
            createdAt: new Date().toISOString(),
            order: this.data.webApps.length
        };

        this.data.webApps.push(app);
        await this.save();

        logger.info('webApps', `✓ Added web app: ${app.name}`);
        return { ...app };
    }

    /**
     * Update existing web app
     * @param {string} id - Web app ID
     * @param {Object} updates - Fields to update
     * @returns {Object} Updated app
     */
    async update(id, updates) {
        const index = this.data.webApps.findIndex(app => app.id === id);
        if (index === -1) {
            throw new Error(`Web app with ID ${id} not found`);
        }

        const app = this.data.webApps[index];
        
        // Update allowed fields
        if (updates.name !== undefined) app.name = updates.name.trim();
        if (updates.url !== undefined) app.url = updates.url.trim();
        if (updates.icon !== undefined) app.icon = updates.icon;
        if (updates.customIcon !== undefined) app.customIcon = updates.customIcon;
        if (updates.category !== undefined) app.category = updates.category;
        app.updatedAt = new Date().toISOString();

        await this.save();
        logger.info('webApps', `✓ Updated web app: ${app.name}`);
        return { ...app };
    }

    /**
     * Delete web app by ID
     * @param {string} id - Web app ID
     */
    async delete(id) {
        const index = this.data.webApps.findIndex(app => app.id === id);
        if (index === -1) {
            throw new Error(`Web app with ID ${id} not found`);
        }

        const deleted = this.data.webApps.splice(index, 1)[0];
        
        // Reorder remaining apps
        this.data.webApps.forEach((app, i) => {
            app.order = i;
        });

        await this.save();
        logger.info('webApps', `✓ Deleted web app: ${deleted.name}`);
        return deleted;
    }

    /**
     * Reorder web apps
     * @param {Array<string>} orderedIds - Array of app IDs in desired order
     */
    async reorder(orderedIds) {
        if (!Array.isArray(orderedIds)) {
            throw new Error('orderedIds must be an array');
        }

        // Validate all IDs exist
        const currentIds = this.data.webApps.map(app => app.id);
        for (const id of orderedIds) {
            if (!currentIds.includes(id)) {
                throw new Error(`Unknown web app ID: ${id}`);
            }
        }

        if (orderedIds.length !== this.data.webApps.length) {
            throw new Error('orderedIds must contain all web app IDs');
        }

        // Create new ordered array
        const newApps = [];
        for (const id of orderedIds) {
            const app = this.data.webApps.find(a => a.id === id);
            if (app) {
                app.order = newApps.length;
                newApps.push(app);
            }
        }

        this.data.webApps = newApps;
        await this.save();
        logger.debug('webApps', '✓ Web apps reordered');
    }

    /**
     * Toggle Applications section collapsed state
     */
    async toggleSectionCollapsed() {
        this.data.applicationsSectionCollapsed = !this.data.applicationsSectionCollapsed;
        await this.save();
        return this.data.applicationsSectionCollapsed;
    }

    /**
     * Get section collapsed state
     */
    isSectionCollapsed() {
        return this.data.applicationsSectionCollapsed;
    }

    /**
     * Clear all web apps (for testing/reset)
     */
    async clear() {
        this.data.webApps = [];
        await this.save();
        logger.info('webApps', '✓ All web apps cleared');
    }
}

// Export singleton
let instance = null;

async function getInstance() {
    if (!instance) {
        instance = new WebAppsStore();
        await instance.init();
    }
    return instance;
}

module.exports = { getInstance, WebAppsStore };

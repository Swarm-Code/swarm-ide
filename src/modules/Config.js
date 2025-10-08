/**
 * Config - Application configuration and settings management
 *
 * Manages application configuration, theme settings, and user preferences.
 * Provides defaults and allows loading/saving settings.
 *
 * Usage:
 *   config.get('theme');
 *   config.set('theme', 'dark');
 *   config.save();
 */

const eventBus = require('./EventBus');

class Config {
    constructor() {
        this.config = this.getDefaults();
        this.configKey = 'swarm-ide-config';
    }

    /**
     * Get default configuration
     * @returns {Object} Default configuration object
     */
    getDefaults() {
        return {
            theme: 'dark',
            fontSize: 14,
            fontFamily: 'Consolas, Monaco, Courier New, monospace',
            tabSize: 4,
            lineNumbers: true,
            wordWrap: true,
            autoSave: false,
            autoSaveDelay: 1000,
            sidebarWidth: 300,
            showHiddenFiles: false,
            fileExclusions: [
                'node_modules',
                '.git',
                '.DS_Store',
                'dist',
                'build'
            ],
            recentFolders: [],
            maxRecentFolders: 10
        };
    }

    /**
     * Get a configuration value
     * @param {string} key - Config key (supports dot notation)
     * @param {*} defaultValue - Default value if key doesn't exist
     * @returns {*} Configuration value
     */
    get(key, defaultValue = undefined) {
        const keys = key.split('.');
        let value = this.config;

        for (const k of keys) {
            if (value && value.hasOwnProperty(k)) {
                value = value[k];
            } else {
                return defaultValue;
            }
        }

        return value;
    }

    /**
     * Set a configuration value
     * @param {string} key - Config key (supports dot notation)
     * @param {*} value - Value to set
     * @param {boolean} persist - Whether to save to localStorage immediately
     */
    set(key, value, persist = false) {
        const keys = key.split('.');
        const lastKey = keys.pop();
        let target = this.config;

        for (const k of keys) {
            if (!target[k]) {
                target[k] = {};
            }
            target = target[k];
        }

        const oldValue = target[lastKey];
        target[lastKey] = value;

        eventBus.emit('config:changed', { key, value, oldValue });

        if (persist) {
            this.save();
        }
    }

    /**
     * Set multiple configuration values at once
     * @param {Object} updates - Object with key-value pairs
     * @param {boolean} persist - Whether to save to localStorage immediately
     */
    setMultiple(updates, persist = false) {
        Object.entries(updates).forEach(([key, value]) => {
            this.set(key, value, false);
        });

        if (persist) {
            this.save();
        }
    }

    /**
     * Load configuration from localStorage
     */
    load() {
        try {
            const stored = localStorage.getItem(this.configKey);
            if (stored) {
                const parsed = JSON.parse(stored);
                this.config = { ...this.getDefaults(), ...parsed };
                eventBus.emit('config:loaded', this.config);
            }
        } catch (error) {
            console.error('[Config] Error loading configuration:', error);
            this.config = this.getDefaults();
        }
    }

    /**
     * Save configuration to localStorage
     */
    save() {
        try {
            localStorage.setItem(this.configKey, JSON.stringify(this.config));
            eventBus.emit('config:saved', this.config);
        } catch (error) {
            console.error('[Config] Error saving configuration:', error);
        }
    }

    /**
     * Reset configuration to defaults
     * @param {boolean} persist - Whether to save to localStorage immediately
     */
    reset(persist = false) {
        const oldConfig = { ...this.config };
        this.config = this.getDefaults();

        eventBus.emit('config:reset', { oldConfig, newConfig: this.config });

        if (persist) {
            this.save();
        }
    }

    /**
     * Get all configuration as an object
     * @returns {Object} Complete configuration object
     */
    getAll() {
        return { ...this.config };
    }

    /**
     * Add a folder to recent folders list
     * @param {string} folderPath - Folder path to add
     */
    addRecentFolder(folderPath) {
        let recent = this.get('recentFolders', []);

        // Remove if already exists
        recent = recent.filter(p => p !== folderPath);

        // Add to beginning
        recent.unshift(folderPath);

        // Limit to max recent folders
        const max = this.get('maxRecentFolders', 10);
        if (recent.length > max) {
            recent = recent.slice(0, max);
        }

        this.set('recentFolders', recent, true);
    }

    /**
     * Remove a folder from recent folders list
     * @param {string} folderPath - Folder path to remove
     */
    removeRecentFolder(folderPath) {
        let recent = this.get('recentFolders', []);
        recent = recent.filter(p => p !== folderPath);
        this.set('recentFolders', recent, true);
    }

    /**
     * Clear recent folders list
     */
    clearRecentFolders() {
        this.set('recentFolders', [], true);
    }

    /**
     * Check if a file/folder should be excluded
     * @param {string} name - File or folder name
     * @returns {boolean} True if should be excluded
     */
    shouldExclude(name) {
        const exclusions = this.get('fileExclusions', []);
        return exclusions.some(pattern => {
            if (pattern.includes('*')) {
                // Simple wildcard matching
                const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
                return regex.test(name);
            }
            return name === pattern;
        });
    }
}

// Export singleton instance
const config = new Config();
module.exports = config;

/**
 * PluginManager - Extensible plugin system for IDE functionality
 *
 * Allows developers to extend IDE functionality by registering plugins,
 * hooks, and custom handlers without modifying core code.
 *
 * Usage:
 *   pluginManager.register({
 *     name: 'MyPlugin',
 *     activate: (context) => { ... },
 *     deactivate: () => { ... }
 *   });
 */

const eventBus = require('./EventBus');

class PluginManager {
    constructor() {
        this.plugins = new Map();
        this.hooks = new Map();
        this.activePlugins = new Set();
    }

    /**
     * Register a plugin
     * @param {Object} plugin - Plugin object with name, activate, and optionally deactivate
     * @returns {boolean} Success status
     */
    register(plugin) {
        if (!plugin.name) {
            console.error('[PluginManager] Plugin must have a name');
            return false;
        }

        if (this.plugins.has(plugin.name)) {
            console.warn(`[PluginManager] Plugin '${plugin.name}' is already registered`);
            return false;
        }

        this.plugins.set(plugin.name, {
            ...plugin,
            registered: Date.now(),
            active: false
        });

        eventBus.emit('plugin:registered', { name: plugin.name });

        return true;
    }

    /**
     * Activate a plugin
     * @param {string} name - Plugin name
     * @param {Object} context - Context object to pass to plugin
     * @returns {Promise<boolean>} Success status
     */
    async activate(name, context = {}) {
        const plugin = this.plugins.get(name);

        if (!plugin) {
            console.error(`[PluginManager] Plugin '${name}' not found`);
            return false;
        }

        if (plugin.active) {
            console.warn(`[PluginManager] Plugin '${name}' is already active`);
            return true;
        }

        try {
            if (plugin.activate) {
                await plugin.activate(context);
            }

            plugin.active = true;
            this.activePlugins.add(name);

            eventBus.emit('plugin:activated', { name });

            return true;
        } catch (error) {
            console.error(`[PluginManager] Error activating plugin '${name}':`, error);
            return false;
        }
    }

    /**
     * Deactivate a plugin
     * @param {string} name - Plugin name
     * @returns {Promise<boolean>} Success status
     */
    async deactivate(name) {
        const plugin = this.plugins.get(name);

        if (!plugin) {
            console.error(`[PluginManager] Plugin '${name}' not found`);
            return false;
        }

        if (!plugin.active) {
            console.warn(`[PluginManager] Plugin '${name}' is not active`);
            return true;
        }

        try {
            if (plugin.deactivate) {
                await plugin.deactivate();
            }

            plugin.active = false;
            this.activePlugins.delete(name);

            eventBus.emit('plugin:deactivated', { name });

            return true;
        } catch (error) {
            console.error(`[PluginManager] Error deactivating plugin '${name}':`, error);
            return false;
        }
    }

    /**
     * Unregister a plugin
     * @param {string} name - Plugin name
     * @returns {Promise<boolean>} Success status
     */
    async unregister(name) {
        if (this.activePlugins.has(name)) {
            await this.deactivate(name);
        }

        const deleted = this.plugins.delete(name);

        if (deleted) {
            eventBus.emit('plugin:unregistered', { name });
        }

        return deleted;
    }

    /**
     * Register a hook
     * @param {string} hookName - Name of the hook
     * @param {Function} handler - Hook handler function
     * @param {number} priority - Priority (lower = higher priority)
     * @returns {Function} Unregister function
     */
    registerHook(hookName, handler, priority = 100) {
        if (!this.hooks.has(hookName)) {
            this.hooks.set(hookName, []);
        }

        const hook = { handler, priority };
        this.hooks.get(hookName).push(hook);

        // Sort by priority
        this.hooks.get(hookName).sort((a, b) => a.priority - b.priority);

        // Return unregister function
        return () => this.unregisterHook(hookName, handler);
    }

    /**
     * Unregister a hook
     * @param {string} hookName - Name of the hook
     * @param {Function} handler - Hook handler to remove
     */
    unregisterHook(hookName, handler) {
        if (!this.hooks.has(hookName)) return;

        const hooks = this.hooks.get(hookName);
        const index = hooks.findIndex(h => h.handler === handler);

        if (index !== -1) {
            hooks.splice(index, 1);
        }

        if (hooks.length === 0) {
            this.hooks.delete(hookName);
        }
    }

    /**
     * Execute a hook
     * @param {string} hookName - Name of the hook to execute
     * @param {*} data - Data to pass to hook handlers
     * @returns {Promise<*>} Modified data after all handlers
     */
    async executeHook(hookName, data) {
        if (!this.hooks.has(hookName)) {
            return data;
        }

        let result = data;

        for (const hook of this.hooks.get(hookName)) {
            try {
                const hookResult = await hook.handler(result);
                if (hookResult !== undefined) {
                    result = hookResult;
                }
            } catch (error) {
                console.error(`[PluginManager] Error in hook '${hookName}':`, error);
            }
        }

        return result;
    }

    /**
     * Get all registered plugins
     * @returns {Array} List of plugins
     */
    getPlugins() {
        return Array.from(this.plugins.entries()).map(([name, plugin]) => ({
            name,
            active: plugin.active,
            registered: plugin.registered
        }));
    }

    /**
     * Get active plugins
     * @returns {Array} List of active plugin names
     */
    getActivePlugins() {
        return Array.from(this.activePlugins);
    }

    /**
     * Check if a plugin is registered
     * @param {string} name - Plugin name
     * @returns {boolean}
     */
    hasPlugin(name) {
        return this.plugins.has(name);
    }

    /**
     * Check if a plugin is active
     * @param {string} name - Plugin name
     * @returns {boolean}
     */
    isActive(name) {
        return this.activePlugins.has(name);
    }

    /**
     * Get all registered hooks
     * @returns {Array} List of hook names
     */
    getHooks() {
        return Array.from(this.hooks.keys());
    }

    /**
     * Clear all plugins and hooks
     */
    async clear() {
        // Deactivate all active plugins
        for (const name of this.activePlugins) {
            await this.deactivate(name);
        }

        this.plugins.clear();
        this.hooks.clear();
        this.activePlugins.clear();

        eventBus.emit('plugin:cleared');
    }
}

// Export singleton instance
const pluginManager = new PluginManager();
module.exports = pluginManager;

/**
 * StateManager - Centralized state management with observable changes
 *
 * Provides a reactive state system where components can subscribe to specific
 * state changes and automatically update when state is modified.
 *
 * Usage:
 *   stateManager.set('currentFile', '/path/to/file.js');
 *   stateManager.get('currentFile');
 *   stateManager.subscribe('currentFile', (newValue, oldValue) => { ... });
 */

const eventBus = require('./EventBus');

class StateManager {
    constructor() {
        this.state = {};
        this.subscribers = new Map();
        this.history = [];
        this.maxHistory = 50;
    }

    /**
     * Get a state value
     * @param {string} key - State key
     * @param {*} defaultValue - Default value if key doesn't exist
     * @returns {*} State value
     */
    get(key, defaultValue = undefined) {
        return this.state.hasOwnProperty(key) ? this.state[key] : defaultValue;
    }

    /**
     * Set a state value and notify subscribers
     * @param {string} key - State key
     * @param {*} value - New value
     * @param {boolean} silent - Don't notify subscribers if true
     */
    set(key, value, silent = false) {
        const oldValue = this.state[key];

        // Don't update if value hasn't changed
        if (oldValue === value) return;

        // Store in history
        this.addToHistory({ key, oldValue, newValue: value, timestamp: Date.now() });

        // Update state
        this.state[key] = value;

        if (!silent) {
            // Notify subscribers
            this.notifySubscribers(key, value, oldValue);

            // Emit global state change event
            eventBus.emit('state:changed', { key, value, oldValue });
        }
    }

    /**
     * Update multiple state values at once
     * @param {Object} updates - Object with key-value pairs to update
     * @param {boolean} silent - Don't notify subscribers if true
     */
    setMultiple(updates, silent = false) {
        Object.entries(updates).forEach(([key, value]) => {
            this.set(key, value, silent);
        });
    }

    /**
     * Subscribe to state changes for a specific key
     * @param {string} key - State key to watch
     * @param {Function} callback - Callback function (newValue, oldValue) => {}
     * @returns {Function} Unsubscribe function
     */
    subscribe(key, callback) {
        if (!this.subscribers.has(key)) {
            this.subscribers.set(key, new Set());
        }

        this.subscribers.get(key).add(callback);

        // Return unsubscribe function
        return () => this.unsubscribe(key, callback);
    }

    /**
     * Unsubscribe from state changes
     * @param {string} key - State key
     * @param {Function} callback - Callback to remove
     */
    unsubscribe(key, callback) {
        if (!this.subscribers.has(key)) return;

        this.subscribers.get(key).delete(callback);

        if (this.subscribers.get(key).size === 0) {
            this.subscribers.delete(key);
        }
    }

    /**
     * Notify all subscribers of a state change
     * @private
     * @param {string} key - State key
     * @param {*} newValue - New value
     * @param {*} oldValue - Old value
     */
    notifySubscribers(key, newValue, oldValue) {
        if (!this.subscribers.has(key)) return;

        this.subscribers.get(key).forEach(callback => {
            try {
                callback(newValue, oldValue);
            } catch (error) {
                console.error(`[StateManager] Error in subscriber for '${key}':`, error);
            }
        });
    }

    /**
     * Check if a state key exists
     * @param {string} key - State key
     * @returns {boolean}
     */
    has(key) {
        return this.state.hasOwnProperty(key);
    }

    /**
     * Delete a state key
     * @param {string} key - State key to delete
     */
    delete(key) {
        const oldValue = this.state[key];
        delete this.state[key];

        this.notifySubscribers(key, undefined, oldValue);
        eventBus.emit('state:deleted', { key, oldValue });
    }

    /**
     * Clear all state
     */
    clear() {
        const oldState = { ...this.state };
        this.state = {};
        this.subscribers.clear();

        eventBus.emit('state:cleared', { oldState });
    }

    /**
     * Get all state as an object
     * @returns {Object} Complete state object
     */
    getAll() {
        return { ...this.state };
    }

    /**
     * Add entry to history
     * @private
     */
    addToHistory(entry) {
        this.history.push(entry);

        if (this.history.length > this.maxHistory) {
            this.history.shift();
        }
    }

    /**
     * Get state change history
     * @param {number} limit - Number of entries to return
     * @returns {Array} History entries
     */
    getHistory(limit = 10) {
        return this.history.slice(-limit);
    }

    /**
     * Clear state history
     */
    clearHistory() {
        this.history = [];
    }
}

// Export singleton instance
const stateManager = new StateManager();
module.exports = stateManager;

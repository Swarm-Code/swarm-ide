/**
 * EventBus - Central event system for decoupled module communication
 *
 * Allows modules to emit and listen to events without direct dependencies.
 * Implements the publish-subscribe pattern for highly extensible architecture.
 *
 * Usage:
 *   eventBus.on('file:opened', (data) => console.log(data));
 *   eventBus.emit('file:opened', { path: '/path/to/file' });
 *   eventBus.off('file:opened', handler);
 */

const logger = require('../utils/Logger');

class EventBus {
    constructor() {
        this.events = new Map();
    }

    /**
     * Subscribe to an event
     * @param {string} event - Event name
     * @param {Function} handler - Callback function
     * @returns {Function} Unsubscribe function
     */
    on(event, handler) {
        if (!this.events.has(event)) {
            this.events.set(event, new Set());
        }

        this.events.get(event).add(handler);

        logger.debug('eventBus', `Subscribed to '${event}'`);

        // Return unsubscribe function
        return () => this.off(event, handler);
    }

    /**
     * Subscribe to an event (one-time only)
     * @param {string} event - Event name
     * @param {Function} handler - Callback function
     */
    once(event, handler) {
        const wrappedHandler = (...args) => {
            handler(...args);
            this.off(event, wrappedHandler);
        };

        this.on(event, wrappedHandler);
    }

    /**
     * Unsubscribe from an event
     * @param {string} event - Event name
     * @param {Function} handler - Callback function to remove
     */
    off(event, handler) {
        if (!this.events.has(event)) return;

        this.events.get(event).delete(handler);

        if (this.events.get(event).size === 0) {
            this.events.delete(event);
        }

        logger.debug('eventBus', `Unsubscribed from '${event}'`);
    }

    /**
     * Emit an event
     * @param {string} event - Event name
     * @param {*} data - Data to pass to handlers
     */
    emit(event, data) {
        logger.debug('eventBus', `Emitting '${event}'`, data);

        if (!this.events.has(event)) return;

        this.events.get(event).forEach(handler => {
            try {
                handler(data);
            } catch (error) {
                logger.error('eventBus', `Error in handler for '${event}':`, error);
            }
        });
    }

    /**
     * Remove all listeners for an event, or all events if no event specified
     * @param {string} [event] - Event name (optional)
     */
    clear(event) {
        if (event) {
            this.events.delete(event);
        } else {
            this.events.clear();
        }
    }

    /**
     * Get all registered events
     * @returns {Array<string>} List of event names
     */
    getEvents() {
        return Array.from(this.events.keys());
    }
}

// Export singleton instance
const eventBus = new EventBus();
module.exports = eventBus;

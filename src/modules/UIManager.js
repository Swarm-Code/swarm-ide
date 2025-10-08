/**
 * UIManager - Manages UI component lifecycle and coordination
 *
 * Coordinates UI components, manages their lifecycle, and handles
 * global UI state and interactions.
 *
 * Usage:
 *   const uiManager = new UIManager();
 *   uiManager.initialize();
 */

const eventBus = require('./EventBus');
const config = require('./Config');

class UIManager {
    constructor() {
        this.components = new Map();
        this.initialized = false;
    }

    /**
     * Initialize the UI Manager
     */
    initialize() {
        if (this.initialized) {
            console.warn('[UIManager] Already initialized');
            return;
        }

        this.setupGlobalEventListeners();
        this.initialized = true;

        eventBus.emit('ui:initialized');
    }

    /**
     * Register a component
     * @param {string} name - Component name
     * @param {Object} component - Component instance
     */
    registerComponent(name, component) {
        if (this.components.has(name)) {
            console.warn(`[UIManager] Component '${name}' already registered`);
            return;
        }

        this.components.set(name, component);
        eventBus.emit('ui:component-registered', { name });
    }

    /**
     * Get a registered component
     * @param {string} name - Component name
     * @returns {Object|null} Component instance
     */
    getComponent(name) {
        return this.components.get(name) || null;
    }

    /**
     * Unregister a component
     * @param {string} name - Component name
     */
    unregisterComponent(name) {
        const component = this.components.get(name);

        if (component && typeof component.destroy === 'function') {
            component.destroy();
        }

        this.components.delete(name);
        eventBus.emit('ui:component-unregistered', { name });
    }

    /**
     * Setup global UI event listeners
     */
    setupGlobalEventListeners() {
        // Handle theme changes
        eventBus.on('config:changed', (data) => {
            if (data.key === 'theme') {
                this.applyTheme(data.value);
            }
        });

        // Handle window resize
        window.addEventListener('resize', () => {
            eventBus.emit('ui:window-resized', {
                width: window.innerWidth,
                height: window.innerHeight
            });
        });

        // Handle keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            this.handleKeyboardShortcut(e);
        });
    }

    /**
     * Handle keyboard shortcuts
     * @param {KeyboardEvent} event - Keyboard event
     */
    handleKeyboardShortcut(event) {
        const { ctrlKey, metaKey, key } = event;
        const modKey = ctrlKey || metaKey;

        // Cmd/Ctrl + O: Open folder
        if (modKey && key === 'o') {
            event.preventDefault();
            eventBus.emit('shortcut:open-folder');
        }

        // Cmd/Ctrl + R: Refresh
        if (modKey && key === 'r') {
            event.preventDefault();
            eventBus.emit('shortcut:refresh');
        }

        // Cmd/Ctrl + W: Close file
        if (modKey && key === 'w') {
            event.preventDefault();
            eventBus.emit('shortcut:close-file');
        }

        // Cmd/Ctrl + ,: Open settings
        if (modKey && key === ',') {
            event.preventDefault();
            eventBus.emit('shortcut:open-settings');
        }

        // Emit generic keyboard event for plugins
        eventBus.emit('ui:keyboard', { event, modKey, key });
    }

    /**
     * Apply theme
     * @param {string} theme - Theme name
     */
    applyTheme(theme) {
        document.body.setAttribute('data-theme', theme);
        eventBus.emit('ui:theme-changed', { theme });
    }

    /**
     * Show notification
     * @param {string} message - Notification message
     * @param {string} type - Notification type (info, success, warning, error)
     * @param {number} duration - Duration in milliseconds
     */
    showNotification(message, type = 'info', duration = 3000) {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;

        // Add to body
        document.body.appendChild(notification);

        // Animate in
        setTimeout(() => {
            notification.classList.add('show');
        }, 10);

        // Remove after duration
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                document.body.removeChild(notification);
            }, 300);
        }, duration);

        eventBus.emit('ui:notification-shown', { message, type });
    }

    /**
     * Show loading indicator
     * @param {string} message - Loading message
     */
    showLoading(message = 'Loading...') {
        const loader = document.createElement('div');
        loader.id = 'global-loader';
        loader.className = 'loading-overlay';
        loader.innerHTML = `
            <div class="loading-spinner"></div>
            <div class="loading-message">${message}</div>
        `;

        document.body.appendChild(loader);
    }

    /**
     * Hide loading indicator
     */
    hideLoading() {
        const loader = document.getElementById('global-loader');
        if (loader) {
            loader.remove();
        }
    }

    /**
     * Get all registered components
     * @returns {Array} List of component names
     */
    getComponents() {
        return Array.from(this.components.keys());
    }

    /**
     * Cleanup all components
     */
    cleanup() {
        this.components.forEach((component, name) => {
            this.unregisterComponent(name);
        });

        this.components.clear();
        this.initialized = false;

        eventBus.emit('ui:cleanup');
    }
}

// Export singleton instance
const uiManager = new UIManager();
module.exports = uiManager;

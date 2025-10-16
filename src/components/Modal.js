/**
 * Modal - Reusable modal dialog component
 *
 * Replaces browser prompt/alert/confirm with Electron-compatible dialogs
 */

const eventBus = require('../modules/EventBus');

class Modal {
    constructor() {
        this.container = null;
        this.overlay = null;
        this.isVisible = false;
        this.currentResolve = null;
    }

    /**
     * Show a prompt dialog (replaces window.prompt)
     * @param {string} title - Dialog title
     * @param {string} message - Prompt message
     * @param {string} defaultValue - Default input value
     * @returns {Promise<string|null>} User input or null if cancelled
     */
    async prompt(title, message, defaultValue = '') {
        return new Promise((resolve) => {
            this.currentResolve = resolve;
            this.show({
                type: 'prompt',
                title,
                message,
                defaultValue,
                onSubmit: (value) => {
                    this.hide();
                    resolve(value);
                },
                onCancel: () => {
                    this.hide();
                    resolve(null);
                }
            });
        });
    }

    /**
     * Show a confirm dialog (replaces window.confirm)
     * @param {string} title - Dialog title
     * @param {string} message - Confirmation message
     * @returns {Promise<boolean>} True if confirmed, false if cancelled
     */
    async confirm(title, message) {
        return new Promise((resolve) => {
            this.currentResolve = resolve;
            this.show({
                type: 'confirm',
                title,
                message,
                onSubmit: () => {
                    this.hide();
                    resolve(true);
                },
                onCancel: () => {
                    this.hide();
                    resolve(false);
                }
            });
        });
    }

    /**
     * Show an alert dialog (replaces window.alert)
     * @param {string} title - Dialog title
     * @param {string} message - Alert message
     * @returns {Promise<void>}
     */
    async alert(title, message) {
        return new Promise((resolve) => {
            this.currentResolve = resolve;
            this.show({
                type: 'alert',
                title,
                message,
                onSubmit: () => {
                    this.hide();
                    resolve();
                },
                onCancel: () => {
                    this.hide();
                    resolve();
                }
            });
        });
    }

    /**
     * Show the modal with custom configuration
     * @param {Object} config - Modal configuration
     */
    show(config) {
        if (this.isVisible) {
            this.hide();
        }

        // Create overlay
        this.overlay = document.createElement('div');
        this.overlay.className = 'modal-overlay';
        this.overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
        `;

        // Create modal container
        this.container = document.createElement('div');
        this.container.className = 'modal-container';
        this.container.style.cssText = `
            background: var(--bg-primary, #1e1e1e);
            border: 1px solid var(--border-color, #3e3e3e);
            border-radius: 6px;
            min-width: 400px;
            max-width: 600px;
            padding: 20px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
        `;

        // Build modal content based on type
        let content = '';

        if (config.type === 'prompt') {
            content = `
                <div class="modal-header" style="margin-bottom: 16px;">
                    <h3 style="margin: 0; color: var(--text-primary, #cccccc);">${this.escapeHtml(config.title)}</h3>
                </div>
                <div class="modal-body" style="margin-bottom: 20px;">
                    <p style="margin: 0 0 12px 0; color: var(--text-secondary, #999999);">${this.escapeHtml(config.message)}</p>
                    <input type="text" id="modal-input" value="${this.escapeHtml(config.defaultValue)}"
                           style="width: 100%; padding: 8px; background: var(--bg-secondary, #252525);
                                  border: 1px solid var(--border-color, #3e3e3e); color: var(--text-primary, #cccccc);
                                  border-radius: 4px; font-family: inherit; font-size: 14px;">
                </div>
                <div class="modal-footer" style="display: flex; justify-content: flex-end; gap: 8px;">
                    <button id="modal-cancel" style="padding: 8px 16px; background: transparent;
                                                     border: 1px solid var(--border-color, #3e3e3e);
                                                     color: var(--text-primary, #cccccc); border-radius: 4px; cursor: pointer;">
                        Cancel
                    </button>
                    <button id="modal-submit" style="padding: 8px 16px; background: var(--accent-color, #007acc);
                                                     border: none; color: white; border-radius: 4px; cursor: pointer;">
                        OK
                    </button>
                </div>
            `;
        } else if (config.type === 'confirm') {
            content = `
                <div class="modal-header" style="margin-bottom: 16px;">
                    <h3 style="margin: 0; color: var(--text-primary, #cccccc);">${this.escapeHtml(config.title)}</h3>
                </div>
                <div class="modal-body" style="margin-bottom: 20px;">
                    <p style="margin: 0; color: var(--text-secondary, #999999);">${this.escapeHtml(config.message)}</p>
                </div>
                <div class="modal-footer" style="display: flex; justify-content: flex-end; gap: 8px;">
                    <button id="modal-cancel" style="padding: 8px 16px; background: transparent;
                                                     border: 1px solid var(--border-color, #3e3e3e);
                                                     color: var(--text-primary, #cccccc); border-radius: 4px; cursor: pointer;">
                        Cancel
                    </button>
                    <button id="modal-submit" style="padding: 8px 16px; background: var(--accent-color, #007acc);
                                                     border: none; color: white; border-radius: 4px; cursor: pointer;">
                        OK
                    </button>
                </div>
            `;
        } else if (config.type === 'alert') {
            content = `
                <div class="modal-header" style="margin-bottom: 16px;">
                    <h3 style="margin: 0; color: var(--text-primary, #cccccc);">${this.escapeHtml(config.title)}</h3>
                </div>
                <div class="modal-body" style="margin-bottom: 20px;">
                    <p style="margin: 0; color: var(--text-secondary, #999999);">${this.escapeHtml(config.message)}</p>
                </div>
                <div class="modal-footer" style="display: flex; justify-content: flex-end;">
                    <button id="modal-submit" style="padding: 8px 16px; background: var(--accent-color, #007acc);
                                                     border: none; color: white; border-radius: 4px; cursor: pointer;">
                        OK
                    </button>
                </div>
            `;
        }

        this.container.innerHTML = content;
        this.overlay.appendChild(this.container);
        document.body.appendChild(this.overlay);

        // Emit event for browser hiding
        eventBus.emit('overlay:shown', { type: 'modal' });

        // Setup event listeners
        const submitBtn = this.container.querySelector('#modal-submit');
        const cancelBtn = this.container.querySelector('#modal-cancel');
        const input = this.container.querySelector('#modal-input');

        if (submitBtn) {
            submitBtn.addEventListener('click', () => {
                if (config.type === 'prompt' && input) {
                    config.onSubmit(input.value);
                } else {
                    config.onSubmit();
                }
            });
        }

        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                config.onCancel();
            });
        }

        // Handle escape key
        const handleEscape = (e) => {
            if (e.key === 'Escape') {
                config.onCancel();
                document.removeEventListener('keydown', handleEscape);
            }
        };
        document.addEventListener('keydown', handleEscape);

        // Handle enter key for input
        if (input) {
            input.focus();
            input.select();
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    config.onSubmit(input.value);
                }
            });
        }

        // Click overlay to cancel
        this.overlay.addEventListener('click', (e) => {
            if (e.target === this.overlay) {
                config.onCancel();
            }
        });

        this.isVisible = true;
    }

    /**
     * Hide the modal
     */
    hide() {
        if (this.overlay && this.overlay.parentNode) {
            this.overlay.remove();
        }
        this.container = null;
        this.overlay = null;
        this.isVisible = false;
        this.currentResolve = null;

        // Emit event for browser showing
        eventBus.emit('overlay:hidden', { type: 'modal' });
    }

    /**
     * Escape HTML to prevent XSS
     * @param {string} text - Text to escape
     * @returns {string} Escaped text
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Export singleton instance
const modal = new Modal();
module.exports = modal;

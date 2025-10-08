/**
 * SettingsPanel - Settings configuration panel
 *
 * Provides UI for toggling IDE features
 */

const eventBus = require('../modules/EventBus');
const stateManager = require('../modules/StateManager');

class SettingsPanel {
    constructor() {
        this.isOpen = false;
        this.panel = null;
        this.settings = this.loadSettings();
    }

    /**
     * Load settings from localStorage
     */
    loadSettings() {
        const defaults = {
            lspEnabled: true,
            inlineCompletionEnabled: true,
            hoverEnabled: true,
            completionDelay: 100,
            hoverDelay: 200,
            markdownPreviewEnabled: true,
            breadcrumbEnabled: true
        };

        try {
            const stored = localStorage.getItem('ide-settings');
            return stored ? { ...defaults, ...JSON.parse(stored) } : defaults;
        } catch (error) {
            return defaults;
        }
    }

    /**
     * Save settings to localStorage
     */
    saveSettings() {
        try {
            localStorage.setItem('ide-settings', JSON.stringify(this.settings));
            eventBus.emit('settings:changed', this.settings);
        } catch (error) {
            console.error('[Settings] Error saving:', error);
        }
    }

    /**
     * Get a setting value
     */
    get(key) {
        return this.settings[key];
    }

    /**
     * Toggle the settings panel
     */
    toggle() {
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    }

    /**
     * Open settings panel
     */
    open() {
        if (this.isOpen) return;

        this.panel = document.createElement('div');
        this.panel.className = 'settings-panel';
        this.panel.innerHTML = `
            <div class="settings-overlay"></div>
            <div class="settings-content">
                <div class="settings-header">
                    <h2>⚙️ Settings</h2>
                    <button class="settings-close" id="settings-close">✕</button>
                </div>
                <div class="settings-body">
                    <div class="settings-section">
                        <h3>Language Server Protocol (LSP)</h3>

                        <div class="setting-item">
                            <label>
                                <input type="checkbox" id="lsp-enabled" ${this.settings.lspEnabled ? 'checked' : ''}>
                                <span>Enable LSP</span>
                            </label>
                            <p class="setting-description">Enables intelligent code completion and hover documentation</p>
                        </div>

                        <div class="setting-item">
                            <label>
                                <input type="checkbox" id="inline-completion-enabled" ${this.settings.inlineCompletionEnabled ? 'checked' : ''}>
                                <span>Enable Inline Autocomplete</span>
                            </label>
                            <p class="setting-description">Shows gray ghost text suggestions as you type (press Tab to accept)</p>
                        </div>

                        <div class="setting-item">
                            <label>
                                <input type="checkbox" id="hover-enabled" ${this.settings.hoverEnabled ? 'checked' : ''}>
                                <span>Enable Hover Documentation</span>
                            </label>
                            <p class="setting-description">Shows documentation when hovering over code</p>
                        </div>

                        <div class="setting-item">
                            <label>
                                <span>Autocomplete Delay (ms)</span>
                                <input type="number" id="completion-delay" value="${this.settings.completionDelay}" min="0" max="2000" step="50">
                            </label>
                            <p class="setting-description">Delay before showing inline completion</p>
                        </div>

                        <div class="setting-item">
                            <label>
                                <span>Hover Delay (ms)</span>
                                <input type="number" id="hover-delay" value="${this.settings.hoverDelay}" min="0" max="2000" step="50">
                            </label>
                            <p class="setting-description">Delay before showing hover tooltip</p>
                        </div>
                    </div>

                    <div class="settings-section">
                        <h3>File Viewers</h3>

                        <div class="setting-item">
                            <label>
                                <input type="checkbox" id="markdown-preview-enabled" ${this.settings.markdownPreviewEnabled ? 'checked' : ''}>
                                <span>Enable Markdown Preview</span>
                            </label>
                            <p class="setting-description">Enable preview mode for markdown files (click 🔍 to toggle)</p>
                        </div>

                        <div class="setting-item">
                            <label>
                                <input type="checkbox" id="breadcrumb-enabled" ${this.settings.breadcrumbEnabled ? 'checked' : ''}>
                                <span>Enable Breadcrumb Navigation</span>
                            </label>
                            <p class="setting-description">Show file path and code structure breadcrumb in editor header</p>
                        </div>
                    </div>

                    <div class="settings-footer">
                        <button class="settings-btn settings-save" id="settings-save">Save Settings</button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(this.panel);
        this.isOpen = true;

        this.setupEventListeners();
    }

    /**
     * Close settings panel
     */
    close() {
        if (!this.isOpen || !this.panel) return;

        this.panel.remove();
        this.panel = null;
        this.isOpen = false;
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Close button
        const closeBtn = this.panel.querySelector('#settings-close');
        closeBtn.addEventListener('click', () => this.close());

        // Close on overlay click
        const overlay = this.panel.querySelector('.settings-overlay');
        overlay.addEventListener('click', () => this.close());

        // Save button
        const saveBtn = this.panel.querySelector('#settings-save');
        saveBtn.addEventListener('click', () => {
            this.saveCurrentSettings();
            this.close();
        });

        // ESC key to close
        this.escapeHandler = (e) => {
            if (e.key === 'Escape' && this.isOpen) {
                this.close();
            }
        };
        document.addEventListener('keydown', this.escapeHandler);
    }

    /**
     * Save current settings from form
     */
    saveCurrentSettings() {
        this.settings.lspEnabled = this.panel.querySelector('#lsp-enabled').checked;
        this.settings.inlineCompletionEnabled = this.panel.querySelector('#inline-completion-enabled').checked;
        this.settings.hoverEnabled = this.panel.querySelector('#hover-enabled').checked;
        this.settings.completionDelay = parseInt(this.panel.querySelector('#completion-delay').value);
        this.settings.hoverDelay = parseInt(this.panel.querySelector('#hover-delay').value);
        this.settings.markdownPreviewEnabled = this.panel.querySelector('#markdown-preview-enabled').checked;
        this.settings.breadcrumbEnabled = this.panel.querySelector('#breadcrumb-enabled').checked;

        this.saveSettings();

        // Show notification
        this.showNotification('✓ Settings saved and applied!');
    }

    /**
     * Show notification
     */
    showNotification(message) {
        const notification = document.createElement('div');
        notification.className = 'settings-notification';
        notification.textContent = message;
        document.body.appendChild(notification);

        setTimeout(() => {
            notification.classList.add('fade-out');
            setTimeout(() => notification.remove(), 300);
        }, 2000);
    }

    /**
     * Cleanup
     */
    destroy() {
        this.close();
        if (this.escapeHandler) {
            document.removeEventListener('keydown', this.escapeHandler);
        }
    }
}

// Export singleton instance
const settingsPanel = new SettingsPanel();
module.exports = settingsPanel;

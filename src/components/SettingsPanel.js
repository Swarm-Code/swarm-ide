/**
 * SettingsPanel - Settings configuration panel
 *
 * Provides UI for toggling IDE features
 */

const eventBus = require('../modules/EventBus');
const stateManager = require('../modules/StateManager');
const logger = require('../utils/Logger');

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
            breadcrumbEnabled: true,
            // Logging settings
            loggingEnabled: false,  // Disabled by default
            loggingLevel: 'DEBUG',
            loggingMode: 'blacklist', // 'whitelist' or 'blacklist'
            loggingPreset: 'default', // 'default', 'quiet', 'verbose', 'gitOnly', etc.
            loggingFunctionalities: [] // Whitelist/blacklist array
        };

        try {
            const stored = localStorage.getItem('ide-settings');
            const settings = stored ? { ...defaults, ...JSON.parse(stored) } : defaults;

            // Apply logging settings to Logger on load
            this.applyLoggingSettings(settings);

            return settings;
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

                    <div class="settings-section settings-advanced">
                        <h3 style="cursor: pointer; user-select: none;" id="advanced-toggle">
                            🔧 Advanced Settings <span id="advanced-arrow">▼</span>
                        </h3>
                        <div id="advanced-content" style="display: none;">
                            <h4>🐛 Debug Logging</h4>

                            <div class="setting-item">
                                <label>
                                    <input type="checkbox" id="logging-enabled" ${this.settings.loggingEnabled ? 'checked' : ''}>
                                    <span>Enable Logging</span>
                                </label>
                                <p class="setting-description">Master switch for all debug logging</p>
                            </div>

                            <div class="setting-item">
                                <label>
                                    <span>Log Level</span>
                                    <select id="logging-level">
                                        <option value="ERROR" ${this.settings.loggingLevel === 'ERROR' ? 'selected' : ''}>ERROR - Errors only</option>
                                        <option value="WARN" ${this.settings.loggingLevel === 'WARN' ? 'selected' : ''}>WARN - Warnings & Errors</option>
                                        <option value="INFO" ${this.settings.loggingLevel === 'INFO' ? 'selected' : ''}>INFO - Important events</option>
                                        <option value="DEBUG" ${this.settings.loggingLevel === 'DEBUG' ? 'selected' : ''}>DEBUG - Detailed debugging</option>
                                        <option value="TRACE" ${this.settings.loggingLevel === 'TRACE' ? 'selected' : ''}>TRACE - Everything</option>
                                    </select>
                                </label>
                                <p class="setting-description">Minimum level of logs to display</p>
                            </div>

                            <div class="setting-item">
                                <label>
                                    <span>Quick Presets</span>
                                    <select id="logging-preset">
                                        <option value="default">Default - All except perfMonitor</option>
                                        <option value="quiet">Quiet - Errors only</option>
                                        <option value="verbose">Verbose - Everything</option>
                                        <option value="gitOnly">Git Only - Only git operations</option>
                                        <option value="lspOnly">LSP Only - Only editor/LSP</option>
                                        <option value="lessNoisy">Less Noisy - Disable verbose stuff</option>
                                    </select>
                                </label>
                                <p class="setting-description">Quick presets for common scenarios</p>
                            </div>

                            <h5 style="margin-top: 15px;">Git Operations</h5>
                            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 5px; margin-bottom: 10px;">
                                <label><input type="checkbox" class="log-functionality" data-func="gitPush"> gitPush</label>
                                <label><input type="checkbox" class="log-functionality" data-func="gitPull"> gitPull</label>
                                <label><input type="checkbox" class="log-functionality" data-func="gitFetch"> gitFetch</label>
                                <label><input type="checkbox" class="log-functionality" data-func="gitCommit"> gitCommit</label>
                                <label><input type="checkbox" class="log-functionality" data-func="gitBranch"> gitBranch</label>
                                <label><input type="checkbox" class="log-functionality" data-func="gitMerge"> gitMerge</label>
                                <label><input type="checkbox" class="log-functionality" data-func="gitConflict"> gitConflict</label>
                                <label><input type="checkbox" class="log-functionality" data-func="gitDiff"> gitDiff</label>
                                <label><input type="checkbox" class="log-functionality" data-func="gitBlame"> gitBlame</label>
                                <label><input type="checkbox" class="log-functionality" data-func="gitHistory"> gitHistory</label>
                                <label><input type="checkbox" class="log-functionality" data-func="gitStatus"> gitStatus</label>
                            </div>

                            <h5>LSP Features</h5>
                            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 5px; margin-bottom: 10px;">
                                <label><input type="checkbox" class="log-functionality" data-func="hover"> hover</label>
                                <label><input type="checkbox" class="log-functionality" data-func="goToDefinition"> goToDefinition</label>
                                <label><input type="checkbox" class="log-functionality" data-func="findReferences"> findReferences</label>
                                <label><input type="checkbox" class="log-functionality" data-func="renameSymbol"> renameSymbol</label>
                                <label><input type="checkbox" class="log-functionality" data-func="formatting"> formatting</label>
                                <label><input type="checkbox" class="log-functionality" data-func="lspClient"> lspClient</label>
                                <label><input type="checkbox" class="log-functionality" data-func="lspServer"> lspServer</label>
                            </div>

                            <h5>Editor</h5>
                            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 5px; margin-bottom: 10px;">
                                <label><input type="checkbox" class="log-functionality" data-func="editorInit"> editorInit</label>
                                <label><input type="checkbox" class="log-functionality" data-func="editorChange"> editorChange</label>
                                <label><input type="checkbox" class="log-functionality" data-func="diffRender"> diffRender</label>
                                <label><input type="checkbox" class="log-functionality" data-func="syntaxHighlight"> syntaxHighlight</label>
                                <label><input type="checkbox" class="log-functionality" data-func="autocomplete"> autocomplete</label>
                            </div>

                            <h5>Panes & Tabs</h5>
                            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 5px; margin-bottom: 10px;">
                                <label><input type="checkbox" class="log-functionality" data-func="tabSwitch"> tabSwitch</label>
                                <label><input type="checkbox" class="log-functionality" data-func="paneCreate"> paneCreate</label>
                                <label><input type="checkbox" class="log-functionality" data-func="paneSplit"> paneSplit</label>
                                <label><input type="checkbox" class="log-functionality" data-func="paneClose"> paneClose</label>
                                <label><input type="checkbox" class="log-functionality" data-func="dragDrop"> dragDrop</label>
                            </div>

                            <h5>Files</h5>
                            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 5px; margin-bottom: 10px;">
                                <label><input type="checkbox" class="log-functionality" data-func="fileOpen"> fileOpen</label>
                                <label><input type="checkbox" class="log-functionality" data-func="fileClose"> fileClose</label>
                                <label><input type="checkbox" class="log-functionality" data-func="fileSave"> fileSave</label>
                                <label><input type="checkbox" class="log-functionality" data-func="fileWatch"> fileWatch</label>
                                <label><input type="checkbox" class="log-functionality" data-func="fileSystem"> fileSystem</label>
                            </div>

                            <h5>Application</h5>
                            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 5px; margin-bottom: 10px;">
                                <label><input type="checkbox" class="log-functionality" data-func="appInit"> appInit</label>
                                <label><input type="checkbox" class="log-functionality" data-func="appShutdown"> appShutdown</label>
                                <label><input type="checkbox" class="log-functionality" data-func="settings"> settings</label>
                                <label><input type="checkbox" class="log-functionality" data-func="perfMonitor"> perfMonitor</label>
                            </div>

                            <h5>Browser</h5>
                            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 5px; margin-bottom: 10px;">
                                <label><input type="checkbox" class="log-functionality" data-func="browserNav"> browserNav</label>
                                <label><input type="checkbox" class="log-functionality" data-func="browserProfile"> browserProfile</label>
                                <label><input type="checkbox" class="log-functionality" data-func="browserAutomation"> browserAutomation</label>
                            </div>

                            <h5>Workspace</h5>
                            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 5px; margin-bottom: 10px;">
                                <label><input type="checkbox" class="log-functionality" data-func="workspaceLoad"> workspaceLoad</label>
                                <label><input type="checkbox" class="log-functionality" data-func="workspaceChange"> workspaceChange</label>
                            </div>

                            <h5>UI Components</h5>
                            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 5px; margin-bottom: 10px;">
                                <label><input type="checkbox" class="log-functionality" data-func="menu"> menu</label>
                                <label><input type="checkbox" class="log-functionality" data-func="statusBar"> statusBar</label>
                                <label><input type="checkbox" class="log-functionality" data-func="dialog"> dialog</label>
                                <label><input type="checkbox" class="log-functionality" data-func="eventBus"> eventBus</label>
                            </div>

                            <h5>SSH Operations</h5>
                            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 5px; margin-bottom: 10px;">
                                <label><input type="checkbox" class="log-functionality" data-func="ssh"> ssh</label>
                                <label><input type="checkbox" class="log-functionality" data-func="sshPanel"> sshPanel</label>
                                <label><input type="checkbox" class="log-functionality" data-func="sshService"> sshService</label>
                                <label><input type="checkbox" class="log-functionality" data-func="sshConnection"> sshConnection</label>
                                <label><input type="checkbox" class="log-functionality" data-func="sshDialog"> sshDialog</label>
                                <label><input type="checkbox" class="log-functionality" data-func="sshFileExplorer"> sshFileExplorer</label>
                                <label><input type="checkbox" class="log-functionality" data-func="sshListDir"> sshListDir</label>
                                <label><input type="checkbox" class="log-functionality" data-func="sshProgress"> sshProgress</label>
                            </div>

                            <div class="setting-item">
                                <button class="settings-btn" id="apply-logging" style="background: #4CAF50;">Apply Logging Settings</button>
                                <p class="setting-description">Click to apply logging changes immediately (without closing settings)</p>
                            </div>
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
        this.restoreLoggingCheckboxes();
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
     * Restore logging checkbox states from saved settings
     */
    restoreLoggingCheckboxes() {
        if (!this.settings.loggingFunctionalities || this.settings.loggingFunctionalities.length === 0) {
            return;
        }

        // Check the saved functionalities
        this.settings.loggingFunctionalities.forEach(func => {
            const checkbox = this.panel.querySelector(`.log-functionality[data-func="${func}"]`);
            if (checkbox) {
                checkbox.checked = true;
            }
        });
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

        // Advanced toggle
        const advancedToggle = this.panel.querySelector('#advanced-toggle');
        const advancedContent = this.panel.querySelector('#advanced-content');
        const advancedArrow = this.panel.querySelector('#advanced-arrow');
        advancedToggle.addEventListener('click', () => {
            if (advancedContent.style.display === 'none') {
                advancedContent.style.display = 'block';
                advancedArrow.textContent = '▲';
            } else {
                advancedContent.style.display = 'none';
                advancedArrow.textContent = '▼';
            }
        });

        // Apply logging button (immediate apply without closing)
        const applyLogging = this.panel.querySelector('#apply-logging');
        applyLogging.addEventListener('click', () => {
            this.applyCurrentLoggingSettings();
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

        // Save logging settings
        this.settings.loggingEnabled = this.panel.querySelector('#logging-enabled').checked;
        this.settings.loggingLevel = this.panel.querySelector('#logging-level').value;
        this.settings.loggingPreset = this.panel.querySelector('#logging-preset').value;

        // Collect checked functionalities
        const checkedFunctionalities = [];
        this.panel.querySelectorAll('.log-functionality:checked').forEach(cb => {
            checkedFunctionalities.push(cb.dataset.func);
        });
        this.settings.loggingMode = checkedFunctionalities.length > 0 ? 'whitelist' : 'blacklist';
        this.settings.loggingFunctionalities = checkedFunctionalities;

        this.saveSettings();

        // Apply logging settings immediately
        this.applyLoggingSettings(this.settings);

        // Show notification
        this.showNotification('✓ Settings saved and applied!');
    }

    /**
     * Apply logging settings to Logger
     */
    applyLoggingSettings(settings) {
        const loggingConfig = require('../config/logging.config.js');

        // Apply preset if specified
        if (settings.loggingPreset && settings.loggingPreset !== 'default') {
            const preset = loggingConfig.presets[settings.loggingPreset];
            if (preset) {
                logger.setEnabled(preset.enabled);
                logger.setLevel(preset.logLevel);

                if (preset.mode === 'whitelist' && preset.enabledFunctionalities) {
                    logger.enableOnly(preset.enabledFunctionalities);
                } else if (preset.mode === 'blacklist' && preset.disabledFunctionalities) {
                    logger.disable(preset.disabledFunctionalities);
                }

                logger.info('settings', `Applied logging preset: ${settings.loggingPreset}`);
                return;
            }
        }

        // Apply individual settings
        logger.setEnabled(settings.loggingEnabled);
        logger.setLevel(settings.loggingLevel);

        // Apply mode and functionalities if specified
        if (settings.loggingMode === 'whitelist' && settings.loggingFunctionalities?.length > 0) {
            logger.enableOnly(settings.loggingFunctionalities);
        } else if (settings.loggingMode === 'blacklist' && settings.loggingFunctionalities?.length > 0) {
            logger.disable(settings.loggingFunctionalities);
        }

        logger.info('settings', 'Logging settings applied', {
            enabled: settings.loggingEnabled,
            level: settings.loggingLevel,
            mode: settings.loggingMode
        });
    }

    /**
     * Apply current logging settings from form and save them
     */
    applyCurrentLoggingSettings() {
        const loggingEnabled = this.panel.querySelector('#logging-enabled').checked;
        const loggingLevel = this.panel.querySelector('#logging-level').value;
        const loggingPreset = this.panel.querySelector('#logging-preset').value;

        // Collect checked functionalities
        const checkedFunctionalities = [];
        this.panel.querySelectorAll('.log-functionality:checked').forEach(cb => {
            checkedFunctionalities.push(cb.dataset.func);
        });

        // Update settings object
        this.settings.loggingEnabled = loggingEnabled;
        this.settings.loggingLevel = loggingLevel;
        this.settings.loggingPreset = loggingPreset;
        this.settings.loggingMode = checkedFunctionalities.length > 0 ? 'whitelist' : 'blacklist';
        this.settings.loggingFunctionalities = checkedFunctionalities;

        // Save to localStorage
        this.saveSettings();

        // Apply to logger
        this.applyLoggingSettings(this.settings);

        // Show notification
        this.showNotification('✓ Logging settings applied and saved!');
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

/**
 * SSHServerConfigDialog - Modal dialog for adding/editing SSH server configurations
 *
 * Features:
 * - Add new server or edit existing
 * - Form validation
 * - Test connection before saving
 * - Secure password handling
 * - Support for multiple authentication methods
 *
 * Usage:
 *   const dialog = new SSHServerConfigDialog();
 *   const result = await dialog.show(existingServer); // edit mode
 *   const result = await dialog.show(); // add mode
 */

const logger = require('../utils/Logger');
const { Client } = require('ssh2');

class SSHServerConfigDialog {
    constructor() {
        this.overlay = null;
        this.container = null;
        this.isVisible = false;
        this.currentResolve = null;
        this.mode = 'add'; // 'add' or 'edit'
        this.serverData = null;
        this.testingConnection = false;
    }

    /**
     * Show the dialog
     * @param {Object} serverData - Existing server data for edit mode (optional)
     * @returns {Promise<Object|null>} Server configuration or null if cancelled
     */
    async show(serverData = null) {
        return new Promise((resolve) => {
            this.currentResolve = resolve;
            this.mode = serverData ? 'edit' : 'add';
            this.serverData = serverData;
            this.render();
            this.setupEventListeners();
            this.isVisible = true;
        });
    }

    /**
     * Render the dialog
     */
    render() {
        // Create overlay
        this.overlay = document.createElement('div');
        this.overlay.className = 'ssh-config-dialog-overlay';
        this.overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.7);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
            animation: fadeIn 0.2s ease-out;
        `;

        // Create dialog container
        this.container = document.createElement('div');
        this.container.className = 'ssh-config-dialog-container';
        this.container.style.cssText = `
            background: var(--bg-primary, #1e1e1e);
            border: 1px solid var(--border-color, #3e3e3e);
            border-radius: 8px;
            width: 90%;
            max-width: 600px;
            max-height: 90vh;
            overflow-y: auto;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
            animation: slideIn 0.3s ease-out;
        `;

        const title = this.mode === 'add' ? 'Add SSH Server' : 'Edit SSH Server';
        const submitText = this.mode === 'add' ? 'Add Server' : 'Save Changes';

        // Get existing values for edit mode
        const name = this.serverData?.name || '';
        const host = this.serverData?.host || '';
        const port = this.serverData?.port || 22;
        const username = this.serverData?.username || '';
        const authMethod = this.serverData?.authMethod || 'password';
        const keyPath = this.serverData?.keyPath || '';
        const defaultPath = this.serverData?.defaultPath || '';
        const tags = this.serverData?.tags?.join(', ') || '';
        const autoConnect = this.serverData?.autoConnect || false;

        this.container.innerHTML = `
            <div class="ssh-config-dialog-content">
                <!-- Header -->
                <div class="ssh-config-dialog-header">
                    <h2 class="ssh-config-dialog-title">${this.escapeHtml(title)}</h2>
                    <button class="ssh-config-dialog-close" id="ssh-config-close">×</button>
                </div>

                <!-- Form -->
                <form id="ssh-config-form" class="ssh-config-form">
                    <!-- Server Name -->
                    <div class="ssh-config-field">
                        <label for="ssh-config-name">Server Name *</label>
                        <input
                            type="text"
                            id="ssh-config-name"
                            name="name"
                            value="${this.escapeHtml(name)}"
                            placeholder="My Server"
                            required
                        />
                        <span class="ssh-config-error" id="error-name"></span>
                    </div>

                    <!-- Host -->
                    <div class="ssh-config-field">
                        <label for="ssh-config-host">Host / IP Address *</label>
                        <input
                            type="text"
                            id="ssh-config-host"
                            name="host"
                            value="${this.escapeHtml(host)}"
                            placeholder="example.com or 192.168.1.100"
                            required
                        />
                        <span class="ssh-config-error" id="error-host"></span>
                    </div>

                    <!-- Port -->
                    <div class="ssh-config-field">
                        <label for="ssh-config-port">Port</label>
                        <input
                            type="number"
                            id="ssh-config-port"
                            name="port"
                            value="${port}"
                            placeholder="22"
                            min="1"
                            max="65535"
                        />
                        <span class="ssh-config-error" id="error-port"></span>
                    </div>

                    <!-- Username -->
                    <div class="ssh-config-field">
                        <label for="ssh-config-username">Username *</label>
                        <input
                            type="text"
                            id="ssh-config-username"
                            name="username"
                            value="${this.escapeHtml(username)}"
                            placeholder="username"
                            required
                        />
                        <span class="ssh-config-error" id="error-username"></span>
                    </div>

                    <!-- Authentication Method -->
                    <div class="ssh-config-field">
                        <label for="ssh-config-auth-method">Authentication Method</label>
                        <select id="ssh-config-auth-method" name="authMethod">
                            <option value="password" ${authMethod === 'password' ? 'selected' : ''}>Password</option>
                            <option value="key" ${authMethod === 'key' ? 'selected' : ''}>SSH Key</option>
                            <option value="agent" ${authMethod === 'agent' ? 'selected' : ''}>SSH Agent</option>
                        </select>
                    </div>

                    <!-- Password (conditional) -->
                    <div class="ssh-config-field" id="ssh-config-password-field" style="display: ${authMethod === 'password' ? 'block' : 'none'};">
                        <label for="ssh-config-password">Password</label>
                        <input
                            type="password"
                            id="ssh-config-password"
                            name="password"
                            placeholder="${this.mode === 'edit' ? '(leave blank to keep existing)' : 'Enter password'}"
                        />
                        <span class="ssh-config-hint">Password will be stored securely in system keychain</span>
                    </div>

                    <!-- SSH Key Path (conditional) -->
                    <div class="ssh-config-field" id="ssh-config-key-field" style="display: ${authMethod === 'key' ? 'block' : 'none'};">
                        <label for="ssh-config-key-path">SSH Key Path</label>
                        <div class="ssh-config-file-input">
                            <input
                                type="text"
                                id="ssh-config-key-path"
                                name="keyPath"
                                value="${this.escapeHtml(keyPath)}"
                                placeholder="~/.ssh/id_rsa"
                            />
                            <button type="button" class="ssh-config-browse-btn" id="ssh-config-browse-key">Browse</button>
                        </div>
                        <span class="ssh-config-error" id="error-keyPath"></span>
                    </div>

                    <!-- Default Remote Path -->
                    <div class="ssh-config-field">
                        <label for="ssh-config-default-path">Default Remote Path</label>
                        <input
                            type="text"
                            id="ssh-config-default-path"
                            name="defaultPath"
                            value="${this.escapeHtml(defaultPath)}"
                            placeholder="/home/user or leave blank for home directory"
                        />
                        <span class="ssh-config-hint">Directory to open when connecting</span>
                    </div>

                    <!-- Tags -->
                    <div class="ssh-config-field">
                        <label for="ssh-config-tags">Tags</label>
                        <input
                            type="text"
                            id="ssh-config-tags"
                            name="tags"
                            value="${this.escapeHtml(tags)}"
                            placeholder="production, web-server, database"
                        />
                        <span class="ssh-config-hint">Comma-separated tags for organization</span>
                    </div>

                    <!-- Auto Connect -->
                    <div class="ssh-config-field ssh-config-checkbox-field">
                        <label>
                            <input
                                type="checkbox"
                                id="ssh-config-auto-connect"
                                name="autoConnect"
                                ${autoConnect ? 'checked' : ''}
                            />
                            <span>Auto-connect on startup</span>
                        </label>
                    </div>

                    <!-- Test Result -->
                    <div id="ssh-config-test-result" class="ssh-config-test-result" style="display: none;"></div>

                    <!-- Actions -->
                    <div class="ssh-config-actions">
                        <button type="button" class="ssh-config-btn ssh-config-btn-secondary" id="ssh-config-test">
                            Test Connection
                        </button>
                        <div class="ssh-config-actions-right">
                            <button type="button" class="ssh-config-btn ssh-config-btn-secondary" id="ssh-config-cancel">
                                Cancel
                            </button>
                            <button type="submit" class="ssh-config-btn ssh-config-btn-primary" id="ssh-config-submit">
                                ${submitText}
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        `;

        this.overlay.appendChild(this.container);
        document.body.appendChild(this.overlay);

        logger.debug('sshConfig', `Dialog rendered in ${this.mode} mode`);
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        const form = this.container.querySelector('#ssh-config-form');
        const closeBtn = this.container.querySelector('#ssh-config-close');
        const cancelBtn = this.container.querySelector('#ssh-config-cancel');
        const testBtn = this.container.querySelector('#ssh-config-test');
        const authMethodSelect = this.container.querySelector('#ssh-config-auth-method');
        const browseKeyBtn = this.container.querySelector('#ssh-config-browse-key');

        // Form submit
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleSubmit();
        });

        // Close button
        closeBtn.addEventListener('click', () => {
            this.hide(null);
        });

        // Cancel button
        cancelBtn.addEventListener('click', () => {
            this.hide(null);
        });

        // Test connection button
        testBtn.addEventListener('click', async () => {
            await this.testConnection();
        });

        // Auth method change
        authMethodSelect.addEventListener('change', (e) => {
            this.updateAuthFields(e.target.value);
        });

        // Browse key button
        if (browseKeyBtn) {
            browseKeyBtn.addEventListener('click', async () => {
                await this.browseForKey();
            });
        }

        // ESC key to close
        const handleKeydown = (e) => {
            if (e.key === 'Escape' && this.isVisible) {
                this.hide(null);
            }
        };
        document.addEventListener('keydown', handleKeydown);
        this._keydownHandler = handleKeydown;

        // Click overlay to close
        this.overlay.addEventListener('click', (e) => {
            if (e.target === this.overlay) {
                this.hide(null);
            }
        });
    }

    /**
     * Update auth fields visibility based on selected method
     */
    updateAuthFields(authMethod) {
        const passwordField = this.container.querySelector('#ssh-config-password-field');
        const keyField = this.container.querySelector('#ssh-config-key-field');

        if (authMethod === 'password') {
            passwordField.style.display = 'block';
            keyField.style.display = 'none';
        } else if (authMethod === 'key') {
            passwordField.style.display = 'none';
            keyField.style.display = 'block';
        } else {
            passwordField.style.display = 'none';
            keyField.style.display = 'none';
        }
    }

    /**
     * Browse for SSH key file
     */
    async browseForKey() {
        try {
            const { ipcRenderer } = require('electron');

            const result = await ipcRenderer.invoke('browse-for-file', {
                title: 'Select SSH Private Key',
                filters: [
                    { name: 'SSH Keys', extensions: ['', 'pem', 'key', 'pub'] },
                    { name: 'All Files', extensions: ['*'] }
                ]
            });

            if (!result.canceled && result.filePaths && result.filePaths.length > 0) {
                const keyPathInput = this.container.querySelector('#ssh-config-key-path');
                keyPathInput.value = result.filePaths[0];
                logger.debug('sshConfig', 'SSH key selected:', result.filePaths[0]);
            }
        } catch (error) {
            logger.error('sshConfig', 'Error browsing for key:', error);
        }
    }

    /**
     * Test the connection
     */
    async testConnection() {
        if (this.testingConnection) return;

        this.testingConnection = true;
        const testBtn = this.container.querySelector('#ssh-config-test');
        const testResult = this.container.querySelector('#ssh-config-test-result');
        const originalText = testBtn.textContent;

        testBtn.textContent = 'Testing...';
        testBtn.disabled = true;
        testResult.style.display = 'none';

        try {
            // Validate form first
            const config = this.getFormData();
            if (!config) {
                throw new Error('Please fill in all required fields');
            }

            logger.info('sshConfig', 'Testing connection to:', config.host);

            // Create SSH client for testing
            const client = new Client();

            // Test connection with timeout
            const testPromise = new Promise((resolve, reject) => {
                let connected = false;

                // Set timeout
                const timeout = setTimeout(() => {
                    if (!connected) {
                        client.end();
                        reject(new Error('Connection timeout (10 seconds)'));
                    }
                }, 10000);

                client.on('ready', () => {
                    connected = true;
                    clearTimeout(timeout);
                    logger.debug('sshConfig', 'Test connection successful');
                    client.end();
                    resolve();
                });

                client.on('error', (err) => {
                    connected = true;
                    clearTimeout(timeout);
                    logger.error('sshConfig', 'Test connection error:', err);
                    reject(err);
                });

                // Prepare connection config
                const sshConfig = {
                    host: config.host,
                    port: config.port,
                    username: config.username,
                    readyTimeout: 10000
                };

                // Add authentication based on method
                if (config.authMethod === 'password') {
                    if (!config.password) {
                        reject(new Error('Password is required for password authentication'));
                        return;
                    }
                    sshConfig.password = config.password;
                } else if (config.authMethod === 'key') {
                    if (!config.keyPath) {
                        reject(new Error('SSH key path is required for key authentication'));
                        return;
                    }
                    // Load key from file
                    const fs = require('fs');
                    try {
                        sshConfig.privateKey = fs.readFileSync(config.keyPath);
                        if (config.passphrase) {
                            sshConfig.passphrase = config.passphrase;
                        }
                    } catch (err) {
                        reject(new Error(`Failed to read SSH key: ${err.message}`));
                        return;
                    }
                } else if (config.authMethod === 'agent') {
                    sshConfig.agent = process.env.SSH_AUTH_SOCK;
                    if (!sshConfig.agent) {
                        reject(new Error('SSH agent not available (SSH_AUTH_SOCK not set)'));
                        return;
                    }
                }

                // Attempt connection
                try {
                    client.connect(sshConfig);
                } catch (err) {
                    clearTimeout(timeout);
                    reject(err);
                }
            });

            await testPromise;

            // Show success
            testResult.className = 'ssh-config-test-result ssh-config-test-success';
            testResult.innerHTML = '✓ <strong>Connection successful!</strong> Server is reachable and credentials are valid.';
            testResult.style.display = 'block';

            logger.info('sshConfig', 'Connection test successful');

        } catch (error) {
            logger.error('sshConfig', 'Connection test failed:', error);

            // Provide helpful error messages
            let errorMsg = error.message;
            if (errorMsg.includes('ENOTFOUND')) {
                errorMsg = 'Host not found. Please check the hostname or IP address.';
            } else if (errorMsg.includes('ECONNREFUSED')) {
                errorMsg = 'Connection refused. Please check the port number and ensure SSH is running.';
            } else if (errorMsg.includes('ETIMEDOUT') || errorMsg.includes('timeout')) {
                errorMsg = 'Connection timeout. Please check network connectivity and firewall settings.';
            } else if (errorMsg.includes('authentication')) {
                errorMsg = 'Authentication failed. Please check your username and password/key.';
            }

            // Show error
            testResult.className = 'ssh-config-test-result ssh-config-test-error';
            testResult.innerHTML = `✗ <strong>Connection failed:</strong> ${this.escapeHtml(errorMsg)}`;
            testResult.style.display = 'block';
        } finally {
            testBtn.textContent = originalText;
            testBtn.disabled = false;
            this.testingConnection = false;
        }
    }

    /**
     * Get form data
     * @returns {Object|null} Form data or null if invalid
     */
    getFormData() {
        const name = this.container.querySelector('#ssh-config-name').value.trim();
        const host = this.container.querySelector('#ssh-config-host').value.trim();
        const port = parseInt(this.container.querySelector('#ssh-config-port').value) || 22;
        const username = this.container.querySelector('#ssh-config-username').value.trim();
        const authMethod = this.container.querySelector('#ssh-config-auth-method').value;
        const password = this.container.querySelector('#ssh-config-password')?.value || '';
        const keyPath = this.container.querySelector('#ssh-config-key-path')?.value.trim() || '';
        const defaultPath = this.container.querySelector('#ssh-config-default-path').value.trim();
        const tagsStr = this.container.querySelector('#ssh-config-tags').value.trim();
        const autoConnect = this.container.querySelector('#ssh-config-auto-connect').checked;

        // Validation
        if (!name) {
            this.showFieldError('name', 'Server name is required');
            return null;
        }

        if (!host) {
            this.showFieldError('host', 'Host is required');
            return null;
        }

        if (!username) {
            this.showFieldError('username', 'Username is required');
            return null;
        }

        if (authMethod === 'key' && !keyPath) {
            this.showFieldError('keyPath', 'SSH key path is required for key authentication');
            return null;
        }

        // Parse tags
        const tags = tagsStr ? tagsStr.split(',').map(t => t.trim()).filter(t => t) : [];

        // Build config
        const config = {
            name,
            host,
            port,
            username,
            authMethod,
            defaultPath,
            tags,
            autoConnect
        };

        // Add auth-specific fields
        if (authMethod === 'password' && password) {
            config.password = password;
        } else if (authMethod === 'key') {
            config.keyPath = keyPath;
        }

        // Preserve ID for edit mode
        if (this.mode === 'edit' && this.serverData?.id) {
            config.id = this.serverData.id;
        }

        return config;
    }

    /**
     * Show field error
     */
    showFieldError(fieldName, message) {
        const errorSpan = this.container.querySelector(`#error-${fieldName}`);
        if (errorSpan) {
            errorSpan.textContent = message;
            errorSpan.style.display = 'block';
        }

        // Clear error on input
        const field = this.container.querySelector(`#ssh-config-${fieldName}`);
        if (field) {
            field.addEventListener('input', () => {
                if (errorSpan) {
                    errorSpan.textContent = '';
                    errorSpan.style.display = 'none';
                }
            }, { once: true });
        }
    }

    /**
     * Handle form submit
     */
    async handleSubmit() {
        // Clear previous errors
        this.container.querySelectorAll('.ssh-config-error').forEach(el => {
            el.textContent = '';
            el.style.display = 'none';
        });

        const config = this.getFormData();
        if (!config) {
            return;
        }

        logger.info('sshConfig', `${this.mode === 'add' ? 'Adding' : 'Updating'} server:`, config.name);
        this.hide(config);
    }

    /**
     * Hide the dialog
     */
    hide(result) {
        if (this.overlay && this.overlay.parentNode) {
            this.overlay.remove();
        }

        if (this._keydownHandler) {
            document.removeEventListener('keydown', this._keydownHandler);
            this._keydownHandler = null;
        }

        this.isVisible = false;

        if (this.currentResolve) {
            this.currentResolve(result);
            this.currentResolve = null;
        }
    }

    /**
     * Escape HTML
     */
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = String(text);
        return div.innerHTML;
    }
}

module.exports = SSHServerConfigDialog;

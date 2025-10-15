/**
 * SSHConnectionDialog - SSH connection configuration dialog
 *
 * Provides a form interface for creating and editing SSH connections.
 * Supports multiple authentication methods and connection validation.
 *
 * Features:
 * - Host, port, and username configuration
 * - Password and SSH key authentication
 * - Connection testing
 * - Form validation
 * - Integration with SSH service
 *
 * Usage:
 *   const dialog = new SSHConnectionDialog();
 *   dialog.show();
 *   dialog.on('connectionCreated', (connectionId) => { ... });
 */

const eventBus = require('../modules/EventBus');
const logger = require('../utils/Logger');

class SSHConnectionDialog {
    constructor() {
        this.dialog = null;
        this.isOpen = false;
        this.editMode = false;
        this.editConnectionId = null;

        // Form elements
        this.form = null;
        this.hostInput = null;
        this.portInput = null;
        this.usernameInput = null;
        this.authMethodSelect = null;
        this.passwordInput = null;
        this.privateKeyInput = null;
        this.passphraseInput = null;
        this.nameInput = null;

        // Buttons
        this.testButton = null;
        this.saveButton = null;
        this.cancelButton = null;

        // Status elements
        this.statusDiv = null;
        this.testStatusDiv = null;

        logger.debug('ssh', 'SSH Connection Dialog initialized');
    }

    /**
     * Show the SSH connection dialog
     * @param {Object} connectionData - Existing connection data for editing (optional)
     */
    show(connectionData = null) {
        if (this.isOpen) {
            return;
        }

        this.editMode = !!connectionData;
        this.editConnectionId = connectionData?.id || null;

        this.createDialog();
        this.setupEventListeners();

        if (connectionData) {
            this.populateForm(connectionData);
        }

        document.body.appendChild(this.dialog);
        this.isOpen = true;

        // Focus on first input
        setTimeout(() => {
            this.nameInput.focus();
        }, 100);

        logger.debug('ssh', `SSH dialog shown in ${this.editMode ? 'edit' : 'create'} mode`);
    }

    /**
     * Hide the dialog
     */
    hide() {
        if (!this.isOpen || !this.dialog) {
            return;
        }

        document.body.removeChild(this.dialog);
        this.dialog = null;
        this.isOpen = false;
        this.editMode = false;
        this.editConnectionId = null;

        logger.debug('ssh', 'SSH dialog hidden');
    }

    /**
     * Create the dialog DOM structure
     */
    createDialog() {
        this.dialog = document.createElement('div');
        this.dialog.className = 'ssh-dialog-overlay';

        this.dialog.innerHTML = `
            <div class="ssh-dialog">
                <div class="ssh-dialog-header">
                    <h3>${this.editMode ? 'Edit SSH Connection' : 'New SSH Connection'}</h3>
                    <button type="button" class="ssh-dialog-close" aria-label="Close">&times;</button>
                </div>

                <div class="ssh-dialog-content">
                    <form class="ssh-connection-form">
                        <div class="ssh-form-row">
                            <label for="ssh-name">Connection Name</label>
                            <input type="text" id="ssh-name" name="name" placeholder="My Server" required>
                        </div>

                        <div class="ssh-form-row">
                            <label for="ssh-host">Host</label>
                            <input type="text" id="ssh-host" name="host" placeholder="192.168.1.100" required>
                        </div>

                        <div class="ssh-form-row">
                            <label for="ssh-port">Port</label>
                            <input type="number" id="ssh-port" name="port" value="22" min="1" max="65535" required>
                        </div>

                        <div class="ssh-form-row">
                            <label for="ssh-username">Username</label>
                            <input type="text" id="ssh-username" name="username" placeholder="root" required>
                        </div>

                        <div class="ssh-form-row">
                            <label for="ssh-auth-method">Authentication Method</label>
                            <select id="ssh-auth-method" name="authMethod" required>
                                <option value="password">Password</option>
                                <option value="privateKey">SSH Key</option>
                            </select>
                        </div>

                        <div class="ssh-auth-section ssh-password-auth">
                            <div class="ssh-form-row">
                                <label for="ssh-password">Password</label>
                                <input type="password" id="ssh-password" name="password" placeholder="Password">
                            </div>
                        </div>

                        <div class="ssh-auth-section ssh-key-auth" style="display: none;">
                            <div class="ssh-form-row">
                                <label for="ssh-private-key">Private Key Path</label>
                                <div class="ssh-input-with-button">
                                    <input type="text" id="ssh-private-key" name="privateKey" placeholder="/home/user/.ssh/id_rsa">
                                    <button type="button" class="ssh-browse-key-btn">Browse</button>
                                </div>
                            </div>

                            <div class="ssh-form-row">
                                <label for="ssh-passphrase">Passphrase (optional)</label>
                                <input type="password" id="ssh-passphrase" name="passphrase" placeholder="Key passphrase">
                            </div>
                        </div>

                        <div class="ssh-status-section">
                            <div class="ssh-status"></div>
                            <div class="ssh-test-status"></div>
                        </div>
                    </form>
                </div>

                <div class="ssh-dialog-footer">
                    <button type="button" class="ssh-test-btn">Test Connection</button>
                    <div class="ssh-dialog-actions">
                        <button type="button" class="ssh-cancel-btn">Cancel</button>
                        <button type="button" class="ssh-save-btn" disabled>${this.editMode ? 'Update' : 'Save'}</button>
                    </div>
                </div>
            </div>
        `;

        this.initializeFormElements();
        this.addDialogStyles();
    }

    /**
     * Initialize form element references
     */
    initializeFormElements() {
        this.form = this.dialog.querySelector('.ssh-connection-form');
        this.nameInput = this.dialog.querySelector('#ssh-name');
        this.hostInput = this.dialog.querySelector('#ssh-host');
        this.portInput = this.dialog.querySelector('#ssh-port');
        this.usernameInput = this.dialog.querySelector('#ssh-username');
        this.authMethodSelect = this.dialog.querySelector('#ssh-auth-method');
        this.passwordInput = this.dialog.querySelector('#ssh-password');
        this.privateKeyInput = this.dialog.querySelector('#ssh-private-key');
        this.passphraseInput = this.dialog.querySelector('#ssh-passphrase');

        this.testButton = this.dialog.querySelector('.ssh-test-btn');
        this.saveButton = this.dialog.querySelector('.ssh-save-btn');
        this.cancelButton = this.dialog.querySelector('.ssh-cancel-btn');

        this.statusDiv = this.dialog.querySelector('.ssh-status');
        this.testStatusDiv = this.dialog.querySelector('.ssh-test-status');
    }

    /**
     * Set up event listeners
     */
    setupEventListeners() {
        // Close button
        const closeBtn = this.dialog.querySelector('.ssh-dialog-close');
        closeBtn.addEventListener('click', () => this.hide());

        // Cancel button
        this.cancelButton.addEventListener('click', () => this.hide());

        // Authentication method change
        this.authMethodSelect.addEventListener('change', () => {
            this.toggleAuthenticationMethod();
        });

        // Form validation
        const inputs = [this.nameInput, this.hostInput, this.portInput, this.usernameInput];
        inputs.forEach(input => {
            input.addEventListener('input', () => this.validateForm());
        });

        // Authentication inputs
        this.passwordInput.addEventListener('input', () => this.validateForm());
        this.privateKeyInput.addEventListener('input', () => this.validateForm());

        // Browse key button
        const browseKeyBtn = this.dialog.querySelector('.ssh-browse-key-btn');
        browseKeyBtn.addEventListener('click', () => this.browsePrivateKey());

        // Test connection
        this.testButton.addEventListener('click', () => this.testConnection());

        // Save connection
        this.saveButton.addEventListener('click', () => this.saveConnection());

        // Close on overlay click
        this.dialog.addEventListener('click', (e) => {
            if (e.target === this.dialog) {
                this.hide();
            }
        });

        // Close on Escape key
        document.addEventListener('keydown', this.handleKeyDown.bind(this));
    }

    /**
     * Handle keyboard events
     */
    handleKeyDown(e) {
        if (!this.isOpen) return;

        if (e.key === 'Escape') {
            this.hide();
        } else if (e.key === 'Enter' && e.ctrlKey) {
            if (this.saveButton && !this.saveButton.disabled) {
                this.saveConnection();
            }
        }
    }

    /**
     * Toggle authentication method UI
     */
    toggleAuthenticationMethod() {
        const method = this.authMethodSelect.value;
        const passwordSection = this.dialog.querySelector('.ssh-password-auth');
        const keySection = this.dialog.querySelector('.ssh-key-auth');

        if (method === 'password') {
            passwordSection.style.display = 'block';
            keySection.style.display = 'none';
            this.passwordInput.required = true;
            this.privateKeyInput.required = false;
        } else {
            passwordSection.style.display = 'none';
            keySection.style.display = 'block';
            this.passwordInput.required = false;
            this.privateKeyInput.required = true;
        }

        this.validateForm();
    }

    /**
     * Validate the form and enable/disable save button
     */
    validateForm() {
        const isValid = this.isFormValid();
        this.saveButton.disabled = !isValid;

        if (!isValid) {
            this.saveButton.title = 'Please fill in all required fields';
        } else {
            this.saveButton.title = '';
        }
    }

    /**
     * Check if form is valid
     */
    isFormValid() {
        // Basic required fields
        if (!this.nameInput.value.trim() ||
            !this.hostInput.value.trim() ||
            !this.usernameInput.value.trim() ||
            !this.portInput.value) {
            return false;
        }

        // Port validation
        const port = parseInt(this.portInput.value);
        if (port < 1 || port > 65535) {
            return false;
        }

        // Authentication validation
        const authMethod = this.authMethodSelect.value;
        if (authMethod === 'password') {
            return this.passwordInput.value.length > 0;
        } else {
            return this.privateKeyInput.value.trim().length > 0;
        }
    }

    /**
     * Browse for private key file
     */
    async browsePrivateKey() {
        try {
            const result = await window.electronAPI.selectFolder();
            if (!result.canceled && result.path) {
                this.privateKeyInput.value = result.path;
                this.validateForm();
            }
        } catch (error) {
            this.showStatus('Error browsing for key file: ' + error.message, 'error');
        }
    }

    /**
     * Test SSH connection
     */
    async testConnection() {
        if (!this.isFormValid()) {
            this.showTestStatus('Please fill in all required fields first', 'error');
            return;
        }

        this.testButton.disabled = true;
        this.testButton.textContent = 'Testing...';
        this.showTestStatus('Testing connection...', 'info');

        try {
            const config = this.getConnectionConfig();

            // Create temporary connection for testing
            const tempId = await window.sshService.createConnection({
                ...config,
                id: 'temp-test-' + Date.now()
            });

            // Try to connect
            await window.sshService.connect(tempId);

            // Test basic command
            await window.sshService.execCommand(tempId, 'echo "Connection test successful"');

            this.showTestStatus('✓ Connection successful!', 'success');

            // Clean up temporary connection
            await window.sshService.removeConnection(tempId);

        } catch (error) {
            this.showTestStatus('✗ Connection failed: ' + error.message, 'error');
            logger.error('ssh', 'Connection test failed:', error);
        } finally {
            this.testButton.disabled = false;
            this.testButton.textContent = 'Test Connection';
        }
    }

    /**
     * Save SSH connection
     */
    async saveConnection() {
        if (!this.isFormValid()) {
            this.showStatus('Please fill in all required fields', 'error');
            return;
        }

        this.saveButton.disabled = true;
        this.saveButton.textContent = this.editMode ? 'Updating...' : 'Saving...';

        try {
            const config = this.getConnectionConfig();

            let connectionId;
            if (this.editMode) {
                // Update existing connection
                await window.sshService.removeConnection(this.editConnectionId);
                connectionId = await window.sshService.createConnection({
                    ...config,
                    id: this.editConnectionId
                });
            } else {
                // Create new connection
                connectionId = await window.sshService.createConnection(config);
            }

            this.showStatus(`✓ Connection ${this.editMode ? 'updated' : 'saved'} successfully!`, 'success');

            // Emit event
            eventBus.emit('ssh:connectionSaved', {
                id: connectionId,
                config,
                isEdit: this.editMode
            });

            // Close dialog after short delay
            setTimeout(() => {
                this.hide();
            }, 1000);

        } catch (error) {
            this.showStatus('Error saving connection: ' + error.message, 'error');
            logger.error('ssh', 'Failed to save connection:', error);
        } finally {
            this.saveButton.disabled = false;
            this.saveButton.textContent = this.editMode ? 'Update' : 'Save';
        }
    }

    /**
     * Get connection configuration from form
     */
    getConnectionConfig() {
        const config = {
            name: this.nameInput.value.trim(),
            host: this.hostInput.value.trim(),
            port: parseInt(this.portInput.value),
            username: this.usernameInput.value.trim()
        };

        if (this.authMethodSelect.value === 'password') {
            config.password = this.passwordInput.value;
        } else {
            config.privateKeyPath = this.privateKeyInput.value.trim();
            if (this.passphraseInput.value) {
                config.passphrase = this.passphraseInput.value;
            }
        }

        return config;
    }

    /**
     * Populate form with existing connection data
     */
    populateForm(connectionData) {
        this.nameInput.value = connectionData.name || '';
        this.hostInput.value = connectionData.host || '';
        this.portInput.value = connectionData.port || 22;
        this.usernameInput.value = connectionData.username || '';

        if (connectionData.password) {
            this.authMethodSelect.value = 'password';
            this.passwordInput.value = connectionData.password;
        } else if (connectionData.privateKeyPath) {
            this.authMethodSelect.value = 'privateKey';
            this.privateKeyInput.value = connectionData.privateKeyPath;
            this.passphraseInput.value = connectionData.passphrase || '';
        }

        this.toggleAuthenticationMethod();
        this.validateForm();
    }

    /**
     * Show status message
     */
    showStatus(message, type = 'info') {
        this.statusDiv.textContent = message;
        this.statusDiv.className = `ssh-status ssh-status-${type}`;

        // Clear after 5 seconds for non-error messages
        if (type !== 'error') {
            setTimeout(() => {
                this.statusDiv.textContent = '';
                this.statusDiv.className = 'ssh-status';
            }, 5000);
        }
    }

    /**
     * Show test status message
     */
    showTestStatus(message, type = 'info') {
        this.testStatusDiv.textContent = message;
        this.testStatusDiv.className = `ssh-test-status ssh-status-${type}`;

        // Clear after 5 seconds
        setTimeout(() => {
            this.testStatusDiv.textContent = '';
            this.testStatusDiv.className = 'ssh-test-status';
        }, 5000);
    }

    /**
     * Add dialog styles
     */
    addDialogStyles() {
        if (document.getElementById('ssh-dialog-styles')) {
            return; // Styles already added
        }

        const style = document.createElement('style');
        style.id = 'ssh-dialog-styles';
        style.textContent = `
            .ssh-dialog-overlay {
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
            }

            .ssh-dialog {
                background: var(--color-bg-primary, #1e1e1e);
                border: 1px solid var(--color-border, #333);
                border-radius: 6px;
                width: 500px;
                max-width: 90vw;
                max-height: 90vh;
                overflow: hidden;
                box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
            }

            .ssh-dialog-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 16px 20px;
                border-bottom: 1px solid var(--color-border, #333);
                background: var(--color-bg-secondary, #252526);
            }

            .ssh-dialog-header h3 {
                margin: 0;
                color: var(--color-text-primary, #cccccc);
                font-size: 16px;
                font-weight: 600;
            }

            .ssh-dialog-close {
                background: none;
                border: none;
                color: var(--color-text-secondary, #cccccc);
                font-size: 24px;
                cursor: pointer;
                padding: 0;
                width: 32px;
                height: 32px;
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: 4px;
            }

            .ssh-dialog-close:hover {
                background: var(--color-bg-hover, #2a2d2e);
            }

            .ssh-dialog-content {
                padding: 20px;
                max-height: 60vh;
                overflow-y: auto;
            }

            .ssh-connection-form {
                display: flex;
                flex-direction: column;
                gap: 16px;
            }

            .ssh-form-row {
                display: flex;
                flex-direction: column;
                gap: 6px;
            }

            .ssh-form-row label {
                color: var(--color-text-primary, #cccccc);
                font-size: 14px;
                font-weight: 500;
            }

            .ssh-form-row input,
            .ssh-form-row select {
                background: var(--color-input-bg, #3c3c3c);
                border: 1px solid var(--color-input-border, #5a5a5a);
                color: var(--color-text-primary, #cccccc);
                padding: 8px 12px;
                border-radius: 4px;
                font-size: 14px;
            }

            .ssh-form-row input:focus,
            .ssh-form-row select:focus {
                outline: none;
                border-color: var(--color-accent, #007acc);
                box-shadow: 0 0 0 2px rgba(0, 122, 204, 0.3);
            }

            .ssh-input-with-button {
                display: flex;
                gap: 8px;
            }

            .ssh-input-with-button input {
                flex: 1;
            }

            .ssh-browse-key-btn {
                background: var(--color-button-secondary, #4a4a4a);
                border: 1px solid var(--color-border, #5a5a5a);
                color: var(--color-text-primary, #cccccc);
                padding: 8px 12px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 14px;
            }

            .ssh-browse-key-btn:hover {
                background: var(--color-button-secondary-hover, #5a5a5a);
            }

            .ssh-auth-section {
                border-left: 3px solid var(--color-accent, #007acc);
                padding-left: 16px;
                margin-left: 8px;
            }

            .ssh-status-section {
                margin-top: 16px;
            }

            .ssh-status,
            .ssh-test-status {
                padding: 8px 12px;
                border-radius: 4px;
                font-size: 14px;
                margin-bottom: 8px;
            }

            .ssh-status-info,
            .ssh-test-status-info {
                background: rgba(0, 122, 204, 0.1);
                color: #007acc;
                border: 1px solid rgba(0, 122, 204, 0.3);
            }

            .ssh-status-success,
            .ssh-test-status-success {
                background: rgba(0, 150, 0, 0.1);
                color: #00aa00;
                border: 1px solid rgba(0, 150, 0, 0.3);
            }

            .ssh-status-error,
            .ssh-test-status-error {
                background: rgba(200, 0, 0, 0.1);
                color: #ff6b6b;
                border: 1px solid rgba(200, 0, 0, 0.3);
            }

            .ssh-dialog-footer {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 16px 20px;
                border-top: 1px solid var(--color-border, #333);
                background: var(--color-bg-secondary, #252526);
            }

            .ssh-test-btn {
                background: var(--color-button-secondary, #4a4a4a);
                border: 1px solid var(--color-border, #5a5a5a);
                color: var(--color-text-primary, #cccccc);
                padding: 8px 16px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 14px;
            }

            .ssh-test-btn:hover:not(:disabled) {
                background: var(--color-button-secondary-hover, #5a5a5a);
            }

            .ssh-test-btn:disabled {
                opacity: 0.6;
                cursor: not-allowed;
            }

            .ssh-dialog-actions {
                display: flex;
                gap: 12px;
            }

            .ssh-cancel-btn,
            .ssh-save-btn {
                padding: 8px 16px;
                border-radius: 4px;
                font-size: 14px;
                cursor: pointer;
                border: 1px solid transparent;
            }

            .ssh-cancel-btn {
                background: var(--color-button-secondary, #4a4a4a);
                border-color: var(--color-border, #5a5a5a);
                color: var(--color-text-primary, #cccccc);
            }

            .ssh-cancel-btn:hover {
                background: var(--color-button-secondary-hover, #5a5a5a);
            }

            .ssh-save-btn {
                background: var(--color-accent, #007acc);
                border-color: var(--color-accent, #007acc);
                color: white;
            }

            .ssh-save-btn:hover:not(:disabled) {
                background: var(--color-accent-hover, #005a9e);
            }

            .ssh-save-btn:disabled {
                opacity: 0.6;
                cursor: not-allowed;
            }
        `;
        document.head.appendChild(style);
    }

    /**
     * Clean up event listeners
     */
    destroy() {
        if (this.isOpen) {
            this.hide();
        }
        document.removeEventListener('keydown', this.handleKeyDown.bind(this));
    }
}

module.exports = SSHConnectionDialog;
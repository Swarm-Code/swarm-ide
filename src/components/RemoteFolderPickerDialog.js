/**
 * RemoteFolderPickerDialog - SSH remote folder browser
 *
 * Allows users to browse directories on a remote SSH server using SFTP.
 * Used for workspace creation and SSH connection workflows.
 *
 * Features:
 * - Breadcrumb navigation
 * - Directory listing via SFTP
 * - Navigate up/down directory tree
 * - Select folder for workspace
 *
 * Usage:
 *   const picker = new RemoteFolderPickerDialog(connectionId);
 *   const remotePath = await picker.show();
 */

const eventBus = require('../modules/EventBus');
const logger = require('../utils/Logger');

class RemoteFolderPickerDialog {
    constructor(connectionId, initialPath = '/') {
        this.connectionId = connectionId;
        this.currentPath = initialPath;
        this.dialog = null;
        this.isOpen = false;
        this.resolveCallback = null;
        this.rejectCallback = null;

        // DOM elements
        this.breadcrumbsContainer = null;
        this.directoriesContainer = null;
        this.selectButton = null;
        this.cancelButton = null;
        this.currentPathDisplay = null;
        this.loadingIndicator = null;

        logger.debug('remoteFolderPicker', `Initialized for connection: ${connectionId}`);
    }

    /**
     * Show the dialog and return a promise with the selected path
     * @returns {Promise<string|null>} Selected remote path or null if cancelled
     */
    show() {
        if (this.isOpen) {
            logger.warn('remoteFolderPicker', 'Dialog already open');
            return Promise.reject(new Error('Dialog already open'));
        }

        return new Promise((resolve, reject) => {
            this.resolveCallback = resolve;
            this.rejectCallback = reject;

            this.createDialog();
            this.setupEventListeners();
            this.loadDirectory(this.currentPath);

            document.body.appendChild(this.dialog);
            this.isOpen = true;

            logger.debug('remoteFolderPicker', 'Dialog shown');
        });
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

        logger.debug('remoteFolderPicker', 'Dialog hidden');
    }

    /**
     * Create the dialog DOM structure
     */
    createDialog() {
        this.dialog = document.createElement('div');
        this.dialog.className = 'remote-folder-picker-overlay';

        this.dialog.innerHTML = `
            <div class="remote-folder-picker">
                <div class="remote-folder-picker-header">
                    <h3>Select Remote Folder</h3>
                    <button type="button" class="remote-folder-picker-close" aria-label="Close">&times;</button>
                </div>

                <div class="remote-folder-picker-content">
                    <!-- Current path display -->
                    <div class="remote-folder-picker-path">
                        <span class="path-label">Current Path:</span>
                        <span class="path-value">/</span>
                    </div>

                    <!-- Breadcrumbs navigation -->
                    <div class="remote-folder-picker-breadcrumbs">
                        <span class="breadcrumb-item" data-path="/">🏠 Root</span>
                    </div>

                    <!-- Loading indicator -->
                    <div class="remote-folder-picker-loading" style="display: none;">
                        <div class="loading-spinner"></div>
                        <span>Loading directories...</span>
                    </div>

                    <!-- Directories list -->
                    <div class="remote-folder-picker-directories">
                        <!-- Populated dynamically -->
                    </div>

                    <!-- Error display -->
                    <div class="remote-folder-picker-error" style="display: none;">
                        <span class="error-icon">⚠️</span>
                        <span class="error-message"></span>
                    </div>
                </div>

                <div class="remote-folder-picker-footer">
                    <button class="btn-cancel">Cancel</button>
                    <button class="btn-select">Select This Folder</button>
                </div>
            </div>
        `;

        // Cache DOM elements
        this.breadcrumbsContainer = this.dialog.querySelector('.remote-folder-picker-breadcrumbs');
        this.directoriesContainer = this.dialog.querySelector('.remote-folder-picker-directories');
        this.selectButton = this.dialog.querySelector('.btn-select');
        this.cancelButton = this.dialog.querySelector('.btn-cancel');
        this.currentPathDisplay = this.dialog.querySelector('.path-value');
        this.loadingIndicator = this.dialog.querySelector('.remote-folder-picker-loading');
        this.errorDisplay = this.dialog.querySelector('.remote-folder-picker-error');
        this.errorMessage = this.dialog.querySelector('.error-message');
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Close button
        const closeBtn = this.dialog.querySelector('.remote-folder-picker-close');
        closeBtn.addEventListener('click', () => this.handleCancel());

        // Cancel button
        this.cancelButton.addEventListener('click', () => this.handleCancel());

        // Select button
        this.selectButton.addEventListener('click', () => this.handleSelect());

        // Breadcrumb clicks (delegated)
        this.breadcrumbsContainer.addEventListener('click', (e) => {
            const breadcrumbItem = e.target.closest('.breadcrumb-item');
            if (breadcrumbItem) {
                const path = breadcrumbItem.dataset.path;
                this.loadDirectory(path);
            }
        });

        // Directory clicks (delegated)
        this.directoriesContainer.addEventListener('click', (e) => {
            const dirItem = e.target.closest('.directory-item');
            if (dirItem) {
                const dirPath = dirItem.dataset.path;
                this.loadDirectory(dirPath);
            }
        });
    }

    /**
     * Load directory contents from SSH server
     * @param {string} path - Remote directory path
     */
    async loadDirectory(path) {
        logger.debug('remoteFolderPicker', `Loading directory: ${path}`);

        this.currentPath = path;
        this.currentPathDisplay.textContent = path;

        // Show loading indicator
        this.showLoading(true);
        this.hideError();

        try {
            // Get SSH service
            const sshService = require('../services/SSHService');

            // List directory contents
            const entries = await sshService.listDirectory(this.connectionId, path, false);

            // Filter to only directories
            const directories = entries.filter(entry => entry.isDirectory && entry.name !== '.' && entry.name !== '..');

            // Sort directories alphabetically
            directories.sort((a, b) => a.name.localeCompare(b.name));

            // Render directories
            this.renderDirectories(directories);

            // Update breadcrumbs
            this.updateBreadcrumbs(path);

            logger.debug('remoteFolderPicker', `Loaded ${directories.length} directories`);

        } catch (error) {
            logger.error('remoteFolderPicker', `Failed to load directory: ${error.message}`);
            this.showError(`Failed to load directory: ${error.message}`);
        } finally {
            this.showLoading(false);
        }
    }

    /**
     * Render directories in the list
     * @param {Array} directories - Directory entries
     */
    renderDirectories(directories) {
        this.directoriesContainer.innerHTML = '';

        // Add "Parent Directory" option if not at root
        if (this.currentPath !== '/') {
            const parentPath = this.getParentPath(this.currentPath);
            const parentItem = document.createElement('div');
            parentItem.className = 'directory-item parent-directory';
            parentItem.dataset.path = parentPath;
            parentItem.innerHTML = `
                <span class="directory-icon">📁</span>
                <span class="directory-name">..</span>
                <span class="directory-hint">(Parent Directory)</span>
            `;
            this.directoriesContainer.appendChild(parentItem);
        }

        // Add directory items
        if (directories.length === 0) {
            const emptyMessage = document.createElement('div');
            emptyMessage.className = 'directory-empty-message';
            emptyMessage.textContent = 'No subdirectories found';
            this.directoriesContainer.appendChild(emptyMessage);
        } else {
            directories.forEach(dir => {
                const dirItem = document.createElement('div');
                dirItem.className = 'directory-item';
                dirItem.dataset.path = dir.path;
                dirItem.innerHTML = `
                    <span class="directory-icon">📁</span>
                    <span class="directory-name">${this.escapeHtml(dir.name)}</span>
                `;
                this.directoriesContainer.appendChild(dirItem);
            });
        }
    }

    /**
     * Update breadcrumbs navigation
     * @param {string} path - Current path
     */
    updateBreadcrumbs(path) {
        this.breadcrumbsContainer.innerHTML = '';

        // Split path into parts
        const parts = path.split('/').filter(Boolean);

        // Add root breadcrumb
        const rootCrumb = document.createElement('span');
        rootCrumb.className = 'breadcrumb-item';
        rootCrumb.dataset.path = '/';
        rootCrumb.innerHTML = '🏠';
        rootCrumb.title = 'Root';
        this.breadcrumbsContainer.appendChild(rootCrumb);

        // Add path parts
        let currentPath = '';
        parts.forEach((part, index) => {
            currentPath += '/' + part;

            // Add separator
            const separator = document.createElement('span');
            separator.className = 'breadcrumb-separator';
            separator.textContent = '/';
            this.breadcrumbsContainer.appendChild(separator);

            // Add breadcrumb
            const crumb = document.createElement('span');
            crumb.className = 'breadcrumb-item';
            if (index === parts.length - 1) {
                crumb.classList.add('active');
            }
            crumb.dataset.path = currentPath;
            crumb.textContent = part;
            this.breadcrumbsContainer.appendChild(crumb);
        });
    }

    /**
     * Get parent directory path
     * @param {string} path - Current path
     * @returns {string} Parent path
     */
    getParentPath(path) {
        if (path === '/' || path === '') {
            return '/';
        }
        const parts = path.split('/').filter(Boolean);
        parts.pop();
        return '/' + parts.join('/');
    }

    /**
     * Show/hide loading indicator
     * @param {boolean} show - Show or hide
     */
    showLoading(show) {
        this.loadingIndicator.style.display = show ? 'flex' : 'none';
        this.directoriesContainer.style.display = show ? 'none' : 'block';
    }

    /**
     * Show error message
     * @param {string} message - Error message
     */
    showError(message) {
        this.errorMessage.textContent = message;
        this.errorDisplay.style.display = 'flex';
    }

    /**
     * Hide error message
     */
    hideError() {
        this.errorDisplay.style.display = 'none';
    }

    /**
     * Handle select button click
     */
    handleSelect() {
        logger.debug('remoteFolderPicker', `Selected path: ${this.currentPath}`);
        this.hide();
        if (this.resolveCallback) {
            this.resolveCallback(this.currentPath);
        }
    }

    /**
     * Handle cancel button click
     */
    handleCancel() {
        logger.debug('remoteFolderPicker', 'Cancelled');
        this.hide();
        if (this.resolveCallback) {
            this.resolveCallback(null);
        }
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

module.exports = RemoteFolderPickerDialog;

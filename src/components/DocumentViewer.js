/**
 * DocumentViewer - Component for Office documents
 *
 * Provides document viewing with:
 * - Document metadata display
 * - Download functionality
 * - Open with system default application
 * - SSH file support with caching
 *
 * Supports:
 * - Microsoft Word (.doc, .docx)
 * - Microsoft Excel (.xls, .xlsx)
 * - Microsoft PowerPoint (.ppt, .pptx)
 * - OpenDocument formats (.odt, .ods, .odp)
 *
 * Usage:
 *   const viewer = new DocumentViewer(container, docPath, sshContext);
 */

const eventBus = require('../modules/EventBus');
const sshMediaCache = require('../services/SSHMediaCache');

class DocumentViewer {
    constructor(container, docPath, sshContext = null) {
        this.container = container;
        this.docPath = docPath;
        this.sshContext = sshContext;
        this.localDocPath = null;
        this.isSSH = false;
        this.fileSize = 0;
        this.fileType = this.getDocumentType();

        this.init();
    }

    /**
     * Initialize the document viewer
     */
    async init() {
        try {
            console.log('[DocumentViewer] Initializing for:', this.docPath);

            // Check if this is an SSH file
            this.isSSH = this.docPath.startsWith('ssh://') || (this.sshContext && this.sshContext.isSSH);

            if (this.isSSH) {
                // Download SSH file to cache
                await this.downloadSSHDocument();
            } else {
                // Local file - use directly
                this.localDocPath = this.docPath;
                await this.getFileSize();
            }

            this.render();
            this.setupEventListeners();
        } catch (error) {
            console.error('[DocumentViewer] Initialization error:', error);
            this.renderError(error.message);
        }
    }

    /**
     * Download SSH document to cache
     */
    async downloadSSHDocument() {
        try {
            // Show loading state
            this.renderLoading();

            if (!this.sshContext) {
                throw new Error('SSH context required for SSH file');
            }

            const { connectionId, remotePath } = this.parseSSHPath();

            console.log('[DocumentViewer] Downloading SSH document:', { connectionId, remotePath });

            // Initialize cache if needed
            if (!sshMediaCache.isInitialized()) {
                await sshMediaCache.initialize(window.electronAPI);
            }

            // Download file to cache
            this.localDocPath = await sshMediaCache.getCachedFile(
                connectionId,
                remotePath,
                (progress) => {
                    // Update progress
                    this.updateLoadingProgress(progress);
                    if (progress.transferred && progress.total) {
                        this.fileSize = progress.total;
                    }
                }
            );

            console.log('[DocumentViewer] Document cached at:', this.localDocPath);

        } catch (error) {
            console.error('[DocumentViewer] Error downloading SSH document:', error);
            throw new Error(`Failed to download document: ${error.message}`);
        }
    }

    /**
     * Get file size for local files
     */
    async getFileSize() {
        try {
            if (this.localDocPath && window.electronAPI) {
                const stats = await window.electronAPI.invoke('ssh-stat-file', null, this.localDocPath);
                if (stats.success && stats.stats) {
                    this.fileSize = stats.stats.size;
                }
            }
        } catch (error) {
            console.warn('[DocumentViewer] Could not get file size:', error);
        }
    }

    /**
     * Parse SSH path to get connection ID and remote path
     */
    parseSSHPath() {
        let connectionId, remotePath;

        if (this.sshContext) {
            connectionId = this.sshContext.connectionId;
            // Remove ssh:// prefix and host from path if present
            if (this.docPath.startsWith('ssh://')) {
                const host = this.sshContext.connectionConfig?.host;
                const sshPrefix = `ssh://${host}`;
                remotePath = this.docPath.startsWith(sshPrefix)
                    ? this.docPath.substring(sshPrefix.length)
                    : this.docPath.substring(6); // Remove 'ssh://'
            } else {
                remotePath = this.docPath;
            }
        } else {
            throw new Error('Cannot parse SSH path without SSH context');
        }

        return { connectionId, remotePath };
    }

    /**
     * Get document type based on extension
     * @returns {Object} Document type info
     */
    getDocumentType() {
        const fileName = this.docPath.split('/').pop().toLowerCase();
        const ext = fileName.split('.').pop();

        const types = {
            // Word
            doc: { name: 'Microsoft Word Document', icon: '📄', color: '#2B579A' },
            docx: { name: 'Microsoft Word Document', icon: '📄', color: '#2B579A' },
            odt: { name: 'OpenDocument Text', icon: '📄', color: '#0E7ECC' },

            // Excel
            xls: { name: 'Microsoft Excel Spreadsheet', icon: '📊', color: '#217346' },
            xlsx: { name: 'Microsoft Excel Spreadsheet', icon: '📊', color: '#217346' },
            ods: { name: 'OpenDocument Spreadsheet', icon: '📊', color: '#0E7ECC' },
            csv: { name: 'CSV Spreadsheet', icon: '📊', color: '#217346' },

            // PowerPoint
            ppt: { name: 'Microsoft PowerPoint Presentation', icon: '📊', color: '#D24726' },
            pptx: { name: 'Microsoft PowerPoint Presentation', icon: '📊', color: '#D24726' },
            odp: { name: 'OpenDocument Presentation', icon: '📊', color: '#0E7ECC' },

            // Other
            default: { name: 'Document', icon: '📄', color: '#666666' }
        };

        return types[ext] || types.default;
    }

    /**
     * Format file size
     * @param {number} bytes - Size in bytes
     * @returns {string} Formatted size
     */
    formatFileSize(bytes) {
        if (bytes === 0) return 'Unknown size';

        const units = ['B', 'KB', 'MB', 'GB'];
        const k = 1024;
        const i = Math.floor(Math.log(bytes) / Math.log(k));

        return `${(bytes / Math.pow(k, i)).toFixed(2)} ${units[i]}`;
    }

    /**
     * Render loading state
     */
    renderLoading() {
        this.container.innerHTML = `
            <div class="doc-loading">
                <div class="doc-loading-spinner"></div>
                <h3>Loading Document...</h3>
                <p>Downloading from SSH server</p>
                <div class="doc-loading-progress">
                    <div class="doc-loading-progress-bar" style="width: 0%"></div>
                </div>
            </div>
        `;
    }

    /**
     * Update loading progress
     * @param {Object} progress - Progress info
     */
    updateLoadingProgress(progress) {
        const progressBar = this.container.querySelector('.doc-loading-progress-bar');
        if (progressBar && progress.percent) {
            progressBar.style.width = `${progress.percent}%`;
        }
    }

    /**
     * Render the document viewer
     */
    render() {
        const fileName = this.getFileName();
        const fileSize = this.formatFileSize(this.fileSize);

        this.container.innerHTML = `
            <div class="doc-viewer">
                <!-- Document Info Card -->
                <div class="doc-card">
                    <div class="doc-icon" style="color: ${this.fileType.color}">
                        ${this.fileType.icon}
                    </div>
                    <div class="doc-info">
                        <h2 class="doc-title">${this.escapeHtml(fileName)}</h2>
                        <p class="doc-type">${this.fileType.name}</p>
                        <p class="doc-size">${fileSize}</p>
                    </div>
                </div>

                <!-- Message -->
                <div class="doc-message">
                    <h3>Document Preview Not Available</h3>
                    <p>
                        Office documents require specialized software to view.
                        You can download the document or open it with your system's default application.
                    </p>
                </div>

                <!-- Actions -->
                <div class="doc-actions">
                    <button class="doc-btn doc-btn-primary" id="download-btn" title="Download Document">
                        <span>💾</span>
                        <span>Download</span>
                    </button>
                    <button class="doc-btn doc-btn-secondary" id="open-btn" title="Open with System Default">
                        <span>🚀</span>
                        <span>Open with Default App</span>
                    </button>
                </div>

                <!-- Additional Info -->
                <div class="doc-details">
                    <h4>Supported Actions:</h4>
                    <ul>
                        <li><strong>Download:</strong> Save the document to your local machine</li>
                        <li><strong>Open with Default App:</strong> Open the document with Microsoft Office, LibreOffice, or your system's default application</li>
                    </ul>
                </div>
            </div>
        `;
    }

    /**
     * Get file name from path
     * @returns {string} File name
     */
    getFileName() {
        const path = this.docPath || this.localDocPath || '';
        return path.split('/').pop() || 'document';
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Download button
        this.container.querySelector('#download-btn')?.addEventListener('click', () => {
            this.download();
        });

        // Open with default app button
        this.container.querySelector('#open-btn')?.addEventListener('click', () => {
            this.openWithDefaultApp();
        });
    }

    /**
     * Download document
     */
    async download() {
        if (this.localDocPath) {
            try {
                // Use Electron's shell to show save dialog
                if (window.electronAPI && window.electronAPI.invoke) {
                    const { dialog, shell } = require('electron').remote || require('@electron/remote');

                    // For now, just open the file location
                    const path = require('path');
                    const dir = path.dirname(this.localDocPath);

                    await window.electronAPI.invoke('shell-show-item-in-folder', this.localDocPath);
                } else {
                    // Fallback: create download link
                    const link = document.createElement('a');
                    link.href = `file://${this.localDocPath}`;
                    link.download = this.getFileName();
                    link.click();
                }
            } catch (error) {
                console.error('[DocumentViewer] Download error:', error);
                this.showNotification('Download failed. Please try again.', 'error');
            }
        }
    }

    /**
     * Open with default application
     */
    async openWithDefaultApp() {
        if (this.localDocPath) {
            try {
                // Use Electron's shell.openPath to open with default app
                if (window.electronAPI && window.electronAPI.invoke) {
                    const result = await window.electronAPI.invoke('shell-open-path', this.localDocPath);

                    if (result && result.error) {
                        throw new Error(result.error);
                    }

                    this.showNotification('Opening document...', 'success');
                } else {
                    throw new Error('Cannot open document: Electron API not available');
                }
            } catch (error) {
                console.error('[DocumentViewer] Open error:', error);
                this.showNotification('Failed to open document. Please download it manually.', 'error');
            }
        }
    }

    /**
     * Show notification message
     * @param {string} message - Message text
     * @param {string} type - Notification type (success, error, info)
     */
    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `doc-notification doc-notification-${type}`;
        notification.textContent = message;

        this.container.appendChild(notification);

        setTimeout(() => {
            notification.remove();
        }, 3000);
    }

    /**
     * Render error state
     * @param {string} message - Error message
     */
    renderError(message) {
        this.container.innerHTML = `
            <div class="doc-error">
                <div class="doc-error-icon">⚠️</div>
                <h3>Document Load Error</h3>
                <p>${this.escapeHtml(message)}</p>
            </div>
        `;
    }

    /**
     * Escape HTML
     * @param {string} text - Text to escape
     * @returns {string} Escaped text
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Cleanup
     */
    destroy() {
        // Clear container
        this.container.innerHTML = '';
    }
}

module.exports = DocumentViewer;

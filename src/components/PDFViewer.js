/**
 * PDFViewer - Component for displaying PDF documents
 *
 * Provides PDF viewing with:
 * - Page navigation (prev/next, jump to page)
 * - Zoom controls
 * - Page rotation
 * - Page number display
 * - SSH file support with caching
 *
 * Usage:
 *   const viewer = new PDFViewer(container, pdfPath, sshContext);
 */

const eventBus = require('../modules/EventBus');
const sshMediaCache = require('../services/SSHMediaCache');

class PDFViewer {
    constructor(container, pdfPath, sshContext = null) {
        this.container = container;
        this.pdfPath = pdfPath;
        this.sshContext = sshContext;
        this.localPDFPath = null;
        this.isSSH = false;
        this.currentPage = 1;
        this.totalPages = 0;
        this.zoom = 1.0;
        this.rotation = 0;

        this.init();
    }

    /**
     * Initialize the PDF viewer
     */
    async init() {
        try {
            console.log('[PDFViewer] Initializing for:', this.pdfPath);

            // Check if this is an SSH file
            this.isSSH = this.pdfPath.startsWith('ssh://') || (this.sshContext && this.sshContext.isSSH);

            if (this.isSSH) {
                // Download SSH file to cache
                await this.downloadSSHPDF();
            } else {
                // Local file - use directly
                this.localPDFPath = this.pdfPath;
            }

            this.render();
            this.setupEventListeners();
        } catch (error) {
            console.error('[PDFViewer] Initialization error:', error);
            this.renderError(error.message);
        }
    }

    /**
     * Download SSH PDF to cache
     */
    async downloadSSHPDF() {
        try {
            // Show loading state
            this.renderLoading();

            if (!this.sshContext) {
                throw new Error('SSH context required for SSH file');
            }

            const { connectionId, remotePath } = this.parseSSHPath();

            console.log('[PDFViewer] Downloading SSH PDF:', { connectionId, remotePath });

            // Initialize cache if needed
            if (!sshMediaCache.isInitialized()) {
                await sshMediaCache.initialize(window.electronAPI);
            }

            // Download file to cache
            this.localPDFPath = await sshMediaCache.getCachedFile(
                connectionId,
                remotePath,
                (progress) => {
                    // Update progress
                    this.updateLoadingProgress(progress);
                }
            );

            console.log('[PDFViewer] PDF cached at:', this.localPDFPath);

        } catch (error) {
            console.error('[PDFViewer] Error downloading SSH PDF:', error);
            throw new Error(`Failed to download PDF: ${error.message}`);
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
            if (this.pdfPath.startsWith('ssh://')) {
                const host = this.sshContext.connectionConfig?.host;
                const sshPrefix = `ssh://${host}`;
                remotePath = this.pdfPath.startsWith(sshPrefix)
                    ? this.pdfPath.substring(sshPrefix.length)
                    : this.pdfPath.substring(6); // Remove 'ssh://'
            } else {
                remotePath = this.pdfPath;
            }
        } else {
            throw new Error('Cannot parse SSH path without SSH context');
        }

        return { connectionId, remotePath };
    }

    /**
     * Render loading state
     */
    renderLoading() {
        this.container.innerHTML = `
            <div class="pdf-loading">
                <div class="pdf-loading-spinner"></div>
                <h3>Loading PDF...</h3>
                <p>Downloading from SSH server</p>
                <div class="pdf-loading-progress">
                    <div class="pdf-loading-progress-bar" style="width: 0%"></div>
                </div>
            </div>
        `;
    }

    /**
     * Update loading progress
     * @param {Object} progress - Progress info
     */
    updateLoadingProgress(progress) {
        const progressBar = this.container.querySelector('.pdf-loading-progress-bar');
        if (progressBar && progress.percent) {
            progressBar.style.width = `${progress.percent}%`;
        }
    }

    /**
     * Render the PDF viewer
     */
    render() {
        // Use file:// protocol for local files (including cached SSH files)
        const pdfSrc = `file://${this.localPDFPath}`;

        this.container.innerHTML = `
            <div class="pdf-viewer">
                <!-- Controls -->
                <div class="pdf-controls">
                    <div class="pdf-controls-left">
                        <button class="pdf-btn" id="first-page" title="First Page">
                            <span>⏮</span>
                        </button>
                        <button class="pdf-btn" id="prev-page" title="Previous Page (←)">
                            <span>◀</span>
                        </button>
                        <span class="pdf-page-info">
                            <input type="number" id="page-input" class="pdf-page-input"
                                   value="1" min="1" title="Current Page">
                            <span id="page-total">/ 1</span>
                        </span>
                        <button class="pdf-btn" id="next-page" title="Next Page (→)">
                            <span>▶</span>
                        </button>
                        <button class="pdf-btn" id="last-page" title="Last Page">
                            <span>⏭</span>
                        </button>
                    </div>

                    <div class="pdf-controls-center">
                        <button class="pdf-btn" id="zoom-out" title="Zoom Out (-)">
                            <span>🔍−</span>
                        </button>
                        <span class="pdf-zoom-display" id="zoom-display">100%</span>
                        <button class="pdf-btn" id="zoom-in" title="Zoom In (+)">
                            <span>🔍+</span>
                        </button>
                        <button class="pdf-btn" id="fit-width" title="Fit to Width (W)">
                            <span>↔</span>
                        </button>
                        <button class="pdf-btn" id="fit-page" title="Fit to Page (P)">
                            <span>⛶</span>
                        </button>
                    </div>

                    <div class="pdf-controls-right">
                        <button class="pdf-btn" id="rotate-left" title="Rotate Left">
                            <span>↺</span>
                        </button>
                        <button class="pdf-btn" id="rotate-right" title="Rotate Right">
                            <span>↻</span>
                        </button>
                        <button class="pdf-btn" id="download" title="Download PDF">
                            <span>💾</span>
                        </button>
                    </div>
                </div>

                <!-- PDF Container -->
                <div class="pdf-container" id="pdf-container">
                    <iframe
                        id="pdf-iframe"
                        class="pdf-iframe"
                        src="${pdfSrc}"
                        type="application/pdf"
                        frameborder="0"
                        scrolling="auto"
                        style="transform: scale(${this.zoom}) rotate(${this.rotation}deg);">
                    </iframe>
                    <div class="pdf-fallback" style="display: none;">
                        <p>Your browser does not support inline PDF viewing.</p>
                        <a href="${pdfSrc}" download class="pdf-download-link">
                            Download PDF to view it
                        </a>
                    </div>
                </div>
            </div>
        `;

        // Check if iframe loaded successfully
        const iframe = this.container.querySelector('#pdf-iframe');
        iframe.addEventListener('error', () => {
            this.showFallback();
        });
    }

    /**
     * Show fallback download option
     */
    showFallback() {
        const iframe = this.container.querySelector('#pdf-iframe');
        const fallback = this.container.querySelector('.pdf-fallback');

        if (iframe && fallback) {
            iframe.style.display = 'none';
            fallback.style.display = 'block';
        }
    }

    /**
     * Get file name from path
     * @returns {string} File name
     */
    getFileName() {
        const path = this.pdfPath || this.localPDFPath || '';
        return path.split('/').pop() || 'document.pdf';
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Page navigation
        this.container.querySelector('#first-page')?.addEventListener('click', () => {
            this.goToPage(1);
        });

        this.container.querySelector('#prev-page')?.addEventListener('click', () => {
            this.previousPage();
        });

        this.container.querySelector('#next-page')?.addEventListener('click', () => {
            this.nextPage();
        });

        this.container.querySelector('#last-page')?.addEventListener('click', () => {
            this.goToPage(this.totalPages);
        });

        // Page input
        const pageInput = this.container.querySelector('#page-input');
        pageInput?.addEventListener('change', (e) => {
            const pageNum = parseInt(e.target.value);
            if (pageNum >= 1 && pageNum <= this.totalPages) {
                this.goToPage(pageNum);
            } else {
                e.target.value = this.currentPage;
            }
        });

        // Zoom controls
        this.container.querySelector('#zoom-in')?.addEventListener('click', () => {
            this.zoomIn();
        });

        this.container.querySelector('#zoom-out')?.addEventListener('click', () => {
            this.zoomOut();
        });

        this.container.querySelector('#fit-width')?.addEventListener('click', () => {
            this.fitToWidth();
        });

        this.container.querySelector('#fit-page')?.addEventListener('click', () => {
            this.fitToPage();
        });

        // Rotation controls
        this.container.querySelector('#rotate-left')?.addEventListener('click', () => {
            this.rotate(-90);
        });

        this.container.querySelector('#rotate-right')?.addEventListener('click', () => {
            this.rotate(90);
        });

        // Download button
        this.container.querySelector('#download')?.addEventListener('click', () => {
            this.download();
        });

        // Keyboard shortcuts
        this.keyHandler = (e) => {
            // Don't interfere with other input elements
            if (e.target.tagName === 'INPUT') {
                return;
            }

            switch (e.key) {
                case 'ArrowLeft':
                    e.preventDefault();
                    this.previousPage();
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    this.nextPage();
                    break;
                case '+':
                case '=':
                    e.preventDefault();
                    this.zoomIn();
                    break;
                case '-':
                case '_':
                    e.preventDefault();
                    this.zoomOut();
                    break;
                case 'w':
                case 'W':
                    e.preventDefault();
                    this.fitToWidth();
                    break;
                case 'p':
                case 'P':
                    e.preventDefault();
                    this.fitToPage();
                    break;
            }
        };

        document.addEventListener('keydown', this.keyHandler);
    }

    /**
     * Go to specific page
     * @param {number} pageNum - Page number
     */
    goToPage(pageNum) {
        if (pageNum >= 1 && pageNum <= this.totalPages) {
            this.currentPage = pageNum;
            this.updatePageDisplay();
            // Note: Actual page navigation would require PDF.js integration
            // For now, this is a placeholder
        }
    }

    /**
     * Go to next page
     */
    nextPage() {
        if (this.currentPage < this.totalPages) {
            this.goToPage(this.currentPage + 1);
        }
    }

    /**
     * Go to previous page
     */
    previousPage() {
        if (this.currentPage > 1) {
            this.goToPage(this.currentPage - 1);
        }
    }

    /**
     * Zoom in
     */
    zoomIn() {
        this.setZoom(this.zoom * 1.2);
    }

    /**
     * Zoom out
     */
    zoomOut() {
        this.setZoom(this.zoom / 1.2);
    }

    /**
     * Set zoom level
     * @param {number} newZoom - New zoom level
     */
    setZoom(newZoom) {
        this.zoom = Math.max(0.1, Math.min(5, newZoom));
        this.updateTransform();
        this.updateZoomDisplay();
    }

    /**
     * Fit to width
     */
    fitToWidth() {
        // Placeholder - would need container width calculation
        this.setZoom(1.0);
    }

    /**
     * Fit to page
     */
    fitToPage() {
        // Placeholder - would need page/container size calculation
        this.setZoom(0.8);
    }

    /**
     * Rotate PDF
     * @param {number} degrees - Rotation in degrees
     */
    rotate(degrees) {
        this.rotation = (this.rotation + degrees) % 360;
        this.updateTransform();
    }

    /**
     * Update transform (zoom and rotation)
     */
    updateTransform() {
        const iframe = this.container.querySelector('#pdf-iframe');
        if (iframe) {
            iframe.style.transform = `scale(${this.zoom}) rotate(${this.rotation}deg)`;
        }
    }

    /**
     * Update zoom display
     */
    updateZoomDisplay() {
        const zoomDisplay = this.container.querySelector('#zoom-display');
        if (zoomDisplay) {
            zoomDisplay.textContent = `${Math.round(this.zoom * 100)}%`;
        }
    }

    /**
     * Update page display
     */
    updatePageDisplay() {
        const pageInput = this.container.querySelector('#page-input');
        if (pageInput) {
            pageInput.value = this.currentPage;
        }
    }

    /**
     * Download PDF
     */
    download() {
        if (this.localPDFPath) {
            const link = document.createElement('a');
            link.href = `file://${this.localPDFPath}`;
            link.download = this.getFileName();
            link.click();
        }
    }

    /**
     * Render error state
     * @param {string} message - Error message
     */
    renderError(message) {
        this.container.innerHTML = `
            <div class="pdf-error">
                <div class="pdf-error-icon">⚠️</div>
                <h3>PDF Load Error</h3>
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
        // Remove keyboard shortcuts
        if (this.keyHandler) {
            document.removeEventListener('keydown', this.keyHandler);
        }

        // Clear container
        this.container.innerHTML = '';
    }
}

module.exports = PDFViewer;

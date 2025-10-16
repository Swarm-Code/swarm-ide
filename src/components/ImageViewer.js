/**
 * ImageViewer - Component for displaying images
 *
 * Provides image viewing with:
 * - Zoom in/out controls
 * - Pan/drag functionality
 * - Fit to screen / actual size modes
 * - Image metadata display
 * - SSH file support with caching
 *
 * Usage:
 *   const viewer = new ImageViewer(container, imagePath, sshContext);
 */

const eventBus = require('../modules/EventBus');
const sshMediaCache = require('../services/SSHMediaCache');

class ImageViewer {
    constructor(container, imagePath, sshContext = null) {
        this.container = container;
        this.imagePath = imagePath;
        this.sshContext = sshContext;
        this.scale = 1;
        this.minScale = 0.1;
        this.maxScale = 10;
        this.offsetX = 0;
        this.offsetY = 0;
        this.isDragging = false;
        this.startX = 0;
        this.startY = 0;
        this.imageElement = null;
        this.naturalWidth = 0;
        this.naturalHeight = 0;
        this.localImagePath = null;
        this.isSSH = false;

        this.init();
    }

    /**
     * Initialize the image viewer
     */
    async init() {
        try {
            console.log('[ImageViewer] Initializing for:', this.imagePath);

            // Check if this is an SSH file
            this.isSSH = this.imagePath.startsWith('ssh://') || (this.sshContext && this.sshContext.isSSH);

            if (this.isSSH) {
                // Download SSH file to cache
                await this.downloadSSHImage();
            } else {
                // Local file - use directly
                this.localImagePath = this.imagePath;
            }

            this.render();
            this.setupEventListeners();
        } catch (error) {
            console.error('[ImageViewer] Initialization error:', error);
            this.renderError(error.message);
        }
    }

    /**
     * Download SSH image to cache
     */
    async downloadSSHImage() {
        try {
            // Show loading state
            this.renderLoading();

            if (!this.sshContext) {
                throw new Error('SSH context required for SSH file');
            }

            const { connectionId, remotePath } = this.parseSSHPath();

            console.log('[ImageViewer] Downloading SSH image:', { connectionId, remotePath });

            // Initialize cache if needed
            if (!sshMediaCache.isInitialized()) {
                await sshMediaCache.initialize(window.electronAPI);
            }

            // Download file to cache
            this.localImagePath = await sshMediaCache.getCachedFile(
                connectionId,
                remotePath,
                (progress) => {
                    // Update progress
                    this.updateLoadingProgress(progress);
                }
            );

            console.log('[ImageViewer] Image cached at:', this.localImagePath);

        } catch (error) {
            console.error('[ImageViewer] Error downloading SSH image:', error);
            throw new Error(`Failed to download image: ${error.message}`);
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
            if (this.imagePath.startsWith('ssh://')) {
                const host = this.sshContext.connectionConfig?.host;
                const sshPrefix = `ssh://${host}`;
                remotePath = this.imagePath.startsWith(sshPrefix)
                    ? this.imagePath.substring(sshPrefix.length)
                    : this.imagePath.substring(6); // Remove 'ssh://'
            } else {
                remotePath = this.imagePath;
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
            <div class="image-loading">
                <div class="image-loading-spinner"></div>
                <h3>Loading Image...</h3>
                <p>Downloading from SSH server</p>
                <div class="image-loading-progress">
                    <div class="image-loading-progress-bar" style="width: 0%"></div>
                </div>
            </div>
        `;
    }

    /**
     * Update loading progress
     * @param {Object} progress - Progress info
     */
    updateLoadingProgress(progress) {
        const progressBar = this.container.querySelector('.image-loading-progress-bar');
        if (progressBar && progress.percent) {
            progressBar.style.width = `${progress.percent}%`;
        }
    }

    /**
     * Render the image viewer
     */
    render() {
        // Use file:// protocol for local files (including cached SSH files)
        const imageSrc = `file://${this.localImagePath}`;

        this.container.innerHTML = `
            <div class="image-viewer">
                <!-- Controls -->
                <div class="image-controls">
                    <div class="image-controls-left">
                        <button class="image-btn" id="zoom-out" title="Zoom Out (-)">
                            <span>🔍−</span>
                        </button>
                        <span class="image-zoom-display">100%</span>
                        <button class="image-btn" id="zoom-in" title="Zoom In (+)">
                            <span>🔍+</span>
                        </button>
                        <button class="image-btn" id="fit-screen" title="Fit to Screen (F)">
                            <span>⛶</span>
                        </button>
                        <button class="image-btn" id="actual-size" title="Actual Size (1)">
                            <span>1:1</span>
                        </button>
                    </div>
                    <div class="image-controls-right">
                        <span class="image-info" id="image-dimensions">Loading...</span>
                    </div>
                </div>

                <!-- Image Container -->
                <div class="image-container" id="image-container">
                    <img
                        src="${imageSrc}"
                        class="image-content"
                        id="image-content"
                        draggable="false"
                        alt="Image preview">
                </div>
            </div>
        `;
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        this.imageElement = this.container.querySelector('#image-content');
        const imageContainer = this.container.querySelector('#image-container');

        if (!this.imageElement) return;

        // Image loaded event
        this.imageElement.addEventListener('load', () => {
            this.naturalWidth = this.imageElement.naturalWidth;
            this.naturalHeight = this.imageElement.naturalHeight;
            this.updateMetadata();
            this.fitToScreen();
        });

        // Image error event
        this.imageElement.addEventListener('error', () => {
            this.renderError('Failed to load image');
        });

        // Zoom controls
        this.container.querySelector('#zoom-in')?.addEventListener('click', () => this.zoomIn());
        this.container.querySelector('#zoom-out')?.addEventListener('click', () => this.zoomOut());
        this.container.querySelector('#fit-screen')?.addEventListener('click', () => this.fitToScreen());
        this.container.querySelector('#actual-size')?.addEventListener('click', () => this.actualSize());

        // Mouse wheel zoom
        imageContainer?.addEventListener('wheel', (e) => {
            e.preventDefault();
            if (e.deltaY < 0) {
                this.zoomIn();
            } else {
                this.zoomOut();
            }
        });

        // Pan/drag functionality
        imageContainer?.addEventListener('mousedown', (e) => {
            if (e.button === 0) { // Left mouse button
                this.isDragging = true;
                this.startX = e.clientX - this.offsetX;
                this.startY = e.clientY - this.offsetY;
                imageContainer.style.cursor = 'grabbing';
            }
        });

        document.addEventListener('mousemove', (e) => {
            if (this.isDragging) {
                this.offsetX = e.clientX - this.startX;
                this.offsetY = e.clientY - this.startY;
                this.updateTransform();
            }
        });

        document.addEventListener('mouseup', () => {
            if (this.isDragging) {
                this.isDragging = false;
                if (imageContainer) {
                    imageContainer.style.cursor = 'grab';
                }
            }
        });

        // Keyboard shortcuts
        this.keyHandler = (e) => {
            switch (e.key) {
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
                case '1':
                    e.preventDefault();
                    this.actualSize();
                    break;
                case 'f':
                case 'F':
                    e.preventDefault();
                    this.fitToScreen();
                    break;
                case '0':
                    e.preventDefault();
                    this.resetView();
                    break;
            }
        };

        document.addEventListener('keydown', this.keyHandler);
    }

    /**
     * Zoom in
     */
    zoomIn() {
        this.setScale(this.scale * 1.2);
    }

    /**
     * Zoom out
     */
    zoomOut() {
        this.setScale(this.scale / 1.2);
    }

    /**
     * Set zoom scale
     * @param {number} newScale - New scale value
     */
    setScale(newScale) {
        this.scale = Math.max(this.minScale, Math.min(this.maxScale, newScale));
        this.updateTransform();
        this.updateZoomDisplay();
    }

    /**
     * Fit image to screen
     */
    fitToScreen() {
        const container = this.container.querySelector('#image-container');
        if (!container || !this.imageElement) return;

        const containerWidth = container.clientWidth;
        const containerHeight = container.clientHeight;
        const imageWidth = this.naturalWidth;
        const imageHeight = this.naturalHeight;

        const scaleX = containerWidth / imageWidth;
        const scaleY = containerHeight / imageHeight;
        const newScale = Math.min(scaleX, scaleY, 1); // Don't scale up beyond 100%

        this.scale = newScale;
        this.offsetX = 0;
        this.offsetY = 0;
        this.updateTransform();
        this.updateZoomDisplay();
    }

    /**
     * Show actual size (100%)
     */
    actualSize() {
        this.scale = 1;
        this.offsetX = 0;
        this.offsetY = 0;
        this.updateTransform();
        this.updateZoomDisplay();
    }

    /**
     * Reset view to default
     */
    resetView() {
        this.fitToScreen();
    }

    /**
     * Update image transform
     */
    updateTransform() {
        if (!this.imageElement) return;

        this.imageElement.style.transform = `translate(${this.offsetX}px, ${this.offsetY}px) scale(${this.scale})`;
    }

    /**
     * Update zoom percentage display
     */
    updateZoomDisplay() {
        const zoomDisplay = this.container.querySelector('.image-zoom-display');
        if (zoomDisplay) {
            zoomDisplay.textContent = `${Math.round(this.scale * 100)}%`;
        }
    }

    /**
     * Update metadata display
     */
    updateMetadata() {
        const dimensionsEl = this.container.querySelector('#image-dimensions');
        if (dimensionsEl) {
            dimensionsEl.textContent = `${this.naturalWidth} × ${this.naturalHeight}`;
        }
    }

    /**
     * Render error state
     * @param {string} message - Error message
     */
    renderError(message) {
        this.container.innerHTML = `
            <div class="image-error">
                <div class="image-error-icon">⚠️</div>
                <h3>Image Load Error</h3>
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

module.exports = ImageViewer;

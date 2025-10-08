/**
 * FileViewer - Component for displaying file contents
 *
 * Self-contained component for viewing file contents with syntax detection.
 *
 * Usage:
 *   const viewer = new FileViewer(viewerElement, headerElement, fileSystemService);
 *   await viewer.openFile('/path/to/file.js');
 */

const eventBus = require('../modules/EventBus');
const stateManager = require('../modules/StateManager');
const fileTypes = require('../utils/FileTypes');
const pathUtils = require('../utils/PathUtils');
const SQLiteViewer = require('./SQLiteViewer');
const VideoPlayer = require('./VideoPlayer');
const ImageViewer = require('./ImageViewer');
const TextEditor = require('./TextEditor');
const MarkdownViewer = require('./MarkdownViewer');
const settingsPanel = require('./SettingsPanel');
const syntaxHighlighter = require('../utils/SyntaxHighlighter');
const Breadcrumb = require('./Breadcrumb');
const performanceMonitor = require('../utils/PerformanceMonitor');

class FileViewer {
    constructor(viewerElement, headerElement, fileSystemService, sqliteService) {
        this.viewerElement = viewerElement;
        this.headerElement = headerElement;
        this.fs = fileSystemService;
        this.sqlite = sqliteService;
        this.currentFile = null;
        this.sqliteViewer = null; // To track current SQLite viewer instance
        this.videoPlayer = null; // To track current video player instance
        this.imageViewer = null; // To track current image viewer instance
        this.textEditor = null; // To track current text editor instance
        this.markdownViewer = null; // To track current markdown viewer instance
        this.breadcrumb = null; // Breadcrumb navigation

        this.init();
    }

    /**
     * Initialize the component
     */
    init() {
        // Initialize breadcrumb if header element exists and enabled in settings
        if (this.headerElement && settingsPanel.get('breadcrumbEnabled')) {
            this.breadcrumb = new Breadcrumb(this.headerElement);
        }

        // Add action toolbar to header
        if (this.headerElement) {
            this.createActionToolbar();
        }

        this.setupEventListeners();
        this.renderEmpty();
    }

    /**
     * Create action toolbar with Quick Open, Search, and Find & Replace buttons
     */
    createActionToolbar() {
        // Check if toolbar already exists
        if (this.headerElement.querySelector('.file-viewer-actions')) {
            return;
        }

        const toolbar = document.createElement('div');
        toolbar.className = 'file-viewer-actions';

        // Quick Open button
        const quickOpenBtn = document.createElement('button');
        quickOpenBtn.className = 'file-viewer-action-btn';
        quickOpenBtn.title = 'Quick Open (Ctrl+P)';
        const quickOpenIcon = document.createElement('img');
        quickOpenIcon.src = 'assets/icons/search.svg';
        quickOpenIcon.alt = 'Quick Open';
        quickOpenIcon.className = 'file-viewer-action-icon';
        quickOpenBtn.appendChild(quickOpenIcon);
        quickOpenBtn.addEventListener('click', () => {
            eventBus.emit('quickopen:show');
        });

        // Global Search button
        const searchBtn = document.createElement('button');
        searchBtn.className = 'file-viewer-action-btn';
        searchBtn.title = 'Search in Files (Ctrl+Shift+F)';
        const searchIcon = document.createElement('img');
        searchIcon.src = 'assets/icons/folder.svg';
        searchIcon.alt = 'Search in Files';
        searchIcon.className = 'file-viewer-action-icon';
        searchBtn.appendChild(searchIcon);
        searchBtn.addEventListener('click', () => {
            eventBus.emit('globalsearch:show');
        });

        // Find & Replace button
        const replaceBtn = document.createElement('button');
        replaceBtn.className = 'file-viewer-action-btn';
        replaceBtn.title = 'Find & Replace (Ctrl+Shift+H)';
        const replaceIcon = document.createElement('img');
        replaceIcon.src = 'assets/icons/find-replace.svg';
        replaceIcon.alt = 'Find & Replace';
        replaceIcon.className = 'file-viewer-action-icon';
        replaceBtn.appendChild(replaceIcon);
        replaceBtn.addEventListener('click', () => {
            eventBus.emit('findreplace:show');
        });

        toolbar.appendChild(quickOpenBtn);
        toolbar.appendChild(searchBtn);
        toolbar.appendChild(replaceBtn);

        this.headerElement.appendChild(toolbar);
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // DISABLED: Do not listen to global file:selected events in tab-based system
        // Each tab has its own FileViewer instance, and opening files is handled by PaneManager
        // If all FileViewers listen to file:selected, they ALL open the file, corrupting tabs
        /*
        eventBus.on('file:selected', async (data) => {
            await this.openFile(data.path);
        });
        */

        // Listen for file refresh requests
        eventBus.on('viewer:refresh', () => {
            if (this.currentFile) {
                this.refreshCurrentFile();
            }
        });

        // Listen for breadcrumb updates from editor
        eventBus.on('editor:breadcrumb-update', (data) => {
            if (this.breadcrumb && data.filePath === this.currentFile) {
                this.breadcrumb.setSymbols(data.symbols);
            }
        });

        // Listen for settings changes
        eventBus.on('settings:changed', (settings) => {
            this.handleSettingsChange(settings);
        });

        // Listen for file replacement events (from Find & Replace)
        eventBus.on('file:replaced', (data) => {
            // If this file is currently open, reload it to show updated content
            if (this.currentFile && data.path === this.currentFile) {
                console.log('[FileViewer] File was replaced, reloading:', data.path);
                this.refreshCurrentFile();
            }
        });
    }

    /**
     * Handle settings changes
     * @param {Object} settings - New settings
     */
    handleSettingsChange(settings) {
        // Handle breadcrumb toggle
        if (settings.breadcrumbEnabled && !this.breadcrumb && this.headerElement) {
            // Enable breadcrumb
            this.breadcrumb = new Breadcrumb(this.headerElement);
            if (this.currentFile) {
                this.breadcrumb.setPath(this.currentFile);
            }
        } else if (!settings.breadcrumbEnabled && this.breadcrumb) {
            // Disable breadcrumb
            this.breadcrumb.destroy();
            this.breadcrumb = null;
            // Show plain text path
            if (this.headerElement && this.currentFile) {
                this.headerElement.textContent = this.currentFile;
            }
        }
    }

    /**
     * Open and display a file
     * @param {string} filePath - File path
     */
    async openFile(filePath, lineNumber = null) {
        console.log('[FileViewer] ========== OPENING FILE ==========');
        console.log('[FileViewer] this:', this);
        console.log('[FileViewer] filePath:', filePath);
        console.log('[FileViewer] lineNumber:', lineNumber);
        console.log('[FileViewer] viewerElement:', this.viewerElement);
        console.log('[FileViewer] viewerElement dataset:', this.viewerElement.dataset);
        console.log('[FileViewer] headerElement:', this.headerElement);

        // Wrap entire file opening operation with performance measurement
        return performanceMonitor.measure('FileViewer.openFile', async () => {
            return this._openFileImpl(filePath, lineNumber);
        }, { filePath });
    }

    /**
     * Internal implementation of file opening
     * @param {string} filePath - File path
     * @param {number} lineNumber - Optional line number to navigate to
     */
    async _openFileImpl(filePath, lineNumber = null) {
        try {
            // Clean up any existing viewers
            this.cleanupViewers();

            const fileName = pathUtils.basename(filePath);
            console.log('[FileViewer] fileName:', fileName);

            // Check if file is an image
            if (fileTypes.isImage(fileName)) {
                this.renderImage(fileName, filePath);
                return;
            }

            // Check if file is a video
            if (fileTypes.isVideo(fileName)) {
                this.renderVideo(fileName, filePath);
                return;
            }

            // Check if file is binary (SQLite, etc.)
            if (fileTypes.isBinary(fileName)) {
                this.renderBinary(fileName, filePath);
                return;
            }

            // Check if file is viewable (including unknown types - we'll try to display them)
            if (!fileTypes.isTextViewable(fileName)) {
                this.renderNonViewable(fileName);
                return;
            }

            this.renderLoading(fileName);

            // Track file load performance
            const fileLoadStart = performance.now();
            const result = await this.fs.readFile(filePath);
            const fileLoadDuration = performance.now() - fileLoadStart;

            if (!result.success) {
                this.renderError(result.error || 'Failed to read file');
                return;
            }

            // Track file load metrics
            const fileSize = result.content.length;
            performanceMonitor.trackFileLoad(filePath, fileSize, fileLoadDuration);

            this.currentFile = filePath;
            stateManager.set('openFile', filePath);

            // Check if file is markdown and preview is enabled
            if ((fileName.endsWith('.md') || fileName.endsWith('.markdown')) && settingsPanel.get('markdownPreviewEnabled')) {
                this.renderMarkdown(result.content, filePath);
            } else {
                // Use TextEditor for other editable text files (or markdown if preview disabled)
                this.renderTextEditor(result.content, filePath, lineNumber);
            }

            this.updateHeader(filePath);

            eventBus.emit('file:opened', { path: filePath, size: result.content.length });
        } catch (error) {
            console.error('[FileViewer] Error opening file:', error);
            this.renderError('Failed to open file');
        }
    }

    /**
     * Render text editor
     * @param {string} content - File content
     * @param {string} filePath - File path
     * @param {number} lineNumber - Optional line number to navigate to
     */
    renderTextEditor(content, filePath, lineNumber = null) {
        console.log('[FileViewer] ========== RENDERING TEXT EDITOR ==========');
        console.log('[FileViewer] filePath:', filePath);
        console.log('[FileViewer] lineNumber:', lineNumber);
        console.log('[FileViewer] viewerElement:', this.viewerElement);
        console.log('[FileViewer] viewerElement dataset:', this.viewerElement.dataset);
        console.log('[FileViewer] content length:', content.length);
        console.log('[FileViewer] content preview:', content.substring(0, 200));

        // Create new text editor
        this.textEditor = new TextEditor(this.viewerElement, content, filePath);
        console.log('[FileViewer] TextEditor instance created:', this.textEditor);

        // Navigate to line if specified
        if (lineNumber !== null && lineNumber !== undefined) {
            console.log('[FileViewer] Navigating to line:', lineNumber);
            // Use setTimeout to ensure CodeMirror is fully initialized
            setTimeout(() => {
                this.textEditor.goToLine(lineNumber);
            }, 100);
        }

        console.log('[FileViewer] ========================================');

        // Listen for dirty state changes
        eventBus.on('file:dirty-changed', (data) => {
            if (data.path === filePath) {
                this.updateHeaderDirty(data.isDirty);
            }
        });
    }

    /**
     * Render markdown viewer
     * @param {string} content - Markdown content
     * @param {string} filePath - File path
     */
    renderMarkdown(content, filePath) {
        console.log('[FileViewer] Rendering markdown viewer for:', filePath);

        // Create new markdown viewer
        this.markdownViewer = new MarkdownViewer(this.viewerElement, content, filePath);
    }

    /**
     * Render file content (read-only, for reference)
     * @param {string} content - File content
     * @param {string} fileName - File name
     * @param {boolean} showWarning - Show warning for unknown file types
     */
    renderContent(content, fileName, showWarning = false) {
        // Get language for highlighting
        const language = fileTypes.getLanguage(fileName);

        // Apply syntax highlighting
        const highlighted = syntaxHighlighter.highlight(content, language);

        // Add warning banner for unknown file types
        let warningBanner = '';
        if (showWarning) {
            warningBanner = `
                <div class="file-warning">
                    ⚠️ Unknown file type - displaying as plain text. Content may not be formatted correctly.
                </div>
            `;
        }

        // Render with syntax highlighting
        this.viewerElement.innerHTML = `${warningBanner}<pre><code class="hljs language-${highlighted.language}">${highlighted.value}</code></pre>`;
    }

    /**
     * Format content with line numbers if needed
     * @param {string} content - Content to format
     * @returns {string} Formatted content
     */
    formatContent(content) {
        // For now, just return the content as-is
        // Could add line numbers or other formatting here
        return content;
    }

    /**
     * Update header with file path
     * @param {string} filePath - File path
     */
    updateHeader(filePath) {
        if (this.breadcrumb) {
            this.breadcrumb.setPath(filePath);
        } else if (this.headerElement) {
            // Fallback to plain text if breadcrumb disabled
            this.headerElement.textContent = filePath;
        }

        if (this.headerElement) {
            this.headerElement.classList.remove('dirty');
        }
    }

    /**
     * Update header dirty state
     * @param {boolean} isDirty - Is file dirty
     */
    updateHeaderDirty(isDirty) {
        if (this.headerElement) {
            if (isDirty) {
                this.headerElement.classList.add('dirty');
            } else {
                this.headerElement.classList.remove('dirty');
            }
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

    /**
     * Render loading state
     * @param {string} fileName - File name
     */
    renderLoading(fileName) {
        this.viewerElement.innerHTML = '<code>Loading file...</code>';
        this.updateHeader(fileName);
    }

    /**
     * Render empty state
     */
    renderEmpty() {
        this.viewerElement.innerHTML = '<code>Select a file from the sidebar to view its contents</code>';
        if (this.breadcrumb) {
            this.breadcrumb.clear();
        } else if (this.headerElement) {
            this.headerElement.textContent = 'No file selected';
        }
    }

    /**
     * Render error state
     * @param {string} message - Error message
     */
    renderError(message) {
        this.viewerElement.innerHTML = `<code class="error">Error: ${this.escapeHtml(message)}</code>`;
    }

    /**
     * Render non-viewable file message
     * @param {string} fileName - File name
     */
    renderNonViewable(fileName) {
        const category = fileTypes.getCategory(fileName);
        const icon = fileTypes.getIcon(fileName);

        this.viewerElement.innerHTML = `
            <code>
                ${icon} This file type (${category}) cannot be viewed in the text editor.

                File: ${this.escapeHtml(fileName)}
            </code>
        `;
        this.updateHeader(fileName);
    }

    /**
     * Render image viewer
     * @param {string} fileName - File name
     * @param {string} filePath - Full file path
     */
    renderImage(fileName, filePath) {
        console.log('[FileViewer] Rendering image:', filePath);

        this.currentFile = filePath;
        stateManager.set('openFile', filePath);
        this.updateHeader(filePath);

        // Create new image viewer
        this.imageViewer = new ImageViewer(this.viewerElement, filePath);

        eventBus.emit('file:opened', { path: filePath, type: 'image' });
    }

    /**
     * Render video player
     * @param {string} fileName - File name
     * @param {string} filePath - Full file path
     */
    renderVideo(fileName, filePath) {
        console.log('[FileViewer] Rendering video:', filePath);

        this.currentFile = filePath;
        stateManager.set('openFile', filePath);
        this.updateHeader(filePath);

        // Create new video player
        this.videoPlayer = new VideoPlayer(this.viewerElement, filePath, window.electronAPI);

        eventBus.emit('file:opened', { path: filePath, type: 'video' });
    }

    /**
     * Render binary file message or SQLite viewer
     * @param {string} fileName - File name
     * @param {string} filePath - Full file path
     */
    renderBinary(fileName, filePath) {
        const ext = fileTypes.getExtension(fileName);

        // Check if it's a SQLite database
        if (['db', 'sqlite', 'sqlite3'].includes(ext) && this.sqlite) {
            console.log('[FileViewer] Rendering SQLite database:', filePath);
            // Clean up previous SQLite viewer if any
            if (this.sqliteViewer) {
                this.sqliteViewer.destroy();
            }

            // Create new SQLite viewer
            this.sqliteViewer = new SQLiteViewer(this.viewerElement, filePath, this.sqlite);
            this.updateHeader(filePath);
            return;
        }

        // Regular binary file message
        const icon = fileTypes.getIcon(fileName);
        this.viewerElement.innerHTML = `
            <code>
                ${icon} Binary File

                File: ${this.escapeHtml(fileName)}

                This is a binary file and cannot be displayed as text.
            </code>
        `;
        this.updateHeader(fileName);
    }

    /**
     * Clean up any active viewers
     */
    cleanupViewers() {
        if (this.sqliteViewer) {
            this.sqliteViewer.destroy();
            this.sqliteViewer = null;
        }

        if (this.videoPlayer) {
            this.videoPlayer.destroy();
            this.videoPlayer = null;
        }

        if (this.imageViewer) {
            this.imageViewer.destroy();
            this.imageViewer = null;
        }

        if (this.textEditor) {
            this.textEditor.destroy();
            this.textEditor = null;
        }

        if (this.markdownViewer) {
            this.markdownViewer.destroy();
            this.markdownViewer = null;
        }
    }

    /**
     * Refresh current file
     */
    async refreshCurrentFile() {
        if (!this.currentFile) return;
        await this.openFile(this.currentFile);
    }

    /**
     * Clear the viewer
     */
    clear() {
        this.cleanupViewers();
        this.currentFile = null;
        this.renderEmpty();
    }

    /**
     * Get current file path
     * @returns {string|null} Current file path
     */
    getCurrentFile() {
        return this.currentFile;
    }

    /**
     * Cleanup
     */
    destroy() {
        this.cleanupViewers();
        if (this.breadcrumb) {
            this.breadcrumb.destroy();
            this.breadcrumb = null;
        }
        this.clear();
        eventBus.off('file:selected');
        eventBus.off('viewer:refresh');
    }
}

module.exports = FileViewer;

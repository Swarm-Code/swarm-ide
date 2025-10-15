/**
 * FileExplorer - File tree component for browsing directories
 *
 * Self-contained component for rendering file trees, handling user
 * interactions, and communicating with FileSystemService.
 *
 * Usage:
 *   const explorer = new FileExplorer(containerElement, fileSystemService, eventBus);
 *   await explorer.openDirectory('/path/to/dir');
 */

const eventBus = require('../modules/EventBus');
const stateManager = require('../modules/StateManager');
const fileTypes = require('../utils/FileTypes');
const pathUtils = require('../utils/PathUtils');
const fileStateTracker = require('../modules/FileStateTracker');
const logger = require('../utils/Logger');

class FileExplorer {
    constructor(container, fileSystemService, config) {
        this.container = container;
        this.fs = fileSystemService;
        this.config = config;
        this.currentPath = null;
        this.expandedPaths = new Set();
        this.selectedPaths = new Set(); // Track multiple selected items
        this.lastSelectedPath = null; // For shift-click selection
        this.contextMenu = null; // Context menu element
        this.clipboard = { items: [], operation: null }; // Clipboard for copy/cut/paste

        // File change polling for external changes (git operations, etc.)
        this.changePolling = {
            enabled: false,
            interval: null,
            lastSnapshot: null,
            intervalMs: 200
        };

        this.init();
    }

    /**
     * Initialize the component
     */
    init() {
        this.setupEventListeners();
        this.renderEmpty();
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Listen for folder open requests
        eventBus.on('explorer:open-folder', async (data) => {
            logger.debug('fileSystem', 'Received explorer:open-folder event with path:', data.path);
            await this.openDirectory(data.path);
        });

        // Listen for refresh requests
        eventBus.on('explorer:refresh', () => {
            if (this.currentPath) {
                this.refreshCurrentDirectory();
            }
        });

        // Listen for breadcrumb navigation requests
        eventBus.on('explorer:navigate-to', async (data) => {
            logger.debug('fileSystem', 'Navigating to directory from breadcrumb:', data.path);
            // Expand and scroll to the directory
            await this.expandToPath(data.path);
        });

        // Listen for file modification state changes to update visual indicators
        eventBus.on('file:modification-state-changed', (data) => {
            logger.debug('fileSystem', 'File modification state changed:', data.path, 'isModified:', data.isModified);
            this.updateFileModificationIndicator(data.path, data.isModified);
        });

        // Listen for file system changes from file watcher
        eventBus.on('fs:file-changes', (data) => {
            logger.debug('fileSystem', 'File system changes detected:', data.events.length, 'changes in', data.rootPath);
            this.handleFileSystemChanges(data.rootPath, data.events);
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // Only handle if file tree has focus or selection
            if (this.selectedPaths.size === 0) return;

            const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
            const ctrlOrCmd = isMac ? e.metaKey : e.ctrlKey;

            if (ctrlOrCmd && e.key === 'c') {
                e.preventDefault();
                this.copySelected();
            } else if (ctrlOrCmd && e.key === 'x') {
                e.preventDefault();
                this.cutSelected();
            } else if (ctrlOrCmd && e.key === 'v') {
                e.preventDefault();
                // Paste into current directory or first selected directory
                const targetDir = this.currentPath;
                if (targetDir) {
                    this.pasteInto(targetDir);
                }
            } else if (ctrlOrCmd && e.key === 'd') {
                e.preventDefault();
                // Duplicate first selected item
                if (this.selectedPaths.size === 1) {
                    const path = Array.from(this.selectedPaths)[0];
                    const name = pathUtils.basename(path);
                    this.duplicateItem(path, name);
                }
            } else if (e.key === 'Delete' || (isMac && e.key === 'Backspace')) {
                e.preventDefault();
                this.deleteSelected();
            }
        });
    }

    /**
     * Open a directory
     * @param {string} dirPath - Directory path
     */
    async openDirectory(dirPath) {
        try {
            logger.debug('fileSystem', 'Opening directory:', dirPath);
            this.currentPath = dirPath;
            stateManager.set('currentDirectory', dirPath);

            const entries = await this.fs.readDirectory(dirPath);
            logger.debug('fileSystem', 'Read', entries.length, 'entries from directory');

            // Filter based on config
            const filtered = this.filterEntries(entries);
            logger.debug('fileSystem', 'After filtering:', filtered.length, 'entries');

            this.renderTree(filtered, dirPath);

            logger.debug('fileSystem', 'Emitting explorer:directory-opened event');
            eventBus.emit('explorer:directory-opened', { path: dirPath, entries: filtered });

            // Set up file watcher for automatic refresh
            logger.debug('fileSystem', 'Setting up file watcher for:', dirPath);
            await this.fs.watchDirectory(dirPath);

            // Start polling for external changes (git operations, etc.)
            this.stopChangePolling(); // Stop any existing polling
            this.startChangePolling();

            // Add to recent folders
            if (this.config) {
                this.config.addRecentFolder(dirPath);
            }
        } catch (error) {
            logger.error('fileSystem', 'Error opening directory:', error);
            this.renderError('Failed to open directory');
        }
    }

    /**
     * Filter entries based on configuration
     * @param {Array} entries - Directory entries
     * @returns {Array} Filtered entries
     */
    filterEntries(entries) {
        if (!this.config) return entries;

        const showHidden = this.config.get('showHiddenFiles', false);

        return entries.filter(entry => {
            // Filter hidden files if configured
            if (!showHidden && entry.name.startsWith('.')) {
                return false;
            }

            // Filter excluded patterns
            if (this.config.shouldExclude(entry.name)) {
                return false;
            }

            return true;
        });
    }

    /**
     * Render the file tree
     * @param {Array} entries - Directory entries
     * @param {string} basePath - Base directory path
     */
    renderTree(entries, basePath) {
        this.container.innerHTML = '';

        if (entries.length === 0) {
            this.renderEmpty();
            return;
        }

        const treeContainer = document.createElement('div');
        treeContainer.className = 'file-tree';

        entries.forEach(entry => {
            const item = this.createTreeItem(entry, basePath);
            treeContainer.appendChild(item);
        });

        this.container.appendChild(treeContainer);
    }

    /**
     * Create a tree item element
     * @param {Object} entry - File/directory entry
     * @param {string} basePath - Base path
     * @returns {HTMLElement} Tree item element
     */
    createTreeItem(entry, basePath) {
        const item = document.createElement('div');
        item.className = entry.isDirectory ? 'tree-item directory' : 'tree-item file';
        item.dataset.path = entry.path;

        // Make files draggable (not directories for now)
        if (!entry.isDirectory) {
            item.draggable = true;
            item.addEventListener('dragstart', (e) => {
                e.dataTransfer.effectAllowed = 'copy';
                e.dataTransfer.setData('text/plain', entry.path);
                e.dataTransfer.setData('application/x-file-path', entry.path);
                item.classList.add('dragging');
                logger.debug('fileSystem', 'Drag started for file:', entry.path);

                // Emit event to show drag overlay
                eventBus.emit('explorer:drag-start', { path: entry.path });
            });

            item.addEventListener('dragend', (e) => {
                item.classList.remove('dragging');

                // Emit event to hide drag overlay
                eventBus.emit('explorer:drag-end', { path: entry.path });
            });
        }

        // Icon
        const icon = document.createElement('span');
        icon.className = 'tree-item-icon';

        // Create img element for Material Icon
        const iconImg = document.createElement('img');
        iconImg.className = 'tree-item-icon-img';
        if (entry.isDirectory) {
            iconImg.src = fileTypes.getFolderIconPath(false);
            iconImg.alt = 'folder';
        } else {
            iconImg.src = fileTypes.getIconPath(entry.name);
            iconImg.alt = fileTypes.getIcon(entry.name);
        }
        icon.appendChild(iconImg);

        // Name
        const name = document.createElement('span');
        name.className = 'tree-item-name';
        name.textContent = entry.name;

        item.appendChild(icon);
        item.appendChild(name);

        // Add modification indicator for files (not directories)
        if (!entry.isDirectory) {
            const modIndicator = document.createElement('span');
            modIndicator.className = 'tree-item-mod-indicator';
            modIndicator.textContent = '●'; // Red circle
            modIndicator.style.display = 'none'; // Hidden by default
            item.appendChild(modIndicator);

            // Check if file is currently modified
            if (fileStateTracker.isModified(entry.path)) {
                item.classList.add('modified');
                modIndicator.style.display = 'inline';
            }
        }

        // Event handlers with multi-selection support
        item.addEventListener('click', async (e) => {
            e.stopPropagation();

            if (entry.isDirectory && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
                await this.toggleDirectory(entry.path, item);
            }

            this.handleItemClick(entry.path, item, e);
        });

        // Context menu
        item.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();

            // Add to selection if not already selected
            if (!this.selectedPaths.has(entry.path)) {
                this.clearSelection();
                this.addToSelection(entry.path, item);
            }

            this.showContextMenu(e.clientX, e.clientY, entry);
        });

        return item;
    }

    /**
     * Toggle directory expansion
     * @param {string} dirPath - Directory path
     * @param {HTMLElement} itemElement - Tree item element
     */
    async toggleDirectory(dirPath, itemElement) {
        if (this.expandedPaths.has(dirPath)) {
            // Collapse
            this.collapseDirectory(dirPath, itemElement);
        } else {
            // Expand
            await this.expandDirectory(dirPath, itemElement);
        }
    }

    /**
     * Expand a directory
     * @param {string} dirPath - Directory path
     * @param {HTMLElement} itemElement - Tree item element
     */
    async expandDirectory(dirPath, itemElement) {
        try {
            const entries = await this.fs.readDirectory(dirPath);
            const filtered = this.filterEntries(entries);

            // Create children container
            const childrenContainer = document.createElement('div');
            childrenContainer.className = 'tree-children';

            filtered.forEach(entry => {
                const childItem = this.createTreeItem(entry, dirPath);
                childrenContainer.appendChild(childItem);
            });

            // Insert after the current item
            itemElement.after(childrenContainer);

            // Update state
            this.expandedPaths.add(dirPath);
            itemElement.classList.add('expanded');

            eventBus.emit('explorer:directory-expanded', { path: dirPath });
        } catch (error) {
            logger.error('fileSystem', 'Error expanding directory:', error);
        }
    }

    /**
     * Collapse a directory
     * @param {string} dirPath - Directory path
     * @param {HTMLElement} itemElement - Tree item element
     */
    collapseDirectory(dirPath, itemElement) {
        const childrenContainer = itemElement.nextElementSibling;
        if (childrenContainer && childrenContainer.classList.contains('tree-children')) {
            childrenContainer.remove();
        }

        this.expandedPaths.delete(dirPath);
        itemElement.classList.remove('expanded');

        eventBus.emit('explorer:directory-collapsed', { path: dirPath });
    }

    /**
     * Expand all parent directories to make a path visible
     * @param {string} targetPath - Path to expand to
     */
    async expandToPath(targetPath) {
        logger.debug('fileSystem', 'Expanding to path:', targetPath);

        if (!this.currentPath) {
            logger.warn('fileSystem', 'No directory open, cannot expand to path');
            return;
        }

        // Find the tree item element for the target path
        const findItemElement = (path) => {
            const items = this.container.querySelectorAll('.tree-item');
            for (const item of items) {
                const itemPath = item.dataset.path;
                if (itemPath === path) {
                    return item;
                }
            }
            return null;
        };

        // Get relative path from current root
        if (!targetPath.startsWith(this.currentPath)) {
            logger.warn('fileSystem', 'Target path is outside current directory');
            return;
        }

        // Build list of parent directories from root to target
        const relativePath = targetPath.substring(this.currentPath.length);
        const segments = relativePath.split(pathUtils.sep).filter(s => s);

        let currentPath = this.currentPath;

        // Expand each parent directory
        for (let i = 0; i < segments.length; i++) {
            currentPath = pathUtils.join(currentPath, segments[i]);

            // Find the item element
            const itemElement = findItemElement(currentPath);

            if (!itemElement) {
                logger.warn('fileSystem', 'Could not find tree item for:', currentPath);
                continue;
            }

            // Expand if it's a directory and not already expanded
            const isDirectory = itemElement.classList.contains('directory');
            const isExpanded = this.expandedPaths.has(currentPath);

            if (isDirectory && !isExpanded) {
                await this.expandDirectory(currentPath, itemElement);
            }

            // Select the final target
            if (i === segments.length - 1) {
                itemElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                itemElement.classList.add('selected');
            }
        }
    }

    /**
     * Select a file
     * @param {string} filePath - File path
     * @param {HTMLElement} itemElement - Tree item element
     */
    selectFile(filePath, itemElement) {
        // Remove previous selection
        const previouslySelected = this.container.querySelector('.tree-item.selected');
        if (previouslySelected) {
            previouslySelected.classList.remove('selected');
        }

        // Add selection
        itemElement.classList.add('selected');

        // Update state
        stateManager.set('currentFile', filePath);

        // Emit event
        eventBus.emit('file:selected', { path: filePath });
    }

    /**
     * Refresh current directory
     */
    async refreshCurrentDirectory() {
        if (!this.currentPath) return;
        await this.openDirectory(this.currentPath);
    }

    /**
     * Navigate to parent directory
     */
    async openParentDirectory() {
        if (!this.currentPath) {
            logger.warn('fileSystem', 'No current directory to navigate from');
            return;
        }

        const parentPath = pathUtils.dirname(this.currentPath);

        // Prevent navigating above root (when dirname returns same path or empty)
        if (!parentPath || parentPath === this.currentPath || parentPath === '/') {
            logger.warn('fileSystem', 'Already at root directory');
            return;
        }

        logger.debug('fileSystem', `Navigating to parent directory: ${parentPath}`);
        await this.openDirectory(parentPath);
    }

    /**
     * Handle file system changes from file watcher
     * Automatically refreshes the explorer when changes are detected
     * @param {string} rootPath - Root path being watched
     * @param {Array} events - Array of change events
     */
    async handleFileSystemChanges(rootPath, events) {
        // Only refresh if the changes are for the current directory
        if (!this.currentPath || rootPath !== this.currentPath) {
            return;
        }

        logger.debug('fileSystem', 'Automatically refreshing due to file system changes');

        // Refresh the directory to show the changes
        await this.refreshCurrentDirectory();
    }

    /**
     * Start polling for external file changes (git operations, etc.)
     * Checks every 200ms for changes that file watcher might miss
     */
    startChangePolling() {
        if (this.changePolling.enabled || !this.currentPath) {
            return;
        }

        logger.debug('fileSystem', 'Starting change polling for:', this.currentPath);
        this.changePolling.enabled = true;

        // Create initial snapshot
        this.createDirectorySnapshot();

        // Start polling interval
        this.changePolling.interval = setInterval(async () => {
            // Only check if window is active to save resources
            if (document.hidden) return;

            await this.checkForChanges();
        }, this.changePolling.intervalMs);
    }

    /**
     * Stop polling for changes
     */
    stopChangePolling() {
        if (!this.changePolling.enabled) return;

        logger.debug('fileSystem', 'Stopping change polling');
        this.changePolling.enabled = false;

        if (this.changePolling.interval) {
            clearInterval(this.changePolling.interval);
            this.changePolling.interval = null;
        }

        this.changePolling.lastSnapshot = null;
    }

    /**
     * Create a snapshot of current directory for change detection
     */
    async createDirectorySnapshot() {
        if (!this.currentPath) return;

        try {
            const result = await this.fs.readDirectory(this.currentPath);
            if (!result.success) return;

            // Create a map of file paths to modification times
            const snapshot = new Map();

            for (const entry of result.files) {
                try {
                    const stats = await this.fs.getFileStats(entry.path);
                    if (stats.success) {
                        snapshot.set(entry.path, {
                            isDirectory: entry.isDirectory,
                            mtime: stats.stats.mtime,
                            size: stats.stats.size || 0
                        });
                    }
                } catch (error) {
                    // Skip files we can't stat
                    continue;
                }
            }

            this.changePolling.lastSnapshot = snapshot;
        } catch (error) {
            logger.debug('fileSystem', 'Failed to create directory snapshot:', error);
        }
    }

    /**
     * Check for changes by comparing current state with last snapshot
     */
    async checkForChanges() {
        if (!this.currentPath || !this.changePolling.lastSnapshot) {
            return;
        }

        try {
            const result = await this.fs.readDirectory(this.currentPath);
            if (!result.success) return;

            const currentSnapshot = new Map();
            let hasChanges = false;

            // Build current snapshot
            for (const entry of result.files) {
                try {
                    const stats = await this.fs.getFileStats(entry.path);
                    if (stats.success) {
                        currentSnapshot.set(entry.path, {
                            isDirectory: entry.isDirectory,
                            mtime: stats.stats.mtime,
                            size: stats.stats.size || 0
                        });
                    }
                } catch (error) {
                    continue;
                }
            }

            // Check for new files or removed files
            if (currentSnapshot.size !== this.changePolling.lastSnapshot.size) {
                hasChanges = true;
            } else {
                // Check for modified files
                for (const [path, currentInfo] of currentSnapshot) {
                    const lastInfo = this.changePolling.lastSnapshot.get(path);

                    if (!lastInfo) {
                        // New file
                        hasChanges = true;
                        break;
                    }

                    // Check if modified
                    if (currentInfo.mtime > lastInfo.mtime ||
                        currentInfo.size !== lastInfo.size ||
                        currentInfo.isDirectory !== lastInfo.isDirectory) {
                        hasChanges = true;
                        break;
                    }
                }

                // Check for deleted files
                if (!hasChanges) {
                    for (const path of this.changePolling.lastSnapshot.keys()) {
                        if (!currentSnapshot.has(path)) {
                            hasChanges = true;
                            break;
                        }
                    }
                }
            }

            if (hasChanges) {
                logger.debug('fileSystem', 'External changes detected via polling, refreshing...');
                this.changePolling.lastSnapshot = currentSnapshot;
                await this.refreshCurrentDirectory();
            }

        } catch (error) {
            logger.debug('fileSystem', 'Error checking for changes:', error);
        }
    }

    /**
     * Render empty state
     */
    renderEmpty() {
        this.container.innerHTML = '<div class="empty-state">No files in this directory</div>';
    }

    /**
     * Render error state
     * @param {string} message - Error message
     */
    renderError(message) {
        this.container.innerHTML = `<div class="error">${message}</div>`;
    }

    /**
     * Handle item click with multi-selection support
     * @param {string} itemPath - Item path
     * @param {HTMLElement} itemElement - Tree item element
     * @param {MouseEvent} event - Click event
     */
    handleItemClick(itemPath, itemElement, event) {
        if (event.ctrlKey || event.metaKey) {
            // Toggle selection
            if (this.selectedPaths.has(itemPath)) {
                this.removeFromSelection(itemPath, itemElement);
            } else {
                this.addToSelection(itemPath, itemElement);
            }
        } else if (event.shiftKey && this.lastSelectedPath) {
            // Range selection
            this.selectRange(this.lastSelectedPath, itemPath);
        } else {
            // Single selection
            this.clearSelection();
            this.addToSelection(itemPath, itemElement);

            // Emit file selected event for non-directories
            if (itemElement.classList.contains('file')) {
                stateManager.set('currentFile', itemPath);
                eventBus.emit('file:selected', { path: itemPath });
            }
        }
    }

    /**
     * Add item to selection
     * @param {string} path - Item path
     * @param {HTMLElement} element - Item element
     */
    addToSelection(path, element) {
        this.selectedPaths.add(path);
        element.classList.add('selected');
        this.lastSelectedPath = path;
    }

    /**
     * Remove item from selection
     * @param {string} path - Item path
     * @param {HTMLElement} element - Item element
     */
    removeFromSelection(path, element) {
        this.selectedPaths.delete(path);
        element.classList.remove('selected');
    }

    /**
     * Clear all selections
     */
    clearSelection() {
        this.container.querySelectorAll('.tree-item.selected').forEach(item => {
            item.classList.remove('selected');
        });
        this.selectedPaths.clear();
    }

    /**
     * Select range of items (Shift+click)
     * @param {string} start - Start path
     * @param {string} end - End path
     */
    selectRange(start, end) {
        const items = Array.from(this.container.querySelectorAll('.tree-item'));
        const startIdx = items.findIndex(item => item.dataset.path === start);
        const endIdx = items.findIndex(item => item.dataset.path === end);

        if (startIdx === -1 || endIdx === -1) return;

        const [min, max] = [Math.min(startIdx, endIdx), Math.max(startIdx, endIdx)];

        this.clearSelection();
        for (let i = min; i <= max; i++) {
            const item = items[i];
            this.addToSelection(item.dataset.path, item);
        }
    }

    /**
     * Show context menu
     * @param {number} x - X position
     * @param {number} y - Y position
     * @param {Object} entry - File/directory entry
     */
    showContextMenu(x, y, entry) {
        // Hide any existing context menu
        this.hideContextMenu();

        const menu = document.createElement('div');
        menu.className = 'context-menu';
        menu.style.left = `${x}px`;
        menu.style.top = `${y}px`;

        const options = [];

        // New File/Folder options (only when one directory is selected)
        if (this.selectedPaths.size <= 1 && entry.isDirectory) {
            options.push(
                { label: 'New File', icon: '📄', action: () => this.createNewFile(entry.path) },
                { label: 'New Folder', icon: '📁', action: () => this.createNewFolder(entry.path) },
                { type: 'separator' }
            );
        }

        // Copy, Cut, Paste
        options.push({ label: 'Copy', icon: '📋', action: () => this.copySelected() });
        options.push({ label: 'Cut', icon: '✂️', action: () => this.cutSelected() });

        if (this.clipboard.items.length > 0 && entry.isDirectory) {
            options.push({ label: 'Paste', icon: '📌', action: () => this.pasteInto(entry.path) });
        }

        options.push({ type: 'separator' });

        // Duplicate (only for single selection)
        if (this.selectedPaths.size === 1) {
            options.push({ label: 'Duplicate', icon: '📑', action: () => this.duplicateItem(entry.path, entry.name) });
        }

        // Rename (only for single selection)
        if (this.selectedPaths.size === 1) {
            options.push({ label: 'Rename', icon: '✏️', action: () => this.renameItem(entry.path, entry.name) });
        }

        // Delete
        options.push({ label: 'Delete', icon: '🗑️', action: () => this.deleteSelected() });

        options.push({ type: 'separator' });

        // Copy Path options
        if (this.selectedPaths.size === 1) {
            options.push({ label: 'Copy Path', icon: '📝', action: () => this.copyPath(entry.path) });
            options.push({ label: 'Copy Relative Path', icon: '📝', action: () => this.copyRelativePath(entry.path) });
        }

        // Reveal in File Explorer
        if (this.selectedPaths.size === 1) {
            options.push({ label: 'Reveal in File Explorer', icon: '🗂️', action: () => this.revealInFileExplorer(entry.path) });
        }

        if (entry.isDirectory) {
            options.push({ type: 'separator' });
            options.push({ label: 'Open this folder in Swarm', icon: '📂', action: () => this.openDirectory(entry.path) });
            options.push({ label: 'Go to parent directory', icon: '⬆️', action: () => this.openParentDirectory() });
            options.push({ type: 'separator' });
            options.push({ label: 'Refresh', icon: '🔄', action: () => this.refreshCurrentDirectory() });
        }

        options.forEach(opt => {
            if (opt.type === 'separator') {
                const separator = document.createElement('div');
                separator.className = 'context-menu-separator';
                menu.appendChild(separator);
            } else {
                const item = document.createElement('div');
                item.className = 'context-menu-item';
                item.innerHTML = `<span class="context-menu-icon">${opt.icon}</span><span>${opt.label}</span>`;
                item.addEventListener('click', () => {
                    opt.action();
                    this.hideContextMenu();
                });
                menu.appendChild(item);
            }
        });

        document.body.appendChild(menu);
        this.contextMenu = menu;

        // Close on outside click
        const closeHandler = (e) => {
            if (!menu.contains(e.target)) {
                this.hideContextMenu();
                document.removeEventListener('click', closeHandler);
            }
        };
        setTimeout(() => document.addEventListener('click', closeHandler), 0);
    }

    /**
     * Hide context menu
     */
    hideContextMenu() {
        if (this.contextMenu) {
            this.contextMenu.remove();
            this.contextMenu = null;
        }
    }

    /**
     * Show input dialog
     * @param {string} title - Dialog title
     * @param {string} label - Input label
     * @param {string} placeholder - Input placeholder
     * @returns {Promise<string|null>} - User input or null if cancelled
     */
    async showInputDialog(title, label, placeholder = '') {
        return new Promise((resolve) => {
            const dialogContainer = document.createElement('div');
            dialogContainer.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background-color: rgba(0, 0, 0, 0.7);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10000;
            `;

            const dialog = document.createElement('div');
            dialog.style.cssText = `
                background-color: #2d2d2d;
                border: 1px solid rgba(255, 255, 255, 0.2);
                border-radius: 6px;
                padding: 20px;
                min-width: 400px;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
            `;

            const titleElement = document.createElement('h3');
            titleElement.textContent = title;
            titleElement.style.cssText = 'margin: 0 0 12px 0; color: #ffffff;';

            const labelElement = document.createElement('label');
            labelElement.textContent = label;
            labelElement.style.cssText = 'display: block; margin-bottom: 8px; color: #cccccc; font-weight: 500;';

            const input = document.createElement('input');
            input.type = 'text';
            input.placeholder = placeholder;
            input.style.cssText = `
                width: 100%;
                padding: 8px 12px;
                border: 1px solid rgba(255, 255, 255, 0.3);
                border-radius: 4px;
                background-color: #1e1e1e;
                color: #ffffff;
                font-size: 14px;
                margin-bottom: 16px;
                box-sizing: border-box;
            `;

            const buttonContainer = document.createElement('div');
            buttonContainer.style.cssText = 'display: flex; gap: 8px; justify-content: flex-end;';

            const cancelButton = document.createElement('button');
            cancelButton.textContent = 'Cancel';
            cancelButton.style.cssText = `
                padding: 8px 16px;
                border: 1px solid rgba(255, 255, 255, 0.3);
                border-radius: 4px;
                background-color: transparent;
                color: #ffffff;
                cursor: pointer;
                font-size: 14px;
            `;

            const createButton = document.createElement('button');
            createButton.textContent = 'Create';
            createButton.style.cssText = `
                padding: 8px 16px;
                border: none;
                border-radius: 4px;
                background-color: #0078d4;
                color: #ffffff;
                cursor: pointer;
                font-size: 14px;
            `;

            const cleanup = () => {
                document.body.removeChild(dialogContainer);
            };

            // Event handlers
            cancelButton.addEventListener('click', () => {
                cleanup();
                resolve(null);
            });

            createButton.addEventListener('click', () => {
                const value = input.value.trim();
                if (value) {
                    cleanup();
                    resolve(value);
                }
            });

            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    const value = input.value.trim();
                    if (value) {
                        cleanup();
                        resolve(value);
                    }
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    cleanup();
                    resolve(null);
                }
            });

            // Close on backdrop click
            dialogContainer.addEventListener('click', (e) => {
                if (e.target === dialogContainer) {
                    cleanup();
                    resolve(null);
                }
            });

            // Build dialog
            buttonContainer.appendChild(cancelButton);
            buttonContainer.appendChild(createButton);
            dialog.appendChild(titleElement);
            dialog.appendChild(labelElement);
            dialog.appendChild(input);
            dialog.appendChild(buttonContainer);
            dialogContainer.appendChild(dialog);
            document.body.appendChild(dialogContainer);

            // Focus input
            input.focus();
        });
    }

    /**
     * Create new file
     * @param {string} dirPath - Directory path
     */
    async createNewFile(dirPath) {
        const fileName = await this.showInputDialog('New File', 'File name:', 'example.txt');
        if (!fileName) return;

        const filePath = pathUtils.join(dirPath, fileName);
        const result = await this.fs.createFile(filePath);

        if (result.success) {
            await this.refreshCurrentDirectory();
        } else {
            alert(`Failed to create file: ${result.error}`);
        }
    }

    /**
     * Create new folder
     * @param {string} dirPath - Directory path
     */
    async createNewFolder(dirPath) {
        const folderName = await this.showInputDialog('New Folder', 'Folder name:', 'new-folder');
        if (!folderName) return;

        const folderPath = pathUtils.join(dirPath, folderName);
        const result = await this.fs.createFolder(folderPath);

        if (result.success) {
            await this.refreshCurrentDirectory();
        } else {
            alert(`Failed to create folder: ${result.error}`);
        }
    }

    /**
     * Rename item
     * @param {string} oldPath - Current path
     * @param {string} oldName - Current name
     */
    async renameItem(oldPath, oldName) {
        const newName = prompt('Enter new name:', oldName);
        if (!newName || newName === oldName) return;

        const parentPath = pathUtils.dirname(oldPath);
        const newPath = pathUtils.join(parentPath, newName);

        const result = await this.fs.renameItem(oldPath, newPath);

        if (result.success) {
            await this.refreshCurrentDirectory();
        } else {
            alert(`Failed to rename: ${result.error}`);
        }
    }

    /**
     * Delete selected items
     */
    async deleteSelected() {
        if (this.selectedPaths.size === 0) return;

        const count = this.selectedPaths.size;
        const confirmed = confirm(`Delete ${count} item(s)?`);
        if (!confirmed) return;

        for (const itemPath of this.selectedPaths) {
            const result = await this.fs.deleteItem(itemPath);
            if (!result.success) {
                alert(`Failed to delete ${itemPath}: ${result.error}`);
            }
        }

        this.clearSelection();
        await this.refreshCurrentDirectory();
    }

    /**
     * Copy selected items to clipboard
     */
    copySelected() {
        if (this.selectedPaths.size === 0) return;

        this.clipboard = {
            items: Array.from(this.selectedPaths),
            operation: 'copy'
        };

        logger.debug('fileSystem', 'Copied', this.clipboard.items.length, 'items to clipboard');
    }

    /**
     * Cut selected items to clipboard
     */
    cutSelected() {
        if (this.selectedPaths.size === 0) return;

        this.clipboard = {
            items: Array.from(this.selectedPaths),
            operation: 'cut'
        };

        // Add visual feedback for cut items
        this.container.querySelectorAll('.tree-item.cut').forEach(item => {
            item.classList.remove('cut');
        });

        this.selectedPaths.forEach(path => {
            const item = this.container.querySelector(`.tree-item[data-path="${path}"]`);
            if (item) item.classList.add('cut');
        });

        logger.debug('fileSystem', 'Cut', this.clipboard.items.length, 'items to clipboard');
    }

    /**
     * Paste items from clipboard into target directory
     * @param {string} targetDir - Target directory path
     */
    async pasteInto(targetDir) {
        if (this.clipboard.items.length === 0) return;

        const { items, operation } = this.clipboard;

        for (const sourcePath of items) {
            const itemName = pathUtils.basename(sourcePath);
            let destPath = pathUtils.join(targetDir, itemName);

            // Handle name conflicts
            if (await this.fs.pathExists(destPath)) {
                destPath = await this.getUniqueFilename(destPath);
            }

            if (operation === 'copy') {
                // Copy the item
                const result = await this.fs.copyItemRecursive(sourcePath, destPath);
                if (!result.success) {
                    alert(`Failed to copy ${itemName}: ${result.error}`);
                }
            } else if (operation === 'cut') {
                // Move the item
                const result = await this.fs.renameItem(sourcePath, destPath);
                if (!result.success) {
                    alert(`Failed to move ${itemName}: ${result.error}`);
                }
            }
        }

        // Clear cut visual feedback
        this.container.querySelectorAll('.tree-item.cut').forEach(item => {
            item.classList.remove('cut');
        });

        // Clear clipboard after paste (especially for cut operation)
        if (operation === 'cut') {
            this.clipboard = { items: [], operation: null };
        }

        await this.refreshCurrentDirectory();
    }

    /**
     * Get unique filename by adding (copy), (copy 2), etc.
     * @param {string} filePath - Original file path
     * @returns {Promise<string>} Unique file path
     */
    async getUniqueFilename(filePath) {
        const dir = pathUtils.dirname(filePath);
        const name = pathUtils.basename(filePath);
        const ext = pathUtils.extname(name);
        const baseName = ext ? name.slice(0, -ext.length) : name;

        let counter = 1;
        let newPath = filePath;

        while (await this.fs.pathExists(newPath)) {
            const suffix = counter === 1 ? ' copy' : ` copy ${counter}`;
            const newName = ext ? `${baseName}${suffix}${ext}` : `${baseName}${suffix}`;
            newPath = pathUtils.join(dir, newName);
            counter++;
        }

        return newPath;
    }

    /**
     * Duplicate selected item
     * @param {string} itemPath - Item path
     * @param {string} itemName - Item name
     */
    async duplicateItem(itemPath, itemName) {
        const dir = pathUtils.dirname(itemPath);
        const ext = pathUtils.extname(itemName);
        const baseName = ext ? itemName.slice(0, -ext.length) : itemName;

        let destPath = pathUtils.join(dir, ext ? `${baseName} copy${ext}` : `${baseName} copy`);

        // Handle conflicts
        if (await this.fs.pathExists(destPath)) {
            destPath = await this.getUniqueFilename(destPath);
        }

        const result = await this.fs.copyItemRecursive(itemPath, destPath);

        if (result.success) {
            await this.refreshCurrentDirectory();
        } else {
            alert(`Failed to duplicate: ${result.error}`);
        }
    }

    /**
     * Copy full path to clipboard
     * @param {string} itemPath - Item path
     */
    async copyPath(itemPath) {
        const result = await this.fs.writeToClipboard(itemPath);
        if (result.success) {
            logger.debug('fileSystem', 'Copied path to clipboard:', itemPath);
        } else {
            alert(`Failed to copy path: ${result.error}`);
        }
    }

    /**
     * Copy relative path to clipboard
     * @param {string} itemPath - Item path
     */
    async copyRelativePath(itemPath) {
        if (!this.currentPath) return;

        // Calculate relative path from current directory
        const relativePath = itemPath.replace(this.currentPath + '/', '');
        const result = await this.fs.writeToClipboard(relativePath);

        if (result.success) {
            logger.debug('fileSystem', 'Copied relative path to clipboard:', relativePath);
        } else {
            alert(`Failed to copy relative path: ${result.error}`);
        }
    }

    /**
     * Reveal item in system file explorer
     * @param {string} itemPath - Item path
     */
    async revealInFileExplorer(itemPath) {
        const result = await this.fs.revealInExplorer(itemPath);
        if (!result.success) {
            alert(`Failed to reveal in file explorer: ${result.error}`);
        }
    }

    /**
     * Collapse all expanded directories
     */
    collapseAll() {
        const expandedItems = this.container.querySelectorAll('.tree-item.directory.expanded');
        expandedItems.forEach(item => {
            const path = item.dataset.path;
            this.collapseDirectory(path, item);
        });
    }

    /**
     * Update file modification indicator in the tree
     * @param {string} filePath - Path to the file
     * @param {boolean} isModified - Whether the file is modified
     */
    updateFileModificationIndicator(filePath, isModified) {
        // Find the tree item for this file
        const treeItem = this.container.querySelector(`.tree-item[data-path="${filePath}"]`);

        if (!treeItem) {
            // File not currently visible in tree
            return;
        }

        const modIndicator = treeItem.querySelector('.tree-item-mod-indicator');

        if (isModified) {
            // Add modified class and show indicator
            treeItem.classList.add('modified');
            if (modIndicator) {
                modIndicator.style.display = 'inline';
            }
        } else {
            // Remove modified class and hide indicator
            treeItem.classList.remove('modified');
            if (modIndicator) {
                modIndicator.style.display = 'none';
            }
        }
    }

    /**
     * Cleanup
     */
    destroy() {
        this.container.innerHTML = '';
        this.expandedPaths.clear();
        this.selectedPaths.clear();
        this.hideContextMenu();

        // Stop change polling
        this.stopChangePolling();

        eventBus.off('explorer:open-folder');
        eventBus.off('explorer:refresh');
    }
}

module.exports = FileExplorer;

/**
 * StatusBar - VS Code-style bottom status bar
 *
 * Displays:
 * - Left: Current file path, line/column info
 * - Right: Quick action buttons (Quick Open, Search, Find & Replace)
 *
 * Usage:
 *   const statusBar = new StatusBar();
 */

const eventBus = require('../modules/EventBus');

class StatusBar {
    constructor() {
        this.bar = null;
        this.leftSection = null;
        this.rightSection = null;
        this.currentFile = null;
        this.lineInfo = null;

        this.render();
        this.setupEventListeners();
    }

    /**
     * Render the status bar
     */
    render() {
        // Create status bar container
        this.bar = document.createElement('div');
        this.bar.className = 'status-bar';
        this.bar.style.display = 'none'; // Hide initially on welcome screen

        // Left section - file info
        this.leftSection = document.createElement('div');
        this.leftSection.className = 'status-bar-left';

        const fileInfo = document.createElement('span');
        fileInfo.className = 'status-bar-file-info';
        fileInfo.textContent = 'No file open';

        this.leftSection.appendChild(fileInfo);

        // Right section - action buttons
        this.rightSection = document.createElement('div');
        this.rightSection.className = 'status-bar-right';

        // Quick Open button
        const quickOpenBtn = document.createElement('button');
        quickOpenBtn.className = 'status-bar-btn';
        quickOpenBtn.title = 'Quick Open (Ctrl+P)';
        const quickOpenIcon = document.createElement('img');
        quickOpenIcon.src = 'assets/icons/search.svg';
        quickOpenIcon.alt = 'Quick Open';
        quickOpenIcon.className = 'status-bar-icon';
        const quickOpenText = document.createElement('span');
        quickOpenText.textContent = 'Quick Open';
        quickOpenBtn.appendChild(quickOpenIcon);
        quickOpenBtn.appendChild(quickOpenText);
        quickOpenBtn.addEventListener('click', () => {
            eventBus.emit('quickopen:show');
        });

        // Global Search button
        const searchBtn = document.createElement('button');
        searchBtn.className = 'status-bar-btn';
        searchBtn.title = 'Search in Files (Ctrl+Shift+F)';
        const searchIcon = document.createElement('img');
        searchIcon.src = 'assets/icons/folder.svg';
        searchIcon.alt = 'Search';
        searchIcon.className = 'status-bar-icon';
        const searchText = document.createElement('span');
        searchText.textContent = 'Search';
        searchBtn.appendChild(searchIcon);
        searchBtn.appendChild(searchText);
        searchBtn.addEventListener('click', () => {
            eventBus.emit('globalsearch:show');
        });

        // Find & Replace button
        const replaceBtn = document.createElement('button');
        replaceBtn.className = 'status-bar-btn';
        replaceBtn.title = 'Find & Replace (Ctrl+Shift+H)';
        const replaceIcon = document.createElement('img');
        replaceIcon.src = 'assets/icons/find-replace.svg';
        replaceIcon.alt = 'Replace';
        replaceIcon.className = 'status-bar-icon';
        const replaceText = document.createElement('span');
        replaceText.textContent = 'Replace';
        replaceBtn.appendChild(replaceIcon);
        replaceBtn.appendChild(replaceText);
        replaceBtn.addEventListener('click', () => {
            eventBus.emit('findreplace:show');
        });

        this.rightSection.appendChild(quickOpenBtn);
        this.rightSection.appendChild(searchBtn);
        this.rightSection.appendChild(replaceBtn);

        // Assemble status bar
        this.bar.appendChild(this.leftSection);
        this.bar.appendChild(this.rightSection);

        // Append to body
        document.body.appendChild(this.bar);
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Show status bar when directory is opened (IDE becomes active)
        eventBus.on('explorer:directory-opened', () => {
            this.show();
        });

        // Listen for file opened events
        eventBus.on('file:opened', (data) => {
            this.updateFileInfo(data.path);
        });

        // Listen for cursor position changes (if you implement this in TextEditor)
        eventBus.on('editor:cursor-changed', (data) => {
            this.updateLineInfo(data.line, data.column);
        });
    }

    /**
     * Update file info display
     * @param {string} filePath - Current file path
     */
    updateFileInfo(filePath) {
        this.currentFile = filePath;
        const fileInfo = this.leftSection.querySelector('.status-bar-file-info');

        if (filePath) {
            const fileName = filePath.split('/').pop();
            fileInfo.textContent = fileName;
            fileInfo.title = filePath;
        } else {
            fileInfo.textContent = 'No file open';
            fileInfo.title = '';
        }
    }

    /**
     * Update line/column info
     * @param {number} line - Line number (1-based)
     * @param {number} column - Column number (1-based)
     */
    updateLineInfo(line, column) {
        this.lineInfo = { line, column };

        // Check if line info span exists
        let lineInfoSpan = this.leftSection.querySelector('.status-bar-line-info');

        if (!lineInfoSpan) {
            lineInfoSpan = document.createElement('span');
            lineInfoSpan.className = 'status-bar-line-info';
            this.leftSection.appendChild(lineInfoSpan);
        }

        lineInfoSpan.textContent = ` Ln ${line}, Col ${column}`;
    }

    /**
     * Show the status bar
     */
    show() {
        if (this.bar) {
            this.bar.style.display = 'flex';
        }
    }

    /**
     * Hide the status bar
     */
    hide() {
        if (this.bar) {
            this.bar.style.display = 'none';
        }
    }

    /**
     * Cleanup
     */
    destroy() {
        if (this.bar) {
            this.bar.remove();
        }
        eventBus.off('explorer:directory-opened');
        eventBus.off('file:opened');
        eventBus.off('editor:cursor-changed');
    }
}

// Export singleton instance
const statusBar = new StatusBar();
module.exports = statusBar;

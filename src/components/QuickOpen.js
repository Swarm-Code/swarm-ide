/**
 * QuickOpen - Quick file finder with fuzzy matching (Ctrl+P)
 *
 * Provides quick file navigation:
 * - Fuzzy search across all files in workspace
 * - Keyboard navigation (up/down, enter)
 * - Instant results as you type
 *
 * Usage:
 *   const quickOpen = new QuickOpen(fileSystemService);
 *   quickOpen.show();
 */

const eventBus = require('../modules/EventBus');
const pathUtils = require('../utils/PathUtils');

class QuickOpen {
    constructor(fileSystemService) {
        this.fs = fileSystemService;
        this.isOpen = false;
        this.panel = null;
        this.allFiles = [];
        this.filteredFiles = [];
        this.selectedIndex = 0;
        this.currentPath = null;
    }

    /**
     * Show the quick open panel
     */
    async show() {
        if (this.isOpen) return;

        // Get current workspace directory
        this.currentPath = await this.getCurrentWorkspaceDir();
        if (!this.currentPath) {
            console.warn('[QuickOpen] No workspace directory open');
            return;
        }

        // Index all files in workspace
        await this.indexFiles();

        this.render();
        this.isOpen = true;
    }

    /**
     * Get current workspace directory
     */
    async getCurrentWorkspaceDir() {
        // Try to get from state or config
        const stateManager = require('../modules/StateManager');
        return stateManager.get('currentDirectory');
    }

    /**
     * Index all files in workspace
     */
    async indexFiles() {
        console.log('[QuickOpen] Indexing files in:', this.currentPath);
        this.allFiles = [];
        await this.scanDirectory(this.currentPath);
        console.log('[QuickOpen] Found', this.allFiles.length, 'files');
    }

    /**
     * Recursively scan directory for files
     */
    async scanDirectory(dirPath, relativePath = '') {
        try {
            const entries = await this.fs.readDirectory(dirPath);
            if (!entries || entries.length === 0) return;

            for (const entry of entries) {
                // Skip hidden files and common ignore patterns
                if (entry.name.startsWith('.')) continue;
                if (entry.name === 'node_modules') continue;
                if (entry.name === 'dist') continue;
                if (entry.name === 'build') continue;

                const entryRelPath = relativePath ? `${relativePath}/${entry.name}` : entry.name;

                if (entry.isDirectory) {
                    // Recursively scan subdirectories
                    await this.scanDirectory(entry.path, entryRelPath);
                } else {
                    // Add file to index
                    this.allFiles.push({
                        name: entry.name,
                        path: entry.path,
                        relativePath: entryRelPath
                    });
                }
            }
        } catch (error) {
            console.error('[QuickOpen] Error scanning directory:', error);
        }
    }

    /**
     * Render the quick open panel
     */
    render() {
        this.panel = document.createElement('div');
        this.panel.className = 'quick-open-overlay';

        const modal = document.createElement('div');
        modal.className = 'quick-open-modal';

        // Search input
        const searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.className = 'quick-open-input';
        searchInput.placeholder = 'Search files...';
        searchInput.autofocus = true;

        // Results container
        const resultsContainer = document.createElement('div');
        resultsContainer.className = 'quick-open-results';

        modal.appendChild(searchInput);
        modal.appendChild(resultsContainer);
        this.panel.appendChild(modal);
        document.body.appendChild(this.panel);

        // Focus input
        setTimeout(() => searchInput.focus(), 10);

        // Setup event listeners
        this.setupEventListeners(searchInput, resultsContainer);

        // Show initial results
        this.updateResults('', resultsContainer);
    }

    /**
     * Setup event listeners
     */
    setupEventListeners(searchInput, resultsContainer) {
        // Search on input
        searchInput.addEventListener('input', (e) => {
            this.selectedIndex = 0;
            this.updateResults(e.target.value, resultsContainer);
        });

        // Keyboard navigation
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                this.close();
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                this.selectedIndex = Math.min(this.selectedIndex + 1, this.filteredFiles.length - 1);
                this.renderResults(resultsContainer);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
                this.renderResults(resultsContainer);
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (this.filteredFiles.length > 0) {
                    this.openFile(this.filteredFiles[this.selectedIndex]);
                }
            }
        });

        // Close on overlay click
        this.panel.addEventListener('click', (e) => {
            if (e.target === this.panel) {
                this.close();
            }
        });
    }

    /**
     * Update results based on search query
     */
    updateResults(query, resultsContainer) {
        if (!query) {
            // Show all files (limited to first 50)
            this.filteredFiles = this.allFiles.slice(0, 50);
        } else {
            // Fuzzy filter
            this.filteredFiles = this.fuzzyFilter(query, this.allFiles);
        }

        this.renderResults(resultsContainer);
    }

    /**
     * Fuzzy filter files
     */
    fuzzyFilter(query, files) {
        const lowerQuery = query.toLowerCase();
        const results = [];

        for (const file of files) {
            const score = this.fuzzyMatch(lowerQuery, file.relativePath.toLowerCase());
            if (score > 0) {
                results.push({ file, score });
            }
        }

        // Sort by score (higher is better)
        results.sort((a, b) => b.score - a.score);

        // Return top 50 results
        return results.slice(0, 50).map(r => r.file);
    }

    /**
     * Fuzzy match algorithm
     * Returns score (0 = no match, higher = better match)
     */
    fuzzyMatch(query, text) {
        let score = 0;
        let queryIndex = 0;
        let lastMatchIndex = -1;

        for (let i = 0; i < text.length && queryIndex < query.length; i++) {
            if (text[i] === query[queryIndex]) {
                // Character match
                score += 10;

                // Bonus for consecutive matches
                if (i === lastMatchIndex + 1) {
                    score += 5;
                }

                // Bonus for match after separator
                if (i > 0 && (text[i - 1] === '/' || text[i - 1] === '-' || text[i - 1] === '_')) {
                    score += 3;
                }

                lastMatchIndex = i;
                queryIndex++;
            }
        }

        // If not all query characters matched, no match
        if (queryIndex < query.length) {
            return 0;
        }

        return score;
    }

    /**
     * Render results list
     */
    renderResults(resultsContainer) {
        resultsContainer.innerHTML = '';

        if (this.filteredFiles.length === 0) {
            resultsContainer.innerHTML = '<div class="quick-open-no-results">No files found</div>';
            return;
        }

        this.filteredFiles.forEach((file, index) => {
            const item = document.createElement('div');
            item.className = 'quick-open-item';
            if (index === this.selectedIndex) {
                item.classList.add('selected');
            }

            // File name
            const name = document.createElement('div');
            name.className = 'quick-open-item-name';
            name.textContent = file.name;

            // File path
            const path = document.createElement('div');
            path.className = 'quick-open-item-path';
            path.textContent = file.relativePath;

            item.appendChild(name);
            item.appendChild(path);

            // Click to open
            item.addEventListener('click', () => {
                this.openFile(file);
            });

            resultsContainer.appendChild(item);
        });

        // Scroll selected item into view
        const selectedItem = resultsContainer.querySelector('.quick-open-item.selected');
        if (selectedItem) {
            selectedItem.scrollIntoView({ block: 'nearest' });
        }
    }

    /**
     * Open selected file
     */
    openFile(file) {
        console.log('[QuickOpen] Opening file:', file.path);
        eventBus.emit('file:selected', { path: file.path });
        this.close();
    }

    /**
     * Close the panel
     */
    close() {
        if (!this.isOpen || !this.panel) return;

        this.panel.remove();
        this.panel = null;
        this.isOpen = false;
        this.filteredFiles = [];
        this.selectedIndex = 0;
    }
}

// Export singleton instance
const quickOpen = new QuickOpen(require('../services/FileSystemService'));

// Listen for show event from toolbar buttons
eventBus.on('quickopen:show', () => {
    quickOpen.show();
});

module.exports = quickOpen;

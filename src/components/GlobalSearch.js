/**
 * GlobalSearch - Find in files across entire project (Ctrl+Shift+F)
 *
 * Provides project-wide search:
 * - Search all files in workspace
 * - Regex support
 * - Case sensitive toggle
 * - Results with file, line number, and preview
 * - Click to open file at line
 *
 * Usage:
 *   const globalSearch = new GlobalSearch(fileSystemService);
 *   globalSearch.show();
 */

const eventBus = require('../modules/EventBus');
const pathUtils = require('../utils/PathUtils');

class GlobalSearch {
    constructor(fileSystemService) {
        this.fs = fileSystemService;
        this.isOpen = false;
        this.panel = null;
        this.currentPath = null;
        this.searchResults = [];
    }

    /**
     * Show the global search panel
     */
    show() {
        if (this.isOpen) {
            // If already open, just focus the input
            if (this.panel) {
                const input = this.panel.querySelector('.global-search-input');
                if (input) input.focus();
            }
            return;
        }

        this.render();
        this.isOpen = true;
    }

    /**
     * Hide the panel
     */
    hide() {
        if (!this.isOpen || !this.panel) return;

        this.panel.remove();
        this.panel = null;
        this.isOpen = false;
        this.searchResults = [];
    }

    /**
     * Toggle visibility
     */
    toggle() {
        if (this.isOpen) {
            this.hide();
        } else {
            this.show();
        }
    }

    /**
     * Render the panel
     */
    render() {
        // Create side panel
        this.panel = document.createElement('div');
        this.panel.className = 'global-search-panel';

        // Header
        const header = document.createElement('div');
        header.className = 'global-search-header';

        const title = document.createElement('h3');
        title.textContent = '🔍 Search';

        const closeBtn = document.createElement('button');
        closeBtn.className = 'global-search-close';
        closeBtn.textContent = '✕';
        closeBtn.addEventListener('click', () => this.hide());

        header.appendChild(title);
        header.appendChild(closeBtn);

        // Search input container
        const inputContainer = document.createElement('div');
        inputContainer.className = 'global-search-input-container';

        const searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.className = 'global-search-input';
        searchInput.placeholder = 'Search in files...';

        inputContainer.appendChild(searchInput);

        // Options
        const optionsContainer = document.createElement('div');
        optionsContainer.className = 'global-search-options';

        const caseCheckbox = document.createElement('label');
        caseCheckbox.innerHTML = '<input type="checkbox" id="search-case-sensitive"> Match Case';

        const regexCheckbox = document.createElement('label');
        regexCheckbox.innerHTML = '<input type="checkbox" id="search-regex"> Use Regex';

        optionsContainer.appendChild(caseCheckbox);
        optionsContainer.appendChild(regexCheckbox);

        // Results container
        const resultsContainer = document.createElement('div');
        resultsContainer.className = 'global-search-results';
        resultsContainer.innerHTML = '<div class="global-search-empty">Enter search query...</div>';

        // Assemble panel
        this.panel.appendChild(header);
        this.panel.appendChild(inputContainer);
        this.panel.appendChild(optionsContainer);
        this.panel.appendChild(resultsContainer);

        // Insert panel after sidebar
        const sidebar = document.querySelector('.sidebar');
        if (sidebar) {
            sidebar.after(this.panel);
        } else {
            document.body.appendChild(this.panel);
        }

        // Focus input
        setTimeout(() => searchInput.focus(), 10);

        // Setup event listeners
        this.setupEventListeners(searchInput, resultsContainer);
    }

    /**
     * Setup event listeners
     */
    setupEventListeners(searchInput, resultsContainer) {
        let searchTimeout;

        searchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            const query = e.target.value.trim();

            if (!query) {
                resultsContainer.innerHTML = '<div class="global-search-empty">Enter search query...</div>';
                return;
            }

            // Debounce search
            searchTimeout = setTimeout(() => {
                this.performSearch(query, resultsContainer);
            }, 300);
        });

        // Trigger search on Enter
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                clearTimeout(searchTimeout);
                const query = e.target.value.trim();
                if (query) {
                    this.performSearch(query, resultsContainer);
                }
            }
        });

        // Re-search when options change
        const caseCheckbox = this.panel.querySelector('#search-case-sensitive');
        const regexCheckbox = this.panel.querySelector('#search-regex');

        [caseCheckbox, regexCheckbox].forEach(checkbox => {
            checkbox.addEventListener('change', () => {
                const query = searchInput.value.trim();
                if (query) {
                    this.performSearch(query, resultsContainer);
                }
            });
        });
    }

    /**
     * Perform search
     */
    async performSearch(query, resultsContainer) {
        console.log('[GlobalSearch] Searching for:', query);

        // Show loading state
        resultsContainer.innerHTML = '<div class="global-search-loading">Searching...</div>';

        // Get current workspace directory
        const stateManager = require('../modules/StateManager');
        this.currentPath = stateManager.get('currentDirectory');

        if (!this.currentPath) {
            resultsContainer.innerHTML = '<div class="global-search-error">No workspace open</div>';
            return;
        }

        // Get options
        const caseSensitive = this.panel.querySelector('#search-case-sensitive').checked;
        const useRegex = this.panel.querySelector('#search-regex').checked;

        try {
            // Search using FileSystemService grep
            const result = await this.fs.searchInFiles(this.currentPath, query, {
                caseSensitive,
                regex: useRegex,
                maxResults: 500
            });

            if (!result.success) {
                resultsContainer.innerHTML = `<div class="global-search-error">Error: ${result.error}</div>`;
                return;
            }

            this.searchResults = result.matches || [];

            console.log('[GlobalSearch] Found', this.searchResults.length, 'matches');

            this.renderResults(resultsContainer, query);
        } catch (error) {
            console.error('[GlobalSearch] Search error:', error);
            resultsContainer.innerHTML = `<div class="global-search-error">Search failed: ${error.message}</div>`;
        }
    }

    /**
     * Render search results
     */
    renderResults(resultsContainer, query) {
        resultsContainer.innerHTML = '';

        if (this.searchResults.length === 0) {
            resultsContainer.innerHTML = `<div class="global-search-empty">No results found for "${this.escapeHtml(query)}"</div>`;
            return;
        }

        // Group results by file
        const fileGroups = {};
        this.searchResults.forEach(result => {
            if (!fileGroups[result.file]) {
                fileGroups[result.file] = [];
            }
            fileGroups[result.file].push(result);
        });

        // Render file groups
        Object.keys(fileGroups).forEach(file => {
            const matches = fileGroups[file];

            // File header
            const fileHeader = document.createElement('div');
            fileHeader.className = 'global-search-file';

            const fileName = pathUtils.basename(file);
            const relativePath = file.replace(this.currentPath + '/', '');

            fileHeader.innerHTML = `
                <span class="global-search-file-name">${this.escapeHtml(fileName)}</span>
                <span class="global-search-file-path">${this.escapeHtml(relativePath)}</span>
                <span class="global-search-file-count">${matches.length} ${matches.length === 1 ? 'match' : 'matches'}</span>
            `;

            resultsContainer.appendChild(fileHeader);

            // Render matches
            matches.forEach(match => {
                const matchItem = document.createElement('div');
                matchItem.className = 'global-search-match';

                // Highlight query in match text
                const highlightedText = this.highlightMatch(match.text, query);

                matchItem.innerHTML = `
                    <span class="global-search-match-line">${match.line}</span>
                    <span class="global-search-match-text">${highlightedText}</span>
                `;

                // Click to open file at line
                matchItem.addEventListener('click', () => {
                    console.log('[GlobalSearch] Opening file:', match.file, 'at line', match.line);
                    eventBus.emit('file:selected', { path: match.file, line: match.line });
                });

                resultsContainer.appendChild(matchItem);
            });
        });
    }

    /**
     * Highlight search query in match text
     */
    highlightMatch(text, query) {
        const escaped = this.escapeHtml(text);
        const regex = new RegExp(`(${this.escapeRegex(query)})`, 'gi');
        return escaped.replace(regex, '<mark>$1</mark>');
    }

    /**
     * Escape HTML
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Escape regex special characters
     */
    escapeRegex(str) {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
}

// Export singleton instance
const globalSearch = new GlobalSearch(require('../services/FileSystemService'));

// Listen for show event from toolbar buttons
eventBus.on('globalsearch:show', () => {
    globalSearch.show();
});

module.exports = globalSearch;

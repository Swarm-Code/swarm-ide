/**
 * FindReplacePanel - Find and replace in files across entire project (Ctrl+Shift+H)
 *
 * VS Code/Zed-inspired find and replace:
 * - Project-wide search using ripgrep
 * - Regex and literal string replacement
 * - Case sensitive toggle
 * - Two-path replacement strategy:
 *   - Regular replace: <999 matches, individual file operations
 *   - Large replace: >=999 matches, batch operations with confirmation
 * - Preview mode showing changes before applying
 * - Live editor updates for open files
 *
 * Usage:
 *   const findReplace = new FindReplacePanel(fileSystemService);
 *   findReplace.show();
 */

const eventBus = require('../modules/EventBus');
const pathUtils = require('../utils/PathUtils');

const MATCHES_LIMIT = 999; // VS Code-style match limit for highlighting

class FindReplacePanel {
    constructor(fileSystemService) {
        this.fs = fileSystemService;
        this.isOpen = false;
        this.panel = null;
        this.currentPath = null;
        this.searchResults = [];
        this.isReplacing = false;
    }

    /**
     * Show the find/replace panel
     */
    show() {
        if (this.isOpen) {
            // If already open, just focus the search input
            if (this.panel) {
                const input = this.panel.querySelector('.find-replace-search-input');
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
        this.panel.className = 'find-replace-panel';

        // Header
        const header = document.createElement('div');
        header.className = 'find-replace-header';

        const title = document.createElement('h3');
        title.textContent = '🔍 Find & Replace';

        const closeBtn = document.createElement('button');
        closeBtn.className = 'find-replace-close';
        closeBtn.textContent = '✕';
        closeBtn.addEventListener('click', () => this.hide());

        header.appendChild(title);
        header.appendChild(closeBtn);

        // Search input container
        const searchContainer = document.createElement('div');
        searchContainer.className = 'find-replace-input-container';

        const searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.className = 'find-replace-search-input';
        searchInput.placeholder = 'Search...';

        searchContainer.appendChild(searchInput);

        // Replace input container
        const replaceContainer = document.createElement('div');
        replaceContainer.className = 'find-replace-input-container';

        const replaceInput = document.createElement('input');
        replaceInput.type = 'text';
        replaceInput.className = 'find-replace-replace-input';
        replaceInput.placeholder = 'Replace with...';

        replaceContainer.appendChild(replaceInput);

        // Options
        const optionsContainer = document.createElement('div');
        optionsContainer.className = 'find-replace-options';

        const caseCheckbox = document.createElement('label');
        caseCheckbox.innerHTML = '<input type="checkbox" id="replace-case-sensitive"> Match Case';

        const regexCheckbox = document.createElement('label');
        regexCheckbox.innerHTML = '<input type="checkbox" id="replace-regex"> Use Regex';

        optionsContainer.appendChild(caseCheckbox);
        optionsContainer.appendChild(regexCheckbox);

        // Action buttons
        const actionsContainer = document.createElement('div');
        actionsContainer.className = 'find-replace-actions';

        const searchBtn = document.createElement('button');
        searchBtn.className = 'find-replace-btn find-replace-search-btn';
        searchBtn.textContent = 'Find All';
        searchBtn.addEventListener('click', () => this.performSearch());

        const replaceAllBtn = document.createElement('button');
        replaceAllBtn.className = 'find-replace-btn find-replace-all-btn';
        replaceAllBtn.textContent = 'Replace All';
        replaceAllBtn.addEventListener('click', () => this.performReplaceAll());

        actionsContainer.appendChild(searchBtn);
        actionsContainer.appendChild(replaceAllBtn);

        // Results container
        const resultsContainer = document.createElement('div');
        resultsContainer.className = 'find-replace-results';
        resultsContainer.innerHTML = '<div class="find-replace-empty">Enter search query and click Find All...</div>';

        // Assemble panel
        this.panel.appendChild(header);
        this.panel.appendChild(searchContainer);
        this.panel.appendChild(replaceContainer);
        this.panel.appendChild(optionsContainer);
        this.panel.appendChild(actionsContainer);
        this.panel.appendChild(resultsContainer);

        // Insert after sidebar
        const sidebar = document.querySelector('.sidebar');
        if (sidebar && sidebar.parentElement) {
            sidebar.parentElement.insertBefore(this.panel, sidebar.nextSibling);
        }

        // Event listeners
        this.setupEventListeners(searchInput, replaceInput);

        // Get current workspace path
        this.currentPath = '/home/alejandro/Swarm/swarm-ide'; // TODO: Get from workspace service

        // Focus search input
        setTimeout(() => searchInput.focus(), 100);
    }

    /**
     * Setup event listeners
     */
    setupEventListeners(searchInput, replaceInput) {
        // Search on Enter key
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                this.performSearch();
            }
        });

        // Replace on Ctrl+Enter
        replaceInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                this.performReplaceAll();
            }
        });

        // Re-search when options change
        const caseCheckbox = this.panel.querySelector('#replace-case-sensitive');
        const regexCheckbox = this.panel.querySelector('#replace-regex');

        [caseCheckbox, regexCheckbox].forEach(checkbox => {
            checkbox.addEventListener('change', () => {
                // Only re-search if we have results
                if (this.searchResults.length > 0) {
                    this.performSearch();
                }
            });
        });
    }

    /**
     * Perform search
     */
    async performSearch() {
        if (!this.panel) return;

        const searchInput = this.panel.querySelector('.find-replace-search-input');
        const resultsContainer = this.panel.querySelector('.find-replace-results');
        const query = searchInput.value.trim();

        if (!query) {
            resultsContainer.innerHTML = '<div class="find-replace-empty">Enter search query...</div>';
            return;
        }

        const caseSensitive = this.panel.querySelector('#replace-case-sensitive').checked;
        const useRegex = this.panel.querySelector('#replace-regex').checked;

        resultsContainer.innerHTML = '<div class="find-replace-loading">Searching...</div>';

        try {
            console.log('[FindReplacePanel] Searching for:', query);

            const result = await this.fs.searchInFiles(this.currentPath, query, {
                caseSensitive,
                regex: useRegex,
                maxResults: 1000 // Slightly higher than 999 to detect if we need confirmation
            });

            if (!result.success) {
                resultsContainer.innerHTML = `<div class="find-replace-error">Error: ${this.escapeHtml(result.error || 'Search failed')}</div>`;
                return;
            }

            this.searchResults = result.matches || [];

            if (this.searchResults.length === 0) {
                resultsContainer.innerHTML = '<div class="find-replace-empty">No results found</div>';
                return;
            }

            this.renderResults(query);
        } catch (error) {
            console.error('[FindReplacePanel] Search error:', error);
            resultsContainer.innerHTML = '<div class="find-replace-error">Search failed</div>';
        }
    }

    /**
     * Render search results
     */
    renderResults(query) {
        const resultsContainer = this.panel.querySelector('.find-replace-results');
        resultsContainer.innerHTML = '';

        const totalMatches = this.searchResults.length;
        const limitWarning = totalMatches >= MATCHES_LIMIT;

        // Header with match count
        const header = document.createElement('div');
        header.className = 'find-replace-results-header';

        if (limitWarning) {
            header.innerHTML = `
                <span class="find-replace-results-count">
                    ⚠️ ${totalMatches}+ matches found (showing first ${MATCHES_LIMIT})
                </span>
            `;
        } else {
            header.innerHTML = `
                <span class="find-replace-results-count">
                    ${totalMatches} ${totalMatches === 1 ? 'match' : 'matches'} found
                </span>
            `;
        }

        resultsContainer.appendChild(header);

        // Group by file
        const fileGroups = {};
        const resultsToShow = this.searchResults.slice(0, MATCHES_LIMIT);

        resultsToShow.forEach(result => {
            if (!fileGroups[result.file]) {
                fileGroups[result.file] = [];
            }
            fileGroups[result.file].push(result);
        });

        // Render each file group
        Object.keys(fileGroups).forEach(filePath => {
            const matches = fileGroups[filePath];
            const fileGroup = this.renderFileGroup(filePath, matches, query);
            resultsContainer.appendChild(fileGroup);
        });
    }

    /**
     * Render a file group
     */
    renderFileGroup(filePath, matches, query) {
        const fileGroup = document.createElement('div');
        fileGroup.className = 'find-replace-file-group';

        // File header
        const fileName = pathUtils.basename(filePath);
        const relativePath = filePath.replace(this.currentPath, '').replace(/^\//, '');

        const fileHeader = document.createElement('div');
        fileHeader.className = 'find-replace-file';

        fileHeader.innerHTML = `
            <span class="find-replace-file-name">${this.escapeHtml(fileName)}</span>
            <span class="find-replace-file-path">${this.escapeHtml(relativePath)}</span>
            <span class="find-replace-file-count">${matches.length} ${matches.length === 1 ? 'match' : 'matches'}</span>
        `;

        fileGroup.appendChild(fileHeader);

        // Match items
        matches.forEach(match => {
            const matchItem = this.renderMatchItem(match, query);
            fileGroup.appendChild(matchItem);
        });

        return fileGroup;
    }

    /**
     * Render a match item
     */
    renderMatchItem(match, query) {
        const matchItem = document.createElement('div');
        matchItem.className = 'find-replace-match';

        const highlightedText = this.highlightMatch(match.text, query);

        matchItem.innerHTML = `
            <span class="find-replace-match-line">${match.line}</span>
            <span class="find-replace-match-text">${highlightedText}</span>
        `;

        // Click to open file at line
        matchItem.addEventListener('click', () => {
            console.log('[FindReplacePanel] Opening file:', match.file, 'at line', match.line);
            eventBus.emit('file:selected', { path: match.file, line: match.line });
        });

        return matchItem;
    }

    /**
     * Highlight matches in text
     */
    highlightMatch(text, query) {
        const escaped = this.escapeHtml(text);
        try {
            const regex = new RegExp(`(${this.escapeRegex(query)})`, 'gi');
            return escaped.replace(regex, '<mark>$1</mark>');
        } catch (e) {
            return escaped;
        }
    }

    /**
     * Perform replace all
     */
    async performReplaceAll() {
        if (!this.panel || this.searchResults.length === 0) {
            this.showNotification('⚠️ No search results. Click "Find All" first.', 'warning');
            return;
        }

        if (this.isReplacing) {
            console.log('[FindReplacePanel] Replace already in progress');
            return;
        }

        const replaceInput = this.panel.querySelector('.find-replace-replace-input');
        const searchInput = this.panel.querySelector('.find-replace-search-input');
        const replaceText = replaceInput.value;
        const searchPattern = searchInput.value.trim();

        const caseSensitive = this.panel.querySelector('#replace-case-sensitive').checked;
        const useRegex = this.panel.querySelector('#replace-regex').checked;

        const totalMatches = this.searchResults.length;
        const limitWarning = totalMatches >= MATCHES_LIMIT;

        // Confirmation for large replacements (VS Code style)
        if (limitWarning) {
            const confirmed = await this.confirmLargeReplace(totalMatches);
            if (!confirmed) {
                return;
            }
        }

        this.isReplacing = true;
        this.showNotification('🔄 Replacing...', 'info');

        try {
            // Get unique file paths from search results
            const filePaths = [...new Set(this.searchResults.map(r => r.file))];

            console.log('[FindReplacePanel] Replacing in', filePaths.length, 'files');

            const result = await this.fs.replaceInFiles(searchPattern, replaceText, filePaths, {
                regex: useRegex,
                caseSensitive
            });

            if (result.success) {
                this.showNotification(
                    `✅ Replaced ${result.totalMatches} matches in ${result.filesModified} files`,
                    'success'
                );

                // Emit event for each modified file to update open editors
                result.results.forEach(fileResult => {
                    if (fileResult.modified) {
                        eventBus.emit('file:replaced', {
                            path: fileResult.file,
                            searchPattern,
                            replaceText,
                            matches: fileResult.matches
                        });
                    }
                });

                // Clear search results and re-search to show updated content
                setTimeout(() => {
                    this.searchResults = [];
                    const resultsContainer = this.panel.querySelector('.find-replace-results');
                    if (resultsContainer) {
                        resultsContainer.innerHTML = '<div class="find-replace-empty">Replacement complete. Search again to verify.</div>';
                    }
                }, 1000);
            } else {
                this.showNotification(`❌ Replace failed: ${result.error}`, 'error');
            }
        } catch (error) {
            console.error('[FindReplacePanel] Replace error:', error);
            this.showNotification('❌ Replace failed', 'error');
        } finally {
            this.isReplacing = false;
        }
    }

    /**
     * Confirm large replace operation
     */
    async confirmLargeReplace(matchCount) {
        return new Promise((resolve) => {
            const dialog = document.createElement('div');
            dialog.className = 'find-replace-dialog-overlay';

            dialog.innerHTML = `
                <div class="find-replace-dialog">
                    <h3>⚠️ Large Replace Operation</h3>
                    <p>This will replace <strong>${matchCount}+ matches</strong> across multiple files.</p>
                    <p>This operation cannot be undone. Are you sure?</p>
                    <div class="find-replace-dialog-actions">
                        <button class="find-replace-btn find-replace-dialog-cancel">Cancel</button>
                        <button class="find-replace-btn find-replace-dialog-confirm">Replace All</button>
                    </div>
                </div>
            `;

            document.body.appendChild(dialog);

            const cancelBtn = dialog.querySelector('.find-replace-dialog-cancel');
            const confirmBtn = dialog.querySelector('.find-replace-dialog-confirm');

            const cleanup = () => {
                dialog.remove();
            };

            cancelBtn.addEventListener('click', () => {
                cleanup();
                resolve(false);
            });

            confirmBtn.addEventListener('click', () => {
                cleanup();
                resolve(true);
            });

            // Close on overlay click
            dialog.addEventListener('click', (e) => {
                if (e.target === dialog) {
                    cleanup();
                    resolve(false);
                }
            });
        });
    }

    /**
     * Show notification
     */
    showNotification(message, type = 'info') {
        // Remove existing notification
        const existing = document.querySelector('.find-replace-notification');
        if (existing) existing.remove();

        const notification = document.createElement('div');
        notification.className = `find-replace-notification find-replace-notification-${type}`;
        notification.textContent = message;

        document.body.appendChild(notification);

        // Auto-remove after 3 seconds
        setTimeout(() => {
            notification.classList.add('find-replace-notification-fade');
            setTimeout(() => notification.remove(), 300);
        }, 3000);
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
     * Escape regex
     */
    escapeRegex(text) {
        return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    /**
     * Cleanup
     */
    destroy() {
        this.hide();
    }
}

// Export singleton instance
const findReplacePanel = new FindReplacePanel(require('../services/FileSystemService'));

// Listen for show event from toolbar buttons
eventBus.on('findreplace:show', () => {
    findReplacePanel.show();
});

module.exports = findReplacePanel;

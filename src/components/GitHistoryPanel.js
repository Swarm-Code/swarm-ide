/**
 * GitHistoryPanel - Git commit history panel
 *
 * Displays:
 * - Commit list with author/date/message
 * - Commit detail view with diff
 * - Pagination controls
 * - Filtering by author/date/message
 *
 * Usage:
 *   const gitHistoryPanel = new GitHistoryPanel();
 */

const eventBus = require('../modules/EventBus');

// Git integration
let gitHistoryService = null;
let gitStore = null;

// Lazy load Git services
function getGitServices() {
    if (!gitHistoryService) {
        try {
            const gitService = require('../services/GitService').getInstance();
            const { GitHistoryService } = require('../services/GitHistoryService');
            gitStore = require('../modules/GitStore').getInstance();
            gitHistoryService = new GitHistoryService(gitService);
        } catch (error) {
            console.warn('[GitHistoryPanel] Git services not available:', error.message);
        }
    }
    return { gitHistoryService, gitStore };
}

class GitHistoryPanel {
    constructor() {
        this.panel = null;
        this.commitsList = null;
        this.commitDetail = null;
        this.isVisible = false;
        this.commits = [];
        this.currentPage = 0;
        this.pageSize = 50;
        this.selectedCommit = null;
        this.filterAuthor = '';
        this.filterMessage = '';

        this.render();
        this.setupEventListeners();
    }

    /**
     * Render the Git history panel
     */
    render() {
        // Create panel container
        this.panel = document.createElement('div');
        this.panel.className = 'git-history-panel panel';
        this.panel.style.display = 'none'; // Hidden by default

        // Panel header
        const header = document.createElement('div');
        header.className = 'git-history-panel-header panel-header';

        const title = document.createElement('h3');
        title.textContent = 'Git History';

        const closeBtn = document.createElement('button');
        closeBtn.className = 'panel-close-btn';
        closeBtn.innerHTML = '×';
        closeBtn.title = 'Close';
        closeBtn.addEventListener('click', () => this.hide());

        header.appendChild(title);
        header.appendChild(closeBtn);

        // Panel content
        const content = document.createElement('div');
        content.className = 'git-history-panel-content panel-content';

        // Filter section
        const filterSection = document.createElement('div');
        filterSection.className = 'git-history-filter';

        const authorFilter = document.createElement('input');
        authorFilter.type = 'text';
        authorFilter.className = 'git-filter-input';
        authorFilter.placeholder = 'Filter by author...';
        authorFilter.addEventListener('input', (e) => {
            this.filterAuthor = e.target.value;
            this.applyFilters();
        });

        const messageFilter = document.createElement('input');
        messageFilter.type = 'text';
        messageFilter.className = 'git-filter-input';
        messageFilter.placeholder = 'Filter by message...';
        messageFilter.addEventListener('input', (e) => {
            this.filterMessage = e.target.value;
            this.applyFilters();
        });

        filterSection.appendChild(authorFilter);
        filterSection.appendChild(messageFilter);

        // Split view container
        const splitView = document.createElement('div');
        splitView.className = 'git-history-split-view';

        // Commits list section
        const listSection = document.createElement('div');
        listSection.className = 'git-history-list-section';

        this.commitsList = document.createElement('div');
        this.commitsList.className = 'git-commits-list';

        // Pagination controls
        const paginationControls = document.createElement('div');
        paginationControls.className = 'git-pagination-controls';

        const prevBtn = document.createElement('button');
        prevBtn.className = 'git-pagination-btn';
        prevBtn.textContent = '← Previous';
        prevBtn.addEventListener('click', () => this.previousPage());

        const pageInfo = document.createElement('span');
        pageInfo.className = 'git-pagination-info';
        pageInfo.textContent = 'Page 1';

        const nextBtn = document.createElement('button');
        nextBtn.className = 'git-pagination-btn';
        nextBtn.textContent = 'Next →';
        nextBtn.addEventListener('click', () => this.nextPage());

        paginationControls.appendChild(prevBtn);
        paginationControls.appendChild(pageInfo);
        paginationControls.appendChild(nextBtn);

        listSection.appendChild(this.commitsList);
        listSection.appendChild(paginationControls);

        // Commit detail section
        const detailSection = document.createElement('div');
        detailSection.className = 'git-history-detail-section';

        this.commitDetail = document.createElement('div');
        this.commitDetail.className = 'git-commit-detail';
        this.commitDetail.innerHTML = '<div class="git-detail-empty">Select a commit to view details</div>';

        detailSection.appendChild(this.commitDetail);

        // Assemble split view
        splitView.appendChild(listSection);
        splitView.appendChild(detailSection);

        // Assemble content
        content.appendChild(filterSection);
        content.appendChild(splitView);

        // Assemble panel
        this.panel.appendChild(header);
        this.panel.appendChild(content);

        // Append to body
        document.body.appendChild(this.panel);
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Listen for history panel toggle command
        eventBus.on('git:toggle-history', () => {
            this.toggle();
        });

        // Listen for commit created events
        eventBus.on('git:commit-created', () => {
            this.loadHistory();
        });

        // Listen for branch switched events
        eventBus.on('git:branch-switched', () => {
            this.loadHistory();
        });
    }

    /**
     * Load commit history
     */
    async loadHistory() {
        try {
            const { gitHistoryService } = getGitServices();
            if (!gitHistoryService) return;

            console.log('[GitHistoryPanel] Loading history, page:', this.currentPage);

            // Calculate skip value for pagination
            const skip = this.currentPage * this.pageSize;

            // Load commits with pagination
            const options = {
                limit: this.pageSize,
                skip: skip
            };

            // Apply filters if set
            if (this.filterAuthor) {
                options.author = this.filterAuthor;
            }

            this.commits = await gitHistoryService.getHistory(options);
            this.renderCommitsList();
        } catch (error) {
            console.error('[GitHistoryPanel] Failed to load history:', error);
            this.showError('Failed to load commit history');
        }
    }

    /**
     * Render commits list
     */
    renderCommitsList() {
        this.commitsList.innerHTML = '';

        if (this.commits.length === 0) {
            const emptyMsg = document.createElement('div');
            emptyMsg.className = 'git-empty-message';
            emptyMsg.textContent = 'No commits found';
            this.commitsList.appendChild(emptyMsg);
            return;
        }

        // Filter commits by message if filter is set
        let filteredCommits = this.commits;
        if (this.filterMessage) {
            const searchLower = this.filterMessage.toLowerCase();
            filteredCommits = this.commits.filter(commit =>
                commit.message.toLowerCase().includes(searchLower)
            );
        }

        filteredCommits.forEach(commit => {
            const commitItem = this.createCommitItem(commit);
            this.commitsList.appendChild(commitItem);
        });

        // Update pagination info
        this.updatePaginationInfo();
    }

    /**
     * Create commit item element
     * @param {Object} commit - Commit object
     * @returns {HTMLElement} Commit item element
     */
    createCommitItem(commit) {
        const item = document.createElement('div');
        item.className = 'git-commit-item';
        item.dataset.sha = commit.sha;

        if (this.selectedCommit && this.selectedCommit.sha === commit.sha) {
            item.classList.add('selected');
        }

        // Commit header (SHA + date)
        const header = document.createElement('div');
        header.className = 'git-commit-item-header';

        const sha = document.createElement('span');
        sha.className = 'git-commit-sha';
        sha.textContent = commit.shortSha;
        sha.title = commit.sha;

        const date = document.createElement('span');
        date.className = 'git-commit-date';
        date.textContent = commit.getRelativeTime();

        header.appendChild(sha);
        header.appendChild(date);

        // Commit message
        const message = document.createElement('div');
        message.className = 'git-commit-message';
        message.textContent = commit.message.split('\n')[0]; // First line only
        message.title = commit.message;

        // Commit author
        const author = document.createElement('div');
        author.className = 'git-commit-author';
        author.textContent = `by ${commit.author}`;

        // Click to show details
        item.addEventListener('click', () => {
            this.showCommitDetail(commit);
        });

        item.appendChild(header);
        item.appendChild(message);
        item.appendChild(author);

        return item;
    }

    /**
     * Show commit detail
     * @param {Object} commit - Commit object
     */
    async showCommitDetail(commit) {
        try {
            this.selectedCommit = commit;

            // Update selected state in list
            const items = this.commitsList.querySelectorAll('.git-commit-item');
            items.forEach(item => {
                if (item.dataset.sha === commit.sha) {
                    item.classList.add('selected');
                } else {
                    item.classList.remove('selected');
                }
            });

            // Show loading state
            this.commitDetail.innerHTML = '<div class="git-detail-loading">Loading commit details...</div>';

            const { gitHistoryService } = getGitServices();
            if (!gitHistoryService) return;

            // Load commit detail with diff
            const commitDetail = await gitHistoryService.getCommitDetail(commit.sha);

            // Render commit detail
            this.renderCommitDetail(commitDetail);
        } catch (error) {
            console.error('[GitHistoryPanel] Failed to load commit detail:', error);
            this.commitDetail.innerHTML = '<div class="git-detail-error">Failed to load commit details</div>';
        }
    }

    /**
     * Render commit detail view
     * @param {Object} commit - Commit object with diff
     */
    renderCommitDetail(commit) {
        this.commitDetail.innerHTML = '';

        // Commit info section
        const info = document.createElement('div');
        info.className = 'git-commit-detail-info';

        const sha = document.createElement('div');
        sha.className = 'git-detail-sha';
        sha.innerHTML = `<strong>Commit:</strong> ${commit.sha}`;

        const author = document.createElement('div');
        author.className = 'git-detail-author';
        author.innerHTML = `<strong>Author:</strong> ${commit.author} &lt;${commit.authorEmail}&gt;`;

        const date = document.createElement('div');
        date.className = 'git-detail-date';
        date.innerHTML = `<strong>Date:</strong> ${new Date(commit.date * 1000).toLocaleString()}`;

        const message = document.createElement('div');
        message.className = 'git-detail-message';
        message.innerHTML = `<strong>Message:</strong><br>${this.escapeHtml(commit.message)}`;

        info.appendChild(sha);
        info.appendChild(author);
        info.appendChild(date);
        info.appendChild(message);

        // Diff section
        const diffSection = document.createElement('div');
        diffSection.className = 'git-commit-detail-diff';

        const diffTitle = document.createElement('h4');
        diffTitle.textContent = 'Changes';

        diffSection.appendChild(diffTitle);

        // Render diff if available
        if (commit.diff) {
            const diffView = this.createDiffView(commit.diff);
            diffSection.appendChild(diffView);
        } else {
            const noDiff = document.createElement('div');
            noDiff.className = 'git-no-diff';
            noDiff.textContent = 'No diff available';
            diffSection.appendChild(noDiff);
        }

        this.commitDetail.appendChild(info);
        this.commitDetail.appendChild(diffSection);
    }

    /**
     * Create diff view element
     * @param {Array} diffs - Array of Diff objects
     * @returns {HTMLElement} Diff view element
     */
    createDiffView(diffs) {
        const container = document.createElement('div');
        container.className = 'git-diff-view';

        diffs.forEach(diff => {
            // File header
            const fileHeader = document.createElement('div');
            fileHeader.className = 'git-diff-file-header';
            fileHeader.textContent = diff.filePath;

            container.appendChild(fileHeader);

            // Render hunks
            diff.hunks.forEach(hunk => {
                const hunkEl = document.createElement('div');
                hunkEl.className = 'git-diff-hunk';

                // Hunk header
                const hunkHeader = document.createElement('div');
                hunkHeader.className = 'git-diff-hunk-header';
                hunkHeader.textContent = hunk.header;
                hunkEl.appendChild(hunkHeader);

                // Hunk lines
                hunk.lines.forEach(line => {
                    const lineEl = document.createElement('div');
                    lineEl.className = 'git-diff-line';

                    if (line.startsWith('+')) {
                        lineEl.classList.add('git-diff-line-added');
                    } else if (line.startsWith('-')) {
                        lineEl.classList.add('git-diff-line-deleted');
                    } else {
                        lineEl.classList.add('git-diff-line-context');
                    }

                    lineEl.textContent = line;
                    hunkEl.appendChild(lineEl);
                });

                container.appendChild(hunkEl);
            });
        });

        return container;
    }

    /**
     * Apply filters to commit list
     */
    applyFilters() {
        // Reload history with filters
        this.currentPage = 0; // Reset to first page
        this.loadHistory();
    }

    /**
     * Go to previous page
     */
    previousPage() {
        if (this.currentPage > 0) {
            this.currentPage--;
            this.loadHistory();
        }
    }

    /**
     * Go to next page
     */
    nextPage() {
        this.currentPage++;
        this.loadHistory();
    }

    /**
     * Update pagination info
     */
    updatePaginationInfo() {
        const pageInfo = this.panel.querySelector('.git-pagination-info');
        if (pageInfo) {
            pageInfo.textContent = `Page ${this.currentPage + 1}`;
        }

        // Disable previous button on first page
        const prevBtn = this.panel.querySelector('.git-pagination-btn:first-child');
        if (prevBtn) {
            prevBtn.disabled = this.currentPage === 0;
        }

        // Disable next button if we got fewer commits than page size
        const nextBtn = this.panel.querySelector('.git-pagination-btn:last-child');
        if (nextBtn) {
            nextBtn.disabled = this.commits.length < this.pageSize;
        }
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
     * Show error message
     * @param {string} message - Error message
     */
    showError(message) {
        // Create toast notification
        const toast = document.createElement('div');
        toast.className = 'git-toast git-toast-error';
        toast.textContent = message;
        document.body.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('fade-out');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    /**
     * Show the panel
     */
    show() {
        if (!this.panel) return;
        this.panel.style.display = 'flex';
        this.isVisible = true;

        // CRITICAL FIX: Emit panel:shown event to hide BrowserViews
        eventBus.emit('panel:shown', { panel: 'git-history' });

        this.loadHistory();
    }

    /**
     * Hide the panel
     */
    hide() {
        if (!this.panel) return;
        this.panel.style.display = 'none';
        this.isVisible = false;

        // CRITICAL FIX: Emit panel:hidden event to restore BrowserViews
        eventBus.emit('panel:hidden', { panel: 'git-history' });
    }

    /**
     * Toggle panel visibility
     */
    toggle() {
        if (this.isVisible) {
            this.hide();
        } else {
            this.show();
        }
    }

    /**
     * Cleanup
     */
    destroy() {
        if (this.panel) {
            this.panel.remove();
        }
        eventBus.off('git:toggle-history');
        eventBus.off('git:commit-created');
        eventBus.off('git:branch-switched');
    }
}

module.exports = GitHistoryPanel;

/**
 * GitDiffPanel - Side-by-side diff visualization
 *
 * Features:
 * - Side-by-side file comparison
 * - Unified diff view
 * - Syntax highlighting
 * - Hunk navigation
 * - Line-by-line comparison
 *
 * Usage:
 *   const diffPanel = new GitDiffPanel();
 *   diffPanel.show(filePath);
 */

const eventBus = require('../modules/EventBus');

// Git services
let gitDiffService = null;
let gitStore = null;

// Lazy load Git services
function getGitServices() {
    if (!gitDiffService) {
        try {
            const gitService = require('../services/GitService').getInstance();
            const { GitDiffService } = require('../services/GitDiffService');
            gitStore = require('../modules/GitStore').getInstance();
            gitDiffService = new GitDiffService(gitService);
        } catch (error) {
            console.warn('[GitDiffPanel] Git services not available:', error.message);
        }
    }
    return { gitDiffService, gitStore };
}

class GitDiffPanel {
    constructor() {
        this.panel = null;
        this.header = null;
        this.content = null;
        this.currentFile = null;
        this.currentDiff = null;
        this.viewMode = 'split'; // 'split' or 'unified'

        this.render();
        this.setupEventListeners();
    }

    /**
     * Render the diff panel
     */
    render() {
        // Create panel container
        this.panel = document.createElement('div');
        this.panel.className = 'git-diff-panel';
        this.panel.style.display = 'none';

        // Header
        this.header = document.createElement('div');
        this.header.className = 'git-diff-panel-header';

        const filePath = document.createElement('div');
        filePath.className = 'git-diff-panel-file-path';
        filePath.textContent = 'No file selected';

        // Mode toggle
        const modeToggle = document.createElement('div');
        modeToggle.className = 'git-diff-panel-mode-toggle';

        const splitBtn = document.createElement('button');
        splitBtn.className = 'git-diff-panel-mode-btn active';
        splitBtn.textContent = 'Split';
        splitBtn.dataset.mode = 'split';

        const unifiedBtn = document.createElement('button');
        unifiedBtn.className = 'git-diff-panel-mode-btn';
        unifiedBtn.textContent = 'Unified';
        unifiedBtn.dataset.mode = 'unified';

        modeToggle.appendChild(splitBtn);
        modeToggle.appendChild(unifiedBtn);

        // Mode toggle click handlers
        modeToggle.addEventListener('click', (e) => {
            const btn = e.target.closest('.git-diff-panel-mode-btn');
            if (btn) {
                this.setViewMode(btn.dataset.mode);

                // Update active state
                modeToggle.querySelectorAll('.git-diff-panel-mode-btn').forEach(b => {
                    b.classList.remove('active');
                });
                btn.classList.add('active');
            }
        });

        // Close button
        const closeBtn = document.createElement('button');
        closeBtn.className = 'git-diff-panel-mode-btn';
        closeBtn.textContent = '×';
        closeBtn.title = 'Close';
        closeBtn.addEventListener('click', () => this.hide());

        this.header.appendChild(filePath);
        this.header.appendChild(modeToggle);
        this.header.appendChild(closeBtn);

        // Content
        this.content = document.createElement('div');
        this.content.className = 'git-diff-panel-content';

        // Assemble panel
        this.panel.appendChild(this.header);
        this.panel.appendChild(this.content);

        // Append to body or main container
        document.body.appendChild(this.panel);
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Listen for diff show events
        eventBus.on('git:show-diff-panel', (data) => {
            this.show(data.filePath);
        });

        // Listen for file changes
        eventBus.on('git:file-changed', (data) => {
            if (data.filePath === this.currentFile) {
                this.loadDiff(this.currentFile);
            }
        });
    }

    /**
     * Show diff panel for a file
     * @param {string} filePath - File path
     */
    async show(filePath) {
        this.currentFile = filePath;
        this.panel.style.display = 'flex';

        // Update header
        const filePathEl = this.header.querySelector('.git-diff-panel-file-path');
        filePathEl.textContent = filePath;

        // CRITICAL FIX: Emit panel:shown event to hide BrowserViews
        eventBus.emit('panel:shown', { panel: 'git-diff' });

        // Load diff
        await this.loadDiff(filePath);
    }

    /**
     * Hide diff panel
     */
    hide() {
        this.panel.style.display = 'none';
        this.currentFile = null;
        this.currentDiff = null;

        // CRITICAL FIX: Emit panel:hidden event to restore BrowserViews
        eventBus.emit('panel:hidden', { panel: 'git-diff' });
    }

    /**
     * Load diff for file
     * @param {string} filePath - File path
     */
    async loadDiff(filePath) {
        try {
            const { gitDiffService } = getGitServices();
            if (!gitDiffService) {
                this.showError('Git diff service not available');
                return;
            }

            console.log('[GitDiffPanel] Loading diff for:', filePath);

            // Get diff from service
            const diff = await gitDiffService.getFileDiff(filePath);

            if (!diff) {
                this.showError('No diff available for this file');
                return;
            }

            this.currentDiff = diff;
            this.renderDiff();

        } catch (error) {
            console.error('[GitDiffPanel] Failed to load diff:', error);
            this.showError('Failed to load diff: ' + error.message);
        }
    }

    /**
     * Render diff content
     */
    renderDiff() {
        if (!this.currentDiff) {
            this.content.innerHTML = '<div style="padding: 20px; color: #858585;">No diff to display</div>';
            return;
        }

        if (this.viewMode === 'split') {
            this.renderSplitView();
        } else {
            this.renderUnifiedView();
        }
    }

    /**
     * Render split (side-by-side) view
     */
    renderSplitView() {
        const splitContainer = document.createElement('div');
        splitContainer.className = 'git-diff-panel-split';

        // Old version (left)
        const oldSide = document.createElement('div');
        oldSide.className = 'git-diff-panel-side';

        const oldHeader = document.createElement('div');
        oldHeader.className = 'git-diff-panel-side-header';
        oldHeader.textContent = 'Original';

        const oldContent = document.createElement('div');
        oldContent.className = 'git-diff-panel-side-content';

        oldSide.appendChild(oldHeader);
        oldSide.appendChild(oldContent);

        // New version (right)
        const newSide = document.createElement('div');
        newSide.className = 'git-diff-panel-side';

        const newHeader = document.createElement('div');
        newHeader.className = 'git-diff-panel-side-header';
        newHeader.textContent = 'Modified';

        const newContent = document.createElement('div');
        newContent.className = 'git-diff-panel-side-content';

        newSide.appendChild(newHeader);
        newSide.appendChild(newContent);

        splitContainer.appendChild(oldSide);
        splitContainer.appendChild(newSide);

        // Render hunks
        this.currentDiff.hunks.forEach(hunk => {
            // Hunk header
            const oldHunkHeader = this.createDiffLine('', hunk.header, 'hunk-header');
            const newHunkHeader = this.createDiffLine('', hunk.header, 'hunk-header');
            oldContent.appendChild(oldHunkHeader);
            newContent.appendChild(newHunkHeader);

            // Process lines
            let oldLineNum = hunk.oldStart;
            let newLineNum = hunk.newStart;

            hunk.lines.forEach(line => {
                const type = line.type;
                const content = line.content;

                if (type === 'context') {
                    // Context line appears on both sides
                    oldContent.appendChild(this.createDiffLine(oldLineNum, content, 'context'));
                    newContent.appendChild(this.createDiffLine(newLineNum, content, 'context'));
                    oldLineNum++;
                    newLineNum++;
                } else if (type === 'deletion') {
                    // Deletion only on left side
                    oldContent.appendChild(this.createDiffLine(oldLineNum, content, 'removed'));
                    oldLineNum++;
                } else if (type === 'addition') {
                    // Addition only on right side
                    newContent.appendChild(this.createDiffLine(newLineNum, content, 'added'));
                    newLineNum++;
                }
            });
        });

        this.content.innerHTML = '';
        this.content.appendChild(splitContainer);
    }

    /**
     * Render unified view
     */
    renderUnifiedView() {
        const unifiedContainer = document.createElement('div');
        unifiedContainer.className = 'git-diff-panel-unified';
        unifiedContainer.style.width = '100%';
        unifiedContainer.style.overflow = 'auto';

        // Render hunks
        this.currentDiff.hunks.forEach(hunk => {
            // Hunk header
            unifiedContainer.appendChild(this.createDiffLine('', hunk.header, 'hunk-header'));

            // Process lines
            let oldLineNum = hunk.oldStart;
            let newLineNum = hunk.newStart;

            hunk.lines.forEach(line => {
                const type = line.type;
                const content = line.content;

                if (type === 'context') {
                    const lineNum = `${oldLineNum} | ${newLineNum}`;
                    unifiedContainer.appendChild(this.createDiffLine(lineNum, content, 'context'));
                    oldLineNum++;
                    newLineNum++;
                } else if (type === 'deletion') {
                    unifiedContainer.appendChild(this.createDiffLine(`${oldLineNum}`, content, 'removed'));
                    oldLineNum++;
                } else if (type === 'addition') {
                    unifiedContainer.appendChild(this.createDiffLine(`${newLineNum}`, content, 'added'));
                    newLineNum++;
                }
            });
        });

        this.content.innerHTML = '';
        this.content.appendChild(unifiedContainer);
    }

    /**
     * Create a diff line element
     * @param {string|number} lineNum - Line number
     * @param {string} content - Line content
     * @param {string} type - Line type (context, added, removed, hunk-header)
     * @returns {HTMLElement}
     */
    createDiffLine(lineNum, content, type) {
        const line = document.createElement('div');
        line.className = `git-diff-line ${type}`;

        const lineNumber = document.createElement('div');
        lineNumber.className = 'git-diff-line-number';
        lineNumber.textContent = lineNum;

        const lineContent = document.createElement('div');
        lineContent.className = 'git-diff-line-content';
        lineContent.textContent = content;

        line.appendChild(lineNumber);
        line.appendChild(lineContent);

        return line;
    }

    /**
     * Set view mode
     * @param {string} mode - 'split' or 'unified'
     */
    setViewMode(mode) {
        this.viewMode = mode;
        this.renderDiff();
    }

    /**
     * Show error message
     * @param {string} message - Error message
     */
    showError(message) {
        this.content.innerHTML = `
            <div style="padding: 20px; color: #dc3545;">
                <strong>Error:</strong> ${message}
            </div>
        `;
    }

    /**
     * Cleanup
     */
    destroy() {
        if (this.panel) {
            this.panel.remove();
        }
        eventBus.off('git:show-diff-panel');
        eventBus.off('git:file-changed');
    }
}

module.exports = GitDiffPanel;

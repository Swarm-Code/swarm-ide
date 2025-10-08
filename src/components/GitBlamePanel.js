/**
 * GitBlamePanel - Blame visualization with timeline
 *
 * Features:
 * - Line-by-line blame annotations
 * - Author heat map by commit age
 * - Commit timeline sidebar
 * - Interactive navigation
 *
 * Usage:
 *   const blamePanel = new GitBlamePanel();
 *   blamePanel.show(filePath);
 */

const eventBus = require('../modules/EventBus');

// Git services
let gitBlameService = null;
let gitStore = null;

// Lazy load Git services
function getGitServices() {
    if (!gitBlameService) {
        try {
            const gitService = require('../services/GitService').getInstance();
            const { GitBlameService } = require('../services/GitBlameService');
            gitStore = require('../modules/GitStore').getInstance();
            gitBlameService = new GitBlameService(gitService);
        } catch (error) {
            console.warn('[GitBlamePanel] Git services not available:', error.message);
        }
    }
    return { gitBlameService, gitStore };
}

class GitBlamePanel {
    constructor() {
        this.panel = null;
        this.header = null;
        this.timeline = null;
        this.codeView = null;
        this.currentFile = null;
        this.blameData = null;
        this.commits = new Map(); // commit SHA -> commit details

        this.render();
        this.setupEventListeners();
    }

    /**
     * Render the blame panel
     */
    render() {
        // Create panel container
        this.panel = document.createElement('div');
        this.panel.className = 'git-blame-panel';
        this.panel.style.display = 'none';

        // Header
        this.header = document.createElement('div');
        this.header.className = 'git-blame-panel-header';

        const filePath = document.createElement('div');
        filePath.className = 'git-blame-panel-file-path';
        filePath.textContent = 'No file selected';

        // Close button
        const closeBtn = document.createElement('button');
        closeBtn.className = 'git-diff-panel-mode-btn';
        closeBtn.textContent = '×';
        closeBtn.title = 'Close';
        closeBtn.addEventListener('click', () => this.hide());

        this.header.appendChild(filePath);
        this.header.appendChild(closeBtn);

        // Content container
        const content = document.createElement('div');
        content.className = 'git-blame-panel-content';

        // Timeline sidebar
        this.timeline = document.createElement('div');
        this.timeline.className = 'git-blame-timeline';

        // Code view
        this.codeView = document.createElement('div');
        this.codeView.className = 'git-blame-code-view';

        content.appendChild(this.timeline);
        content.appendChild(this.codeView);

        // Assemble panel
        this.panel.appendChild(this.header);
        this.panel.appendChild(content);

        // Append to body
        document.body.appendChild(this.panel);
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Listen for blame panel show events
        eventBus.on('git:show-blame-panel', (data) => {
            this.show(data.filePath);
        });
    }

    /**
     * Show blame panel for a file
     * @param {string} filePath - File path
     */
    async show(filePath) {
        this.currentFile = filePath;
        this.panel.style.display = 'flex';

        // Update header
        const filePathEl = this.header.querySelector('.git-blame-panel-file-path');
        filePathEl.textContent = filePath;

        // Load blame
        await this.loadBlame(filePath);
    }

    /**
     * Hide blame panel
     */
    hide() {
        this.panel.style.display = 'none';
        this.currentFile = null;
        this.blameData = null;
        this.commits.clear();
    }

    /**
     * Load blame for file
     * @param {string} filePath - File path
     */
    async loadBlame(filePath) {
        try {
            const { gitBlameService } = getGitServices();
            if (!gitBlameService) {
                this.showError('Git blame service not available');
                return;
            }

            console.log('[GitBlamePanel] Loading blame for:', filePath);

            // Get blame data
            const blameEntries = await gitBlameService.getFileBlame(filePath);

            if (!blameEntries || blameEntries.length === 0) {
                this.showError('No blame data available for this file');
                return;
            }

            this.blameData = blameEntries;

            // Extract unique commits
            this.commits.clear();
            blameEntries.forEach(entry => {
                if (!this.commits.has(entry.sha)) {
                    this.commits.set(entry.sha, {
                        sha: entry.sha,
                        author: entry.author,
                        authorEmail: entry.authorEmail,
                        date: entry.authorTime,
                        message: entry.summary
                    });
                }
            });

            this.renderBlame();

        } catch (error) {
            console.error('[GitBlamePanel] Failed to load blame:', error);
            this.showError('Failed to load blame: ' + error.message);
        }
    }

    /**
     * Render blame data
     */
    renderBlame() {
        if (!this.blameData) return;

        // Render timeline
        this.renderTimeline();

        // Render code view with blame annotations
        this.renderCodeView();
    }

    /**
     * Render commit timeline
     */
    renderTimeline() {
        this.timeline.innerHTML = '';

        // Convert commits to array and sort by date
        const commitArray = Array.from(this.commits.values()).sort((a, b) => {
            return new Date(b.date) - new Date(a.date);
        });

        commitArray.forEach(commit => {
            const item = document.createElement('div');
            item.className = 'git-blame-timeline-item';
            item.dataset.sha = commit.sha;

            const author = document.createElement('div');
            author.className = 'git-blame-timeline-author';
            author.textContent = commit.author;

            const date = document.createElement('div');
            date.className = 'git-blame-timeline-date';
            date.textContent = this.formatDate(commit.date);

            item.appendChild(author);
            item.appendChild(date);

            // Click to highlight commit lines
            item.addEventListener('click', () => {
                this.highlightCommit(commit.sha);
            });

            this.timeline.appendChild(item);
        });
    }

    /**
     * Render code view with blame annotations
     */
    async renderCodeView() {
        this.codeView.innerHTML = '';

        // Read file content
        const fileContent = await this.readFileContent(this.currentFile);
        if (!fileContent) {
            this.codeView.innerHTML = '<div style="padding: 20px; color: #858585;">Could not read file content</div>';
            return;
        }

        const lines = fileContent.split('\n');
        const container = document.createElement('div');
        container.style.fontFamily = "'Consolas', 'Monaco', monospace";
        container.style.fontSize = '13px';
        container.style.lineHeight = '1.5';

        lines.forEach((lineContent, index) => {
            const lineNum = index + 1;
            const blameEntry = this.blameData.find(entry => {
                return lineNum >= entry.lineStart && lineNum <= entry.lineEnd;
            });

            const lineDom = this.createBlameLine(lineNum, lineContent, blameEntry);
            container.appendChild(lineDom);
        });

        this.codeView.appendChild(container);
    }

    /**
     * Create a blame line element
     * @param {number} lineNum - Line number
     * @param {string} content - Line content
     * @param {Object} blameEntry - Blame entry
     * @returns {HTMLElement}
     */
    createBlameLine(lineNum, content, blameEntry) {
        const line = document.createElement('div');
        line.style.display = 'flex';
        line.style.padding = '2px 8px';
        line.style.borderBottom = '1px solid #2d2d30';
        line.dataset.sha = blameEntry?.sha;

        // Blame info (author + date)
        const blameInfo = document.createElement('div');
        blameInfo.style.width = '250px';
        blameInfo.style.flexShrink = '0';
        blameInfo.style.padding = '0 12px';
        blameInfo.style.fontSize = '11px';
        blameInfo.style.color = '#858585';
        blameInfo.style.display = 'flex';
        blameInfo.style.alignItems = 'center';
        blameInfo.style.gap = '8px';

        if (blameEntry) {
            const age = this.getCommitAge(blameEntry.authorTime);
            const ageClass = this.getAgeClass(age);

            blameInfo.style.backgroundColor = this.getAgeColor(age, 0.1);
            blameInfo.style.color = this.getAgeColor(age, 1);

            const author = document.createElement('span');
            author.textContent = blameEntry.author.substring(0, 15);
            author.style.fontWeight = '500';

            const date = document.createElement('span');
            date.textContent = this.formatDate(blameEntry.authorTime);

            blameInfo.appendChild(author);
            blameInfo.appendChild(date);

            // Tooltip on hover
            blameInfo.title = `${blameEntry.author}\n${blameEntry.summary}\n${blameEntry.sha.substring(0, 8)}`;
        }

        // Line number
        const lineNumber = document.createElement('div');
        lineNumber.style.width = '50px';
        lineNumber.style.textAlign = 'right';
        lineNumber.style.paddingRight = '12px';
        lineNumber.style.color = '#858585';
        lineNumber.style.userSelect = 'none';
        lineNumber.textContent = lineNum;

        // Line content
        const lineContent = document.createElement('div');
        lineContent.style.flex = '1';
        lineContent.style.whiteSpace = 'pre';
        lineContent.style.color = '#d4d4d4';
        lineContent.textContent = content;

        line.appendChild(blameInfo);
        line.appendChild(lineNumber);
        line.appendChild(lineContent);

        return line;
    }

    /**
     * Highlight lines from a specific commit
     * @param {string} sha - Commit SHA
     */
    highlightCommit(sha) {
        // Remove previous highlights
        this.timeline.querySelectorAll('.git-blame-timeline-item').forEach(item => {
            item.classList.remove('active');
        });

        // Highlight timeline item
        const timelineItem = this.timeline.querySelector(`[data-sha="${sha}"]`);
        if (timelineItem) {
            timelineItem.classList.add('active');
        }

        // Highlight code lines
        this.codeView.querySelectorAll('[data-sha]').forEach(line => {
            if (line.dataset.sha === sha) {
                line.style.backgroundColor = 'rgba(14, 99, 156, 0.3)';
            } else {
                line.style.backgroundColor = '';
            }
        });
    }

    /**
     * Get commit age in days
     * @param {string} dateStr - Date string
     * @returns {number} Age in days
     */
    getCommitAge(dateStr) {
        const commitDate = new Date(dateStr);
        const now = new Date();
        const diffMs = now - commitDate;
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        return diffDays;
    }

    /**
     * Get age class (0-5)
     * @param {number} days - Age in days
     * @returns {number} Age class
     */
    getAgeClass(days) {
        if (days < 7) return 0;
        if (days < 30) return 1;
        if (days < 90) return 2;
        if (days < 180) return 3;
        if (days < 365) return 4;
        return 5;
    }

    /**
     * Get age color
     * @param {number} days - Age in days
     * @param {number} alpha - Alpha value
     * @returns {string} Color
     */
    getAgeColor(days, alpha) {
        const ageClass = this.getAgeClass(days);
        const colors = [
            [255, 59, 48],   // Red (recent)
            [255, 149, 0],   // Orange
            [255, 204, 0],   // Yellow
            [76, 217, 100],  // Green
            [90, 200, 250],  // Blue
            [136, 136, 136]  // Gray (old)
        ];

        const [r, g, b] = colors[ageClass];
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    /**
     * Format date
     * @param {string} dateStr - Date string
     * @returns {string} Formatted date
     */
    formatDate(dateStr) {
        const date = new Date(dateStr);
        const now = new Date();
        const diffMs = now - date;
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        if (diffDays === 0) return 'Today';
        if (diffDays === 1) return 'Yesterday';
        if (diffDays < 7) return `${diffDays} days ago`;
        if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
        if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
        return `${Math.floor(diffDays / 365)} years ago`;
    }

    /**
     * Read file content
     * @param {string} filePath - File path
     * @returns {Promise<string>} File content
     */
    async readFileContent(filePath) {
        try {
            const response = await window.electronAPI.readFile(filePath);
            if (response.success) {
                return response.content;
            }
            return null;
        } catch (error) {
            console.error('[GitBlamePanel] Failed to read file:', error);
            return null;
        }
    }

    /**
     * Show error message
     * @param {string} message - Error message
     */
    showError(message) {
        this.timeline.innerHTML = '';
        this.codeView.innerHTML = `
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
        eventBus.off('git:show-blame-panel');
    }
}

module.exports = GitBlamePanel;

/**
 * CommitViewer - Modal component for viewing commit details and diffs
 *
 * Displays:
 * - Commit metadata (hash, author, date, message)
 * - Files changed with statistics
 * - Full unified diff with syntax highlighting
 */

const { GitClient } = require('../lib/git/GitClient');

class CommitViewer {
    constructor() {
        this.modal = null;
        this.currentCommit = null;
    }

    /**
     * Show commit details in modal
     * @param {Object} commit - Commit object with hash, author, date, message
     * @param {string} repositoryPath - Path to git repository
     */
    async show(commit, repositoryPath) {
        console.log('[CommitViewer] Showing commit:', commit.hash);
        this.currentCommit = commit;

        // Create modal if it doesn't exist
        if (!this.modal) {
            this.createModal();
        }

        // Show modal
        this.modal.style.display = 'flex';

        // Fetch and render commit details
        await this.loadCommitDetails(commit.hash, repositoryPath);
    }

    /**
     * Create modal DOM structure
     */
    createModal() {
        // Modal overlay
        this.modal = document.createElement('div');
        this.modal.className = 'commit-viewer-modal';
        this.modal.style.cssText = `
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.7);
            z-index: 10000;
            justify-content: center;
            align-items: center;
            backdrop-filter: blur(2px);
        `;

        // Modal container
        const container = document.createElement('div');
        container.className = 'commit-viewer-container';
        container.style.cssText = `
            background-color: #1e1e1e;
            border-radius: 8px;
            width: 90%;
            max-width: 1200px;
            height: 90%;
            max-height: 900px;
            display: flex;
            flex-direction: column;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
            border: 1px solid #333;
        `;

        // Header
        const header = document.createElement('div');
        header.className = 'commit-viewer-header';
        header.style.cssText = `
            padding: 16px 20px;
            border-bottom: 1px solid #333;
            display: flex;
            justify-content: space-between;
            align-items: center;
            background-color: #252526;
        `;

        const title = document.createElement('h2');
        title.className = 'commit-viewer-title';
        title.style.cssText = `
            margin: 0;
            font-size: 18px;
            font-weight: 600;
            color: #cccccc;
        `;
        title.textContent = 'Commit Details';

        const closeBtn = document.createElement('button');
        closeBtn.className = 'commit-viewer-close';
        closeBtn.innerHTML = '×';
        closeBtn.style.cssText = `
            background: none;
            border: none;
            color: #cccccc;
            font-size: 32px;
            cursor: pointer;
            padding: 0;
            width: 32px;
            height: 32px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 4px;
            transition: background-color 0.2s;
        `;
        closeBtn.addEventListener('click', () => this.hide());
        closeBtn.addEventListener('mouseenter', () => {
            closeBtn.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
        });
        closeBtn.addEventListener('mouseleave', () => {
            closeBtn.style.backgroundColor = 'transparent';
        });

        header.appendChild(title);
        header.appendChild(closeBtn);

        // Content area (scrollable)
        const content = document.createElement('div');
        content.className = 'commit-viewer-content';
        content.style.cssText = `
            flex: 1;
            overflow-y: auto;
            padding: 20px;
        `;

        // Loading indicator
        const loading = document.createElement('div');
        loading.className = 'commit-viewer-loading';
        loading.textContent = 'Loading commit details...';
        loading.style.cssText = `
            text-align: center;
            padding: 40px;
            color: #888;
        `;
        content.appendChild(loading);

        container.appendChild(header);
        container.appendChild(content);
        this.modal.appendChild(container);

        // Click outside to close
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) {
                this.hide();
            }
        });

        // ESC key to close
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.modal.style.display === 'flex') {
                this.hide();
            }
        });

        // Stop propagation on container clicks
        container.addEventListener('click', (e) => {
            e.stopPropagation();
        });

        document.body.appendChild(this.modal);
    }

    /**
     * Load commit details from git
     */
    async loadCommitDetails(commitHash, repositoryPath) {
        const content = this.modal.querySelector('.commit-viewer-content');

        try {
            const client = new GitClient(repositoryPath);

            // Fetch commit details with diff
            console.log('[CommitViewer] Fetching commit details for:', commitHash);
            const output = await client.execute([
                'show',
                '--format=fuller',
                '--stat',
                '--patch',
                '--color=never',
                commitHash
            ]);

            // Parse and render
            this.renderCommitDetails(output, content);

        } catch (error) {
            console.error('[CommitViewer] Error loading commit:', error);
            content.innerHTML = `
                <div style="color: #f44336; padding: 20px; text-align: center;">
                    <p>Error loading commit details</p>
                    <p style="font-size: 12px; color: #888;">${error.message}</p>
                </div>
            `;
        }
    }

    /**
     * Parse and render commit details
     */
    renderCommitDetails(gitShowOutput, container) {
        container.innerHTML = '';

        // Parse sections
        const sections = this.parseGitShow(gitShowOutput);

        // Render metadata
        const metadataSection = this.renderMetadata(sections.metadata);
        container.appendChild(metadataSection);

        // Render files changed
        if (sections.stats.length > 0) {
            const filesSection = this.renderFilesChanged(sections.stats);
            container.appendChild(filesSection);
        }

        // Render diffs
        if (sections.diffs.length > 0) {
            const diffsSection = this.renderDiffs(sections.diffs);
            container.appendChild(diffsSection);
        }
    }

    /**
     * Parse git show output into sections
     */
    parseGitShow(output) {
        const lines = output.split('\n');
        const metadata = {};
        const stats = [];
        const diffs = [];

        let section = 'metadata';
        let currentDiff = null;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            // Parse metadata
            if (section === 'metadata') {
                if (line.startsWith('commit ')) {
                    metadata.hash = line.substring(7).trim();
                } else if (line.startsWith('Author:')) {
                    metadata.author = line.substring(7).trim();
                } else if (line.startsWith('AuthorDate:')) {
                    metadata.authorDate = line.substring(11).trim();
                } else if (line.startsWith('Commit:')) {
                    metadata.committer = line.substring(7).trim();
                } else if (line.startsWith('CommitDate:')) {
                    metadata.commitDate = line.substring(11).trim();
                } else if (line.trim() === '') {
                    // Empty line might indicate start of message
                    if (metadata.author && !metadata.message) {
                        section = 'message';
                        metadata.message = '';
                    }
                }
            }
            // Parse commit message
            else if (section === 'message') {
                if (line.match(/^\s+\d+\s+files? changed/) || line.match(/^diff --git/)) {
                    section = 'stats';
                    i--; // Reprocess this line
                } else if (line.trim()) {
                    metadata.message += (metadata.message ? '\n' : '') + line.trim();
                }
            }
            // Parse file statistics
            else if (section === 'stats') {
                if (line.match(/^\s+\d+\s+files? changed/)) {
                    // Summary line, skip
                    continue;
                } else if (line.match(/^diff --git/)) {
                    section = 'diffs';
                    i--; // Reprocess
                } else if (line.includes('|')) {
                    const match = line.match(/^\s*(.+?)\s+\|\s+(\d+)\s+([+\-]+)?/);
                    if (match) {
                        stats.push({
                            file: match[1].trim(),
                            changes: parseInt(match[2]),
                            visualization: match[3] || ''
                        });
                    }
                }
            }
            // Parse diffs
            else if (section === 'diffs') {
                if (line.startsWith('diff --git')) {
                    if (currentDiff) {
                        diffs.push(currentDiff);
                    }
                    const match = line.match(/diff --git a\/(.+) b\/(.+)/);
                    currentDiff = {
                        file: match ? match[2] : 'unknown',
                        lines: []
                    };
                } else if (currentDiff) {
                    currentDiff.lines.push(line);
                }
            }
        }

        if (currentDiff) {
            diffs.push(currentDiff);
        }

        return { metadata, stats, diffs };
    }

    /**
     * Render metadata section
     */
    renderMetadata(metadata) {
        const section = document.createElement('div');
        section.className = 'commit-metadata';
        section.style.cssText = `
            background-color: #252526;
            padding: 20px;
            border-radius: 6px;
            margin-bottom: 20px;
            border: 1px solid #333;
        `;

        const html = `
            <div style="margin-bottom: 16px;">
                <div style="font-size: 16px; font-weight: 600; color: #4ec9b0; font-family: monospace; margin-bottom: 8px;">
                    ${metadata.hash ? metadata.hash.substring(0, 7) : 'unknown'}
                </div>
            </div>
            <div style="display: grid; gap: 12px;">
                <div style="display: flex; gap: 8px;">
                    <span style="color: #888; min-width: 80px;">Author:</span>
                    <span style="color: #cccccc;">${metadata.author || 'Unknown'}</span>
                </div>
                <div style="display: flex; gap: 8px;">
                    <span style="color: #888; min-width: 80px;">Date:</span>
                    <span style="color: #cccccc;">${metadata.authorDate || 'Unknown'}</span>
                </div>
                ${metadata.committer !== metadata.author ? `
                <div style="display: flex; gap: 8px;">
                    <span style="color: #888; min-width: 80px;">Committer:</span>
                    <span style="color: #cccccc;">${metadata.committer || 'Unknown'}</span>
                </div>
                ` : ''}
            </div>
            ${metadata.message ? `
            <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #333;">
                <div style="color: #888; margin-bottom: 8px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">
                    Commit Message
                </div>
                <div style="color: #cccccc; white-space: pre-wrap; line-height: 1.6;">
                    ${this.escapeHtml(metadata.message)}
                </div>
            </div>
            ` : ''}
        `;

        section.innerHTML = html;
        return section;
    }

    /**
     * Render files changed section
     */
    renderFilesChanged(stats) {
        const section = document.createElement('div');
        section.className = 'commit-files-changed';
        section.style.cssText = `
            background-color: #252526;
            padding: 20px;
            border-radius: 6px;
            margin-bottom: 20px;
            border: 1px solid #333;
        `;

        let totalChanges = 0;
        stats.forEach(stat => totalChanges += stat.changes);

        let html = `
            <div style="color: #888; margin-bottom: 16px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">
                Files Changed (${stats.length}) • ${totalChanges} changes
            </div>
            <div style="display: flex; flex-direction: column; gap: 8px;">
        `;

        stats.forEach(stat => {
            const additions = (stat.visualization.match(/\+/g) || []).length;
            const deletions = (stat.visualization.match(/-/g) || []).length;

            html += `
                <div style="display: flex; align-items: center; gap: 12px; padding: 8px; background-color: #1e1e1e; border-radius: 4px;">
                    <span style="font-family: monospace; color: #cccccc; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                        ${this.escapeHtml(stat.file)}
                    </span>
                    <span style="font-size: 11px; color: #888; min-width: 60px; text-align: right;">
                        ${stat.changes} ${stat.changes === 1 ? 'change' : 'changes'}
                    </span>
                    <div style="display: flex; gap: 2px; min-width: 100px;">
                        ${additions > 0 ? `<span style="color: #4ec9b0;">+${additions}</span>` : ''}
                        ${deletions > 0 ? `<span style="color: #f48771;">-${deletions}</span>` : ''}
                    </div>
                </div>
            `;
        });

        html += '</div>';
        section.innerHTML = html;
        return section;
    }

    /**
     * Render diffs section
     */
    renderDiffs(diffs) {
        const section = document.createElement('div');
        section.className = 'commit-diffs';
        section.style.cssText = `
            background-color: #252526;
            padding: 20px;
            border-radius: 6px;
            border: 1px solid #333;
        `;

        let html = `
            <div style="color: #888; margin-bottom: 16px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">
                Changes
            </div>
        `;

        diffs.forEach((diff, idx) => {
            if (idx > 0) {
                html += '<div style="height: 20px;"></div>';
            }

            html += `
                <div style="margin-bottom: 16px;">
                    <div style="background-color: #1e1e1e; padding: 8px 12px; border-radius: 4px 4px 0 0; border-bottom: 1px solid #333; font-family: monospace; font-size: 13px; color: #cccccc;">
                        ${this.escapeHtml(diff.file)}
                    </div>
                    <div style="background-color: #1a1a1a; padding: 12px; border-radius: 0 0 4px 4px; font-family: 'Fira Code', 'Consolas', monospace; font-size: 12px; line-height: 1.5; overflow-x: auto;">
                        ${this.renderDiffLines(diff.lines)}
                    </div>
                </div>
            `;
        });

        section.innerHTML = html;
        return section;
    }

    /**
     * Render individual diff lines with syntax highlighting
     */
    renderDiffLines(lines) {
        let html = '';

        lines.forEach(line => {
            let color = '#888';
            let bgColor = 'transparent';
            let prefix = '';

            if (line.startsWith('+')) {
                color = '#4ec9b0';
                bgColor = 'rgba(78, 201, 176, 0.15)';
                prefix = '+';
            } else if (line.startsWith('-')) {
                color = '#f48771';
                bgColor = 'rgba(244, 135, 113, 0.15)';
                prefix = '-';
            } else if (line.startsWith('@@')) {
                color = '#569cd6';
                bgColor = 'rgba(86, 156, 214, 0.15)';
            } else if (line.startsWith('diff') || line.startsWith('index') || line.startsWith('---') || line.startsWith('+++')) {
                color = '#666';
            }

            const content = this.escapeHtml(line || ' ');

            html += `<div style="color: ${color}; background-color: ${bgColor}; padding: 2px 4px; min-height: 18px;">${content}</div>`;
        });

        return html || '<div style="color: #666;">No changes</div>';
    }

    /**
     * Hide modal
     */
    hide() {
        if (this.modal) {
            this.modal.style.display = 'none';
            this.currentCommit = null;
        }
    }

    /**
     * Escape HTML special characters
     */
    escapeHtml(text) {
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return String(text).replace(/[&<>"']/g, m => map[m]);
    }

    /**
     * Cleanup
     */
    destroy() {
        if (this.modal) {
            this.modal.remove();
            this.modal = null;
        }
    }
}

module.exports = CommitViewer;

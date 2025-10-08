/**
 * CommitView - Dedicated view for displaying commit details
 *
 * Opens as a tab in the editor pane with:
 * - Sticky header with commit metadata
 * - File list with collapsible diff sections
 * - Better layout for large commits
 * - Syntax-highlighted diffs
 */

const { GitClient } = require('../lib/git/GitClient');

class CommitView {
    constructor(container, commit, repositoryPath) {
        console.log('[CommitView] Initializing for commit:', commit.hash);

        this.container = container;
        this.commit = commit;
        this.repositoryPath = repositoryPath;
        this.commitData = null;
        this.expandedFiles = new Set(); // Track which files are expanded

        this.init();
    }

    async init() {
        // Show loading state
        this.renderLoading();

        // Fetch commit details
        await this.loadCommitDetails();

        // Render the view
        this.render();
    }

    renderLoading() {
        this.container.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: center; height: 100%; color: #888;">
                <div style="text-align: center;">
                    <div style="font-size: 14px; margin-bottom: 8px;">Loading commit details...</div>
                    <div style="font-size: 12px;">${this.commit.hash.substring(0, 7)}</div>
                </div>
            </div>
        `;
    }

    async loadCommitDetails() {
        try {
            const client = new GitClient(this.repositoryPath);

            console.log('[CommitView] Fetching commit details for:', this.commit.hash);
            const output = await client.execute([
                'show',
                '--format=fuller',
                '--stat',
                '--patch',
                '--color=never',
                this.commit.hash
            ]);

            this.commitData = this.parseGitShow(output);
            console.log('[CommitView] Parsed commit data:', this.commitData);

        } catch (error) {
            console.error('[CommitView] Error loading commit:', error);
            this.commitData = {
                error: error.message,
                metadata: {},
                stats: [],
                diffs: []
            };
        }
    }

    parseGitShow(output) {
        const lines = output.split('\n');
        const metadata = {};
        const stats = [];
        const diffs = [];

        let section = 'metadata';
        let currentDiff = null;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

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
                    if (metadata.author && !metadata.message) {
                        section = 'message';
                        metadata.message = '';
                    }
                }
            }
            else if (section === 'message') {
                if (line.match(/^\s+\d+\s+files? changed/) || line.match(/^diff --git/)) {
                    section = 'stats';
                    i--;
                } else if (line.trim()) {
                    metadata.message += (metadata.message ? '\n' : '') + line.trim();
                }
            }
            else if (section === 'stats') {
                if (line.match(/^\s+\d+\s+files? changed/)) {
                    continue;
                } else if (line.match(/^diff --git/)) {
                    section = 'diffs';
                    i--;
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

    render() {
        if (this.commitData.error) {
            this.renderError();
            return;
        }

        const { metadata, stats, diffs } = this.commitData;

        this.container.innerHTML = '';
        this.container.style.cssText = `
            display: flex;
            flex-direction: column;
            height: 100%;
            background-color: #1e1e1e;
            overflow: hidden;
        `;

        // Create sticky header
        const header = this.createHeader(metadata);
        this.container.appendChild(header);

        // Create scrollable content area
        const content = document.createElement('div');
        content.style.cssText = `
            flex: 1;
            overflow-y: auto;
            padding: 20px;
        `;

        // Add files changed summary
        if (stats.length > 0) {
            const summary = this.createFilesSummary(stats);
            content.appendChild(summary);
        }

        // Add collapsible file diffs
        if (diffs.length > 0) {
            const diffsContainer = this.createDiffsContainer(diffs);
            content.appendChild(diffsContainer);
        }

        this.container.appendChild(content);
    }

    createHeader(metadata) {
        const header = document.createElement('div');
        header.style.cssText = `
            padding: 20px;
            background-color: #252526;
            border-bottom: 2px solid #333;
            flex-shrink: 0;
        `;

        header.innerHTML = `
            <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
                <span style="font-family: monospace; font-size: 16px; font-weight: 600; color: #4ec9b0;">
                    ${metadata.hash ? metadata.hash.substring(0, 7) : 'unknown'}
                </span>
                <span style="color: #666;">•</span>
                <span style="color: #888; font-size: 13px;">
                    ${this.formatDate(metadata.authorDate)}
                </span>
            </div>
            <div style="color: #cccccc; font-size: 14px; margin-bottom: 8px;">
                ${this.escapeHtml(metadata.message || 'No commit message')}
            </div>
            <div style="color: #888; font-size: 12px;">
                ${this.escapeHtml(metadata.author || 'Unknown author')}
            </div>
        `;

        return header;
    }

    createFilesSummary(stats) {
        const summary = document.createElement('div');
        summary.style.cssText = `
            background-color: #252526;
            padding: 16px;
            border-radius: 6px;
            margin-bottom: 20px;
            border: 1px solid #333;
        `;

        let totalAdditions = 0;
        let totalDeletions = 0;
        stats.forEach(stat => {
            totalAdditions += (stat.visualization.match(/\+/g) || []).length;
            totalDeletions += (stat.visualization.match(/-/g) || []).length;
        });

        summary.innerHTML = `
            <div style="color: #888; font-size: 12px; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.5px;">
                ${stats.length} ${stats.length === 1 ? 'file' : 'files'} changed
            </div>
            <div style="display: flex; gap: 16px; font-size: 13px;">
                <span style="color: #4ec9b0;">
                    <span style="font-weight: 600;">${totalAdditions}</span> additions
                </span>
                <span style="color: #f48771;">
                    <span style="font-weight: 600;">${totalDeletions}</span> deletions
                </span>
            </div>
        `;

        return summary;
    }

    createDiffsContainer(diffs) {
        const container = document.createElement('div');
        container.style.cssText = `
            display: flex;
            flex-direction: column;
            gap: 16px;
        `;

        diffs.forEach((diff, index) => {
            const fileSection = this.createFileSection(diff, index);
            container.appendChild(fileSection);
        });

        return container;
    }

    createFileSection(diff, index) {
        const section = document.createElement('div');
        section.className = `file-section-${index}`;
        section.style.cssText = `
            background-color: #252526;
            border-radius: 6px;
            border: 1px solid #333;
            overflow: hidden;
        `;

        // File header (clickable to expand/collapse)
        const header = document.createElement('div');
        header.style.cssText = `
            padding: 12px 16px;
            background-color: #2d2d30;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 12px;
            user-select: none;
            transition: background-color 0.2s;
        `;

        const isExpanded = this.expandedFiles.has(diff.file);
        const icon = isExpanded ? '▼' : '▶';

        header.innerHTML = `
            <span style="color: #888; font-size: 12px; width: 16px;">${icon}</span>
            <span style="font-family: monospace; color: #cccccc; font-size: 13px; flex: 1;">
                ${this.escapeHtml(diff.file)}
            </span>
            <span style="color: #888; font-size: 11px;">
                ${diff.lines.length} ${diff.lines.length === 1 ? 'line' : 'lines'}
            </span>
        `;

        header.addEventListener('mouseenter', () => {
            header.style.backgroundColor = '#3e3e42';
        });
        header.addEventListener('mouseleave', () => {
            header.style.backgroundColor = '#2d2d30';
        });

        header.addEventListener('click', () => {
            this.toggleFileExpansion(diff.file, index);
        });

        section.appendChild(header);

        // Diff content (initially hidden if not expanded)
        const content = document.createElement('div');
        content.className = `diff-content-${index}`;
        content.style.cssText = `
            display: ${isExpanded ? 'block' : 'none'};
            background-color: #1e1e1e;
            padding: 12px;
            font-family: 'Fira Code', 'Consolas', monospace;
            font-size: 12px;
            line-height: 1.6;
            overflow-x: auto;
            max-height: 600px;
            overflow-y: auto;
        `;

        content.innerHTML = this.renderDiffLines(diff.lines);
        section.appendChild(content);

        return section;
    }

    toggleFileExpansion(fileName, index) {
        if (this.expandedFiles.has(fileName)) {
            this.expandedFiles.delete(fileName);
        } else {
            this.expandedFiles.add(fileName);
        }

        // Re-render just this section
        const section = this.container.querySelector(`.file-section-${index}`);
        if (section) {
            const diff = this.commitData.diffs.find(d => d.file === fileName);
            if (diff) {
                const newSection = this.createFileSection(diff, index);
                section.replaceWith(newSection);
            }
        }
    }

    renderDiffLines(lines) {
        let html = '';

        lines.forEach(line => {
            let color = '#888';
            let bgColor = 'transparent';

            if (line.startsWith('+')) {
                color = '#4ec9b0';
                bgColor = 'rgba(78, 201, 176, 0.15)';
            } else if (line.startsWith('-')) {
                color = '#f48771';
                bgColor = 'rgba(244, 135, 113, 0.15)';
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

    renderError() {
        this.container.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: center; height: 100%; color: #f44336;">
                <div style="text-align: center; padding: 20px;">
                    <div style="font-size: 16px; margin-bottom: 12px;">Failed to load commit</div>
                    <div style="font-size: 12px; color: #888;">${this.commitData.error}</div>
                </div>
            </div>
        `;
    }

    formatDate(dateString) {
        if (!dateString) return 'Unknown date';

        try {
            const date = new Date(dateString);
            const now = new Date();
            const diffMs = now - date;
            const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

            if (diffDays === 0) {
                return 'Today';
            } else if (diffDays === 1) {
                return 'Yesterday';
            } else if (diffDays < 7) {
                return `${diffDays} days ago`;
            } else if (diffDays < 30) {
                const weeks = Math.floor(diffDays / 7);
                return `${weeks} ${weeks === 1 ? 'week' : 'weeks'} ago`;
            } else {
                return date.toLocaleDateString();
            }
        } catch (error) {
            return dateString;
        }
    }

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

    destroy() {
        // Cleanup
        this.container.innerHTML = '';
    }
}

module.exports = CommitView;

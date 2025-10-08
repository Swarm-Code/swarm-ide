/**
 * GitPanel - Git operations panel
 *
 * Displays:
 * - Modified files list
 * - Staged files list
 * - Commit message input
 * - Commit/stage/unstage/discard buttons
 *
 * Usage:
 *   const gitPanel = new GitPanel();
 */

const path = require('path');
const eventBus = require('../modules/EventBus');
const { GitClient } = require('../lib/git/GitClient');

// Git integration
let gitStore = null;
let gitService = null;
let gitBranchService = null;

// Lazy load Git services
function getGitServices() {
    if (!gitStore) {
        try {
            gitService = require('../services/GitService').getInstance();
            gitStore = require('../modules/GitStore').getInstance();

            // Initialize GitBranchService with gitService
            if (gitService && !gitBranchService) {
                const { GitBranchService } = require('../services/GitBranchService');
                gitBranchService = new GitBranchService(gitService);
            }
        } catch (error) {
            console.warn('[GitPanel] Git services not available:', error.message);
        }
    }
    return { gitStore, gitService, gitBranchService };
}

class GitPanel {
    constructor() {
        this.panel = null;
        this.modifiedFilesList = null;
        this.stagedFilesList = null;
        this.commitMessageInput = null;
        this.branchSelect = null;
        this.commitHistoryList = null;
        this.commitViewer = null;
        this.isVisible = false;
        this.modifiedFiles = [];
        this.stagedFiles = [];
        this.currentBranch = null;
        this.branches = [];
        this.commits = [];

        // Upstream status tracking
        this.upstreamStatus = null;
        this.upstreamStatusRefreshInterval = null;
        // Merge state tracking
        this.mergeDialog = null;
        this.isMerging = false;
        this.conflictedFiles = [];
        this.abortMergeBtn = null;


        this.render();
        this.setupEventListeners();

        // Initialize commit viewer
        this.commitViewer = new CommitViewer();
    }

    /**
     * Render the Git panel
     */
    render() {
        // Create panel container
        this.panel = document.createElement('div');
        this.panel.className = 'git-panel panel';
        this.panel.style.display = 'none'; // Hidden by default

        // Panel header
        const header = document.createElement('div');
        header.className = 'git-panel-header panel-header';

        const title = document.createElement('h3');
        title.textContent = 'Source Control';

        const closeBtn = document.createElement('button');
        closeBtn.className = 'panel-close-btn';
        closeBtn.innerHTML = '×';
        closeBtn.title = 'Close';
        closeBtn.addEventListener('click', () => this.hide());

        header.appendChild(title);
        header.appendChild(closeBtn);

        // Panel content
        const content = document.createElement('div');
        content.className = 'git-panel-content panel-content';
        content.style.cssText = `
            overflow-y: auto;
            flex: 1;
        `;

        // Branch switcher section
        const branchSection = document.createElement('div');
        branchSection.className = 'git-branch-section';
        branchSection.style.cssText = `
            padding: 12px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            background-color: rgba(0, 0, 0, 0.2);
        `;

        const branchHeader = document.createElement('div');
        branchHeader.style.cssText = `
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 8px;
        `;

        const branchIcon = document.createElement('span');
        branchIcon.textContent = '⎇';
        branchIcon.style.cssText = 'font-size: 16px; color: #28a745;';

        const branchLabel = document.createElement('span');
        branchLabel.textContent = 'Branch';
        branchLabel.style.cssText = 'font-weight: 500; font-size: 12px; color: rgba(255, 255, 255, 0.7);';

        // Status indicators (ahead/behind)
        this.upstreamStatusIndicator = document.createElement('span');
        this.upstreamStatusIndicator.className = 'git-upstream-status';
        this.upstreamStatusIndicator.style.cssText = `
            margin-left: auto;
            font-size: 12px;
            display: none;
            gap: 4px;
            align-items: center;
        `;

        branchHeader.appendChild(branchIcon);
        branchHeader.appendChild(branchLabel);
        branchHeader.appendChild(this.upstreamStatusIndicator);

        this.branchSelect = document.createElement('select');
        this.branchSelect.className = 'git-branch-select';
        this.branchSelect.style.cssText = `
            width: 100%;
            padding: 6px 8px;
            background-color: rgba(0, 0, 0, 0.3);
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 4px;
            color: #ffffff;
            font-size: 13px;
            cursor: pointer;
            outline: none;
        `;
        // Style dropdown options
        this.branchSelect.addEventListener('focus', function() {
            const options = this.querySelectorAll('option');
            options.forEach(opt => {
                opt.style.backgroundColor = '#2d2d2d';
                opt.style.color = '#ffffff';
            });
        });
        this.branchSelect.addEventListener('change', (e) => this.switchBranch(e.target.value));

        const branchButtons = document.createElement('div');
        branchButtons.style.cssText = 'display: flex; gap: 4px; margin-top: 8px;';

        const newBranchBtn = document.createElement('button');
        newBranchBtn.className = 'git-btn';
        newBranchBtn.textContent = '+ New Branch';
        newBranchBtn.style.cssText = 'flex: 1; font-size: 11px; padding: 4px 8px;';
        newBranchBtn.addEventListener('click', () => this.createNewBranch());

        const pullBtn = document.createElement('button');
        pullBtn.className = 'git-btn git-pull-btn';
        pullBtn.textContent = '↓ Pull';
        pullBtn.title = 'Pull changes from remote';
        pullBtn.style.cssText = 'flex: 1; font-size: 11px; padding: 4px 8px;';
        pullBtn.addEventListener('click', () => this.pullChanges());
        this.pullBtn = pullBtn; // Store reference for loading state

        const pushBtn = document.createElement('button');
        pushBtn.className = 'git-btn git-push-btn';
        pushBtn.textContent = '↑ Push';
        pushBtn.title = 'Push changes to remote';
        pushBtn.style.cssText = 'flex: 1; font-size: 11px; padding: 4px 8px;';
        pushBtn.addEventListener('click', () => this.push());
        this.pushBtn = pushBtn; // Store reference for loading state

        const fetchBtn = document.createElement('button');
        fetchBtn.className = 'git-btn git-fetch-btn';
        fetchBtn.textContent = '↻ Fetch';
        fetchBtn.title = 'Fetch changes from remote (sync icon)';
        fetchBtn.style.cssText = 'flex: 1; font-size: 11px; padding: 4px 8px;';
        fetchBtn.addEventListener('click', () => this.fetchChanges());
        this.fetchBtn = fetchBtn; // Store reference for loading state

        const refreshBranchBtn = document.createElement('button');
        refreshBranchBtn.className = 'git-btn';
        refreshBranchBtn.textContent = '↻';
        refreshBranchBtn.title = 'Refresh branches';
        refreshBranchBtn.style.cssText = 'padding: 4px 8px;';
        refreshBranchBtn.addEventListener('click', () => this.loadBranches());

        const renameBranchBtn = document.createElement('button');
        renameBranchBtn.className = 'git-btn';
        renameBranchBtn.textContent = '✎';
        renameBranchBtn.title = 'Rename current branch';
        renameBranchBtn.style.cssText = 'padding: 4px 8px; font-size: 14px;';
        renameBranchBtn.addEventListener('click', () => this.renameBranch());

        const deleteBranchBtn = document.createElement('button');
        deleteBranchBtn.className = 'git-btn';
        deleteBranchBtn.textContent = '🗑️';
        deleteBranchBtn.title = 'Delete branch';
        deleteBranchBtn.style.cssText = 'padding: 4px 8px; font-size: 12px;';
        deleteBranchBtn.addEventListener('click', () => this.deleteBranch());

        branchButtons.appendChild(newBranchBtn);
        branchButtons.appendChild(pullBtn);
        branchButtons.appendChild(pushBtn);
        branchButtons.appendChild(fetchBtn);
        branchButtons.appendChild(refreshBranchBtn);
        branchButtons.appendChild(renameBranchBtn);
        branchButtons.appendChild(deleteBranchBtn);

        branchSection.appendChild(branchHeader);

        const mergeBtn = document.createElement('button');
        mergeBtn.className = 'git-btn';
        mergeBtn.textContent = '⚡ Merge';
        mergeBtn.title = 'Merge branch into current';
        mergeBtn.style.cssText = 'flex: 1; font-size: 11px; padding: 4px 8px;';
        mergeBtn.addEventListener('click', () => this.openMergeDialog());

        branchButtons.appendChild(mergeBtn);
        branchSection.appendChild(this.branchSelect);
        branchSection.appendChild(branchButtons);

        // Commit message section
        const commitSection = document.createElement('div');
        commitSection.className = 'git-commit-section';

        this.commitMessageInput = document.createElement('textarea');
        this.commitMessageInput.className = 'git-commit-message';
        this.commitMessageInput.placeholder = 'Commit message (Ctrl+Enter to commit)';
        this.commitMessageInput.rows = 3;

        const commitButtonsRow = document.createElement('div');
        commitButtonsRow.className = 'git-commit-buttons';

        const commitBtn = document.createElement('button');
        commitBtn.className = 'git-btn git-btn-primary';
        commitBtn.textContent = 'Commit';
        commitBtn.addEventListener('click', () => this.commit());

        const commitAndPushBtn = document.createElement('button');
        commitAndPushBtn.className = 'git-btn';
        commitAndPushBtn.textContent = 'Commit & Push';
        commitAndPushBtn.addEventListener('click', () => this.commitAndPush());

        commitButtonsRow.appendChild(commitBtn);
        commitButtonsRow.appendChild(commitAndPushBtn);

        commitSection.appendChild(this.commitMessageInput);
        commitSection.appendChild(commitButtonsRow);

        // Staged files section
        const stagedSection = document.createElement('div');
        stagedSection.className = 'git-section';

        const stagedHeader = document.createElement('div');
        stagedHeader.className = 'git-section-header';
        stagedHeader.innerHTML = `
            <span class="git-section-title">Staged Changes</span>
            <span class="git-section-count" id="git-staged-count">0</span>
        `;

        this.stagedFilesList = document.createElement('div');
        this.stagedFilesList.className = 'git-files-list';

        stagedSection.appendChild(stagedHeader);
        stagedSection.appendChild(this.stagedFilesList);

        // Modified files section
        const modifiedSection = document.createElement('div');
        modifiedSection.className = 'git-section';

        const modifiedHeader = document.createElement('div');
        modifiedHeader.className = 'git-section-header';
        modifiedHeader.innerHTML = `
            <span class="git-section-title">Changes</span>
            <span class="git-section-count" id="git-modified-count">0</span>
        `;

        this.modifiedFilesList = document.createElement('div');
        this.modifiedFilesList.className = 'git-files-list';

        modifiedSection.appendChild(modifiedHeader);
        modifiedSection.appendChild(this.modifiedFilesList);

        // Commit history section
        const historySection = document.createElement('div');
        historySection.className = 'git-section git-history-section';
        historySection.style.cssText = 'margin-top: 8px;';

        const historyHeader = document.createElement('div');
        historyHeader.className = 'git-section-header';
        historyHeader.style.cssText = 'cursor: pointer; user-select: none;';
        historyHeader.innerHTML = `
            <span class="git-section-title">▶ Commit History</span>
            <span class="git-section-count">0</span>
        `;

        // Make history collapsible
        let historyExpanded = false;
        historyHeader.addEventListener('click', () => {
            historyExpanded = !historyExpanded;
            this.commitHistoryList.style.display = historyExpanded ? 'block' : 'none';
            historyHeader.querySelector('.git-section-title').textContent =
                `${historyExpanded ? '▼' : '▶'} Commit History`;
            if (historyExpanded && this.commits.length === 0) {
                this.loadCommitHistory();
            }
        });

        this.commitHistoryList = document.createElement('div');
        this.commitHistoryList.className = 'git-commits-list';
        this.commitHistoryList.style.cssText = `
            display: none;
            max-height: 300px;
            overflow-y: auto;
        `;

        historySection.appendChild(historyHeader);
        historySection.appendChild(this.commitHistoryList);

        // Assemble content
        content.appendChild(branchSection);
        content.appendChild(commitSection);
        content.appendChild(stagedSection);
        content.appendChild(modifiedSection);
        content.appendChild(historySection);

        // Assemble panel
        this.panel.appendChild(header);
        this.panel.appendChild(content);

        // Append to container (next to sidebar)
        const container = document.querySelector('.container');
        if (container) {
            const sidebar = container.querySelector('.sidebar');
            if (sidebar) {
                // Insert Git panel after sidebar
                sidebar.parentNode.insertBefore(this.panel, sidebar.nextSibling);
            } else {
                container.appendChild(this.panel);
            }
        } else {
            document.body.appendChild(this.panel);
        }

        // Setup keyboard shortcuts
        this.commitMessageInput.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'Enter') {
                e.preventDefault();
                this.commit();
            }
        });
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Listen for Git status changes
        eventBus.on('git:status-changed', (data) => {
            this.updateFilesList(data);
        });

        // Listen for repository changes
        eventBus.on('git:repository-changed', () => {
            this.refreshStatus();
        });

        // Listen for file changes
        eventBus.on('file:saved', () => {
            this.refreshStatus();
        });

        // Listen for panel toggle command
        eventBus.on('git:toggle-panel', () => {
            this.toggle();
        });

        // Listen for hide panel command (from Files icon)
        eventBus.on('git:hide-panel', () => {
            this.hide();
        });
    }

    /**
     * Update files list from Git status
     * @param {Object} data - Git status data
     */
    updateFilesList(data) {
        if (!data) return;

        console.log('[GitPanel] Received status data:', data);

        // Handle raw status object from git:status-changed event
        if (data.files && Array.isArray(data.files)) {
            console.log('[GitPanel] Processing files array:', data.files.length, 'files');

            // Filter files into categories based on FileStatus properties
            this.stagedFiles = data.files.filter(f => {
                // Check if file is staged (has changes in index)
                return f.isStaged === true ||
                       (f.indexStatus && f.indexStatus !== '.' && f.indexStatus !== '?');
            }).map(f => ({
                path: f.path,
                status: f.indexStatus || 'M'
            }));

            this.modifiedFiles = data.files.filter(f => {
                // Check if file has working tree changes (not staged or untracked)
                return (f.workingTreeStatus && f.workingTreeStatus !== '.') ||
                       f.isUntracked === true;
            }).map(f => ({
                path: f.path,
                status: f.workingTreeStatus || f.indexStatus || '?'
            }));

            console.log('[GitPanel] Staged files:', this.stagedFiles.length);
            console.log('[GitPanel] Modified files:', this.modifiedFiles.length);
        } else {
            // Fallback for already-processed data
            this.modifiedFiles = data.modifiedFiles || [];
            this.stagedFiles = data.stagedFiles || [];
            console.log('[GitPanel] Using pre-processed data');
        }

        // Update staged files
        this.renderStagedFiles();

        // Update modified files
        this.renderModifiedFiles();

        // Update counts using direct ID selectors
        const stagedCount = this.panel.querySelector('#git-staged-count');
        if (stagedCount) {
            stagedCount.textContent = this.stagedFiles.length;
        }

        const modifiedCount = this.panel.querySelector('#git-modified-count');
        if (modifiedCount) {
            modifiedCount.textContent = this.modifiedFiles.length;
        }
    }

    /**
     * Render staged files list
     */
    renderStagedFiles() {
        this.stagedFilesList.innerHTML = '';

        if (this.stagedFiles.length === 0) {
            const emptyMsg = document.createElement('div');
            emptyMsg.className = 'git-empty-message';
            emptyMsg.textContent = 'No staged changes';
            this.stagedFilesList.appendChild(emptyMsg);
            return;
        }

        this.stagedFiles.forEach(file => {
            const fileItem = this.createFileItem(file, true);
            this.stagedFilesList.appendChild(fileItem);
        });
    }

    /**
     * Render modified files list
     */
    renderModifiedFiles() {
        this.modifiedFilesList.innerHTML = '';

        if (this.modifiedFiles.length === 0) {
            const emptyMsg = document.createElement('div');
            emptyMsg.className = 'git-empty-message';
            emptyMsg.textContent = 'No changes';
            this.modifiedFilesList.appendChild(emptyMsg);
            return;
        }

        this.modifiedFiles.forEach(file => {
            const fileItem = this.createFileItem(file, false);
            this.modifiedFilesList.appendChild(fileItem);
        });
    }

    /**
     * Create file item element
     * @param {Object} file - File status object
     * @param {boolean} isStaged - Whether file is staged
     * @returns {HTMLElement} File item element
     */
    createFileItem(file, isStaged) {
        const item = document.createElement('div');
        item.className = 'git-file-item';

        // File status icon
        const statusIcon = document.createElement('span');
        statusIcon.className = 'git-file-status';
        statusIcon.textContent = this.getStatusIcon(file.status);
        statusIcon.title = this.getStatusLabel(file.status);

        // File name
        const fileName = document.createElement('span');
        fileName.className = 'git-file-name';
        fileName.textContent = file.path;
        fileName.title = file.path;

        // Action buttons
        const actions = document.createElement('div');
        actions.className = 'git-file-actions';

        if (isStaged) {
            // Unstage button
            const unstageBtn = document.createElement('button');
            unstageBtn.className = 'git-file-action-btn';
            unstageBtn.title = 'Unstage';
            unstageBtn.textContent = '−';
            unstageBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.unstageFile(file.path);
            });
            actions.appendChild(unstageBtn);
        } else {
            // Stage button
            const stageBtn = document.createElement('button');
            stageBtn.className = 'git-file-action-btn';
            stageBtn.title = 'Stage';
            stageBtn.textContent = '+';
            stageBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.stageFile(file.path);
            });

            // Discard button
            const discardBtn = document.createElement('button');
            discardBtn.className = 'git-file-action-btn git-file-discard-btn';
            discardBtn.title = 'Discard';
            discardBtn.textContent = '↺';
            discardBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.discardFile(file.path);
            });

            actions.appendChild(stageBtn);
            actions.appendChild(discardBtn);
        }

        // Click to open diff
        item.addEventListener('click', () => {
            this.openFileDiff(file.path);
        });

        item.appendChild(statusIcon);
        item.appendChild(fileName);
        item.appendChild(actions);

        return item;
    }

    /**
     * Get status icon for file status
     * @param {string} status - File status
     * @returns {string} Status icon
     */
    getStatusIcon(status) {
        const icons = {
            'M': 'M',  // Modified
            'A': 'A',  // Added
            'D': 'D',  // Deleted
            'R': 'R',  // Renamed
            'C': 'C',  // Copied
            'U': 'U',  // Updated
            '?': '?'   // Untracked
        };
        return icons[status] || status;
    }

    /**
     * Get status label for file status
     * @param {string} status - File status
     * @returns {string} Status label
     */
    getStatusLabel(status) {
        const labels = {
            'M': 'Modified',
            'A': 'Added',
            'D': 'Deleted',
            'R': 'Renamed',
            'C': 'Copied',
            'U': 'Updated',
            '?': 'Untracked'
        };
        return labels[status] || status;
    }

    /**
     * Stage a file
     * @param {string} filePath - File path
     */
    async stageFile(filePath) {
        try {
            const { gitService } = getGitServices();
            if (!gitService) return;

            console.log('[GitPanel] Staging file:', filePath);
            await gitService.getRepository().stage(filePath);
            await this.refreshStatus();
        } catch (error) {
            console.error('[GitPanel] Failed to stage file:', error);
            this.showError('Failed to stage file: ' + error.message);
        }
    }

    /**
     * Unstage a file
     * @param {string} filePath - File path
     */
    async unstageFile(filePath) {
        try {
            const { gitService } = getGitServices();
            if (!gitService) return;

            console.log('[GitPanel] Unstaging file:', filePath);
            await gitService.getRepository().unstage(filePath);
            await this.refreshStatus();
        } catch (error) {
            console.error('[GitPanel] Failed to unstage file:', error);
            this.showError('Failed to unstage file: ' + error.message);
        }
    }

    /**
     * Discard changes to a file
     * @param {string} filePath - File path
     */
    async discardFile(filePath) {
        if (!confirm(`Are you sure you want to discard changes to ${filePath}? This cannot be undone.`)) {
            return;
        }

        try {
            const { gitService } = getGitServices();
            if (!gitService) return;

            console.log('[GitPanel] Discarding changes to file:', filePath);
            await gitService.getRepository().discard(filePath);
            await this.refreshStatus();

            // Emit event to reload file if it's open
            eventBus.emit('file:reload', { path: filePath });
        } catch (error) {
            console.error('[GitPanel] Failed to discard file:', error);
            this.showError('Failed to discard file: ' + error.message);
        }
    }

    /**
     * Open file diff view
     * @param {string} filePath - File path (relative to repository root)
     */
    openFileDiff(filePath) {
        console.log('[GitPanel] Opening file with diff:', filePath);

        // Convert relative path to absolute path
        const { gitStore } = getGitServices();
        const repoPath = gitStore?.getCurrentRepository();
        const absolutePath = repoPath ? path.resolve(repoPath, filePath) : filePath;

        console.log('[GitPanel] Resolved absolute path:', absolutePath);

        // Open the file using standard event with git diff enabled
        eventBus.emit('file:selected', {
            path: absolutePath,
            enableGitDiff: true
        });
        // Request diff gutter rendering after file opens
        eventBus.emit('git:show-diff', { filePath: absolutePath });
    }

    /**
     * Commit staged changes
     */
    async commit() {
        const message = this.commitMessageInput.value.trim();

        if (!message) {
            this.showError('Please enter a commit message');
            return;
        }

        if (this.stagedFiles.length === 0) {
            this.showError('No staged changes to commit');
            return;
        }

        try {
            const { gitService } = getGitServices();
            if (!gitService) return;

            console.log('[GitPanel] Committing with message:', message);
            await gitService.getRepository().commit(message);

            // Clear commit message
            this.commitMessageInput.value = '';

            // Refresh status
            await this.refreshStatus();

            // Emit event
            eventBus.emit('git:commit-created', { message });

            this.showSuccess('Changes committed successfully');
        } catch (error) {
            console.error('[GitPanel] Failed to commit:', error);
            this.showError('Failed to commit: ' + error.message);
        }
    }

    /**
     * Push changes to remote
     */
    async push() {
        console.log('[GitPanel] Push button clicked');

        const { gitService, gitStore } = getGitServices();
        if (!gitService || !gitStore) {
            console.error('[GitPanel] Git services not available for push');
            this.showError('Git services not available');
            return;
        }

        try {
            const repoPath = gitStore.getCurrentRepository();
            if (!repoPath) {
                console.error('[GitPanel] No repository path available');
                this.showError('No repository available');
                return;
            }

            // Get current branch
            const client = new GitClient(repoPath);
            const currentBranchOutput = await client.execute(['branch', '--show-current']);
            const currentBranch = currentBranchOutput.trim();

            if (!currentBranch) {
                console.error('[GitPanel] No current branch detected');
                this.showError('No branch checked out');
                return;
            }

            console.log('[GitPanel] Pushing branch:', currentBranch);

            // Check if branch has upstream
            let hasUpstream = false;
            try {
                const upstreamOutput = await client.execute(['rev-parse', '--abbrev-ref', `${currentBranch}@{u}`]);
                hasUpstream = upstreamOutput.trim().length > 0;
                console.log('[GitPanel] Branch has upstream:', hasUpstream, upstreamOutput.trim());
            } catch (error) {
                console.log('[GitPanel] No upstream branch configured:', error.message);
                hasUpstream = false;
            }

            // Build push options
            const pushOptions = {
                remote: 'origin',
                branch: currentBranch
            };

            // Set upstream if this is the first push
            if (!hasUpstream) {
                pushOptions.setUpstream = true;
                console.log('[GitPanel] Will set upstream tracking for first push');
            }

            console.log('[GitPanel] Push options:', JSON.stringify(pushOptions));

            // Show loading state on push button
            if (this.pushBtn) {
                this.pushBtn.textContent = '⟳ Pushing...';
                this.pushBtn.disabled = true;
            }

            // Emit push started event
            console.log('[GitPanel] Emitting git:push-started event');
            eventBus.emit('git:push-started');

            // Execute push via GitService
            console.log('[GitPanel] Calling gitService.push() with options:', pushOptions);
            const success = await gitService.push(pushOptions);

            if (success) {
                console.log('[GitPanel] Push completed successfully');
                console.log('[GitPanel] Emitting git:push-completed event');

                // Refresh status to update ahead/behind counts
                await this.refreshStatus();
                await this.loadBranches();

                this.showSuccess(`Successfully pushed to origin/${currentBranch}`);
            } else {
                console.error('[GitPanel] Push failed (returned false)');
                this.showError('Push failed');
            }

        } catch (error) {
            console.error('[GitPanel] Push failed with error:', error);
            console.error('[GitPanel] Error message:', error.message);
            console.error('[GitPanel] Error stack:', error.stack);
            console.log('[GitPanel] Emitting git:push-failed event');

            // Check for common error types
            let errorMessage = error.message;

            if (error.message.includes('Authentication') || error.message.includes('auth')) {
                errorMessage = 'Authentication failed. Please check your credentials.';
                console.error('[GitPanel] Authentication error detected');
            } else if (error.message.includes('Could not read from remote') || error.message.includes('Connection')) {
                errorMessage = 'Connection failed. Please check your network.';
                console.error('[GitPanel] Connection error detected');
            } else if (error.message.includes('rejected')) {
                errorMessage = 'Push rejected. Try pulling changes first.';
                console.error('[GitPanel] Push rejected - likely needs pull first');
            }

            this.showError(`Push failed: ${errorMessage}`);
            eventBus.emit('git:push-failed', { error: error.message });
        } finally {
            // Restore push button state
            if (this.pushBtn) {
                this.pushBtn.textContent = '↑ Push';
                this.pushBtn.disabled = false;
            }
            console.log('[GitPanel] Push operation completed, button state restored');
        }
    }

    /**
     * Commit and push changes
     */
    async commitAndPush() {
        console.log('[GitPanel] Commit and push initiated');

        // First commit the changes
        await this.commit();

        // Check if commit was successful by verifying commit message was cleared
        if (this.commitMessageInput.value.trim() === '') {
            console.log('[GitPanel] Commit successful, proceeding with push');
            // Then push to remote
            await this.push();
        } else {
            console.log('[GitPanel] Commit failed or was cancelled, skipping push');
        }
    }

    /**
     * Pull changes from remote repository
     * Handles loading state, success/error notifications, and merge conflicts
     */
    async pullChanges() {
        const { gitService, gitStore } = getGitServices();
        if (!gitService || !gitStore) {
            console.error('[GitPanel] Git services not available for pull operation');
            this.showError('Git services not available');
            return;
        }

        console.log('[GitPanel] Pull button clicked');
        console.log('[GitPanel] Current branch:', this.currentBranch);

        // Get current repository info
        const repoPath = gitStore.getCurrentRepository();
        if (!repoPath) {
            console.error('[GitPanel] No repository path available for pull');
            this.showError('No repository available');
            return;
        }

        console.log('[GitPanel] Repository path:', repoPath);

        // Set loading state
        const originalText = this.pullBtn.textContent;
        this.pullBtn.textContent = 'Pulling...';
        this.pullBtn.disabled = true;
        console.log('[GitPanel] Pull button set to loading state');

        try {
            // Prepare pull options
            const pullOptions = {
                remote: 'origin'
            };

            // If we have a current branch, pull from it
            if (this.currentBranch) {
                pullOptions.branch = this.currentBranch;
            }

            console.log('[GitPanel] Pull parameters:', {
                remote: pullOptions.remote,
                branch: pullOptions.branch || '(default)',
                repoPath: repoPath
            });

            // Emit git:pull-started event
            console.log('[GitPanel] Emitting git:pull-started event');
            eventBus.emit('git:pull-started', {
                remote: pullOptions.remote,
                branch: pullOptions.branch
            });

            // Perform pull operation using GitService
            console.log('[GitPanel] Calling gitService.pull() with options:', pullOptions);
            const pullResult = await gitService.pull(pullOptions);

            console.log('[GitPanel] Pull operation completed, result:', pullResult);

            // Check if pull was successful
            if (!pullResult) {
                console.error('[GitPanel] Pull operation returned false');
                this.showError('Pull failed - check console for details');

                // Emit git:pull-failed event
                console.log('[GitPanel] Emitting git:pull-failed event');
                eventBus.emit('git:pull-failed', {
                    error: 'Pull operation failed'
                });

                return;
            }

            console.log('[GitPanel] Pull completed successfully, refreshing status');

            // Refresh file status to get updated state
            await this.refreshStatus();
            console.log('[GitPanel] File status refreshed after pull');

            // Get current status to check for conflicts
            const status = await gitStore.getStatus();
            console.log('[GitPanel] Current status after pull:', {
                totalFiles: status?.files?.length || 0,
                branch: status?.branch
            });

            // Check for conflicted files
            const conflictedFiles = status?.files?.filter(f => {
                // Files with 'U' status or both index and working tree changes indicate conflicts
                const isConflicted = f.isUnmerged === true ||
                                   (f.indexStatus === 'U' || f.workingTreeStatus === 'U') ||
                                   (f.indexStatus && f.indexStatus !== '.' && f.workingTreeStatus && f.workingTreeStatus !== '.');
                return isConflicted;
            }) || [];

            console.log('[GitPanel] Conflicted files detected:', conflictedFiles.length);

            if (conflictedFiles.length > 0) {
                console.log('[GitPanel] Pull completed with conflicts:');
                conflictedFiles.forEach((file, index) => {
                    console.log(`[GitPanel]   ${index + 1}. ${file.path} (index: ${file.indexStatus}, working: ${file.workingTreeStatus})`);
                });

                this.showError(`Pull completed with ${conflictedFiles.length} conflict(s). Resolve conflicts and commit.`);

                // Emit git:pull-completed event with conflict info
                console.log('[GitPanel] Emitting git:pull-completed event with conflicts');
                eventBus.emit('git:pull-completed', {
                    success: true,
                    conflicts: true,
                    conflictedFiles: conflictedFiles.map(f => f.path)
                });
            } else {
                // No conflicts - successful pull
                console.log('[GitPanel] Pull completed successfully with no conflicts');

                // Try to get commit count (optional, best effort)
                let commitCountMsg = 'Changes pulled successfully';
                try {
                    // Get number of commits pulled by comparing with remote
                    // This is a best-effort approach
                    commitCountMsg = 'Changes pulled successfully';
                } catch (err) {
                    console.log('[GitPanel] Could not determine commit count:', err.message);
                }

                this.showSuccess(commitCountMsg);

                // Emit git:pull-completed event
                console.log('[GitPanel] Emitting git:pull-completed event (no conflicts)');
                eventBus.emit('git:pull-completed', {
                    success: true,
                    conflicts: false
                });
            }

            // Refresh branches to update tracking info
            console.log('[GitPanel] Refreshing branches after pull');
            await this.loadBranches();

            // Update GitStore status and cache
            console.log('[GitPanel] GitStore status and cache updated via refreshStatus()');

        } catch (error) {
            console.error('[GitPanel] Pull operation failed with error:', error);
            console.error('[GitPanel] Error message:', error.message);
            console.error('[GitPanel] Error stack:', error.stack);

            this.showError('Pull failed: ' + error.message);

            // Emit git:pull-failed event
            console.log('[GitPanel] Emitting git:pull-failed event due to exception');
            eventBus.emit('git:pull-failed', {
                error: error.message,
                stack: error.stack
            });

            // Still try to refresh status to show current state
            try {
                console.log('[GitPanel] Attempting to refresh status after error');
                await this.refreshStatus();
            } catch (refreshError) {
                console.error('[GitPanel] Failed to refresh status after error:', refreshError);
            }
        } finally {
            // Reset button state
            this.pullBtn.textContent = originalText;
            this.pullBtn.disabled = false;
            console.log('[GitPanel] Pull button state restored');
        }
    }

    /**
     * Fetch changes from remote repository
     * Updates remote tracking branches without merging
     */
    async fetchChanges() {
        console.log('[GitPanel] ========== FETCH CHANGES ==========');
        console.log('[GitPanel] Fetch button clicked');
        console.log('[GitPanel] Current branch:', this.currentBranch);

        const { gitService, gitStore } = getGitServices();
        if (!gitService || !gitStore) {
            console.error('[GitPanel] Git services not available for fetch');
            this.showError('Git services not available');
            return;
        }

        const repoPath = gitStore.getCurrentRepository();
        if (!repoPath) {
            console.error('[GitPanel] No repository path available');
            this.showError('No repository selected');
            return;
        }

        // Find fetch button and set loading state
        const fetchBtn = this.panel.querySelector('[title*="Fetch"]');
        const originalText = fetchBtn ? fetchBtn.textContent : '↻ Fetch';

        if (fetchBtn) {
            fetchBtn.textContent = '⟳ Fetching...';
            fetchBtn.disabled = true;
        }

        try {
            console.log('[GitPanel] Emitting git:fetch-started event');
            eventBus.emit('git:fetch-started', {
                remote: 'origin',
                repository: repoPath
            });

            // Execute fetch via GitRepository
            const repository = gitService.getRepository();
            console.log('[GitPanel] Calling repository.fetch() for remote: origin');

            const fetchResult = await repository.fetch('origin');
            console.log('[GitPanel] Fetch completed successfully');
            console.log('[GitPanel] Fetch result:', fetchResult);

            // Refresh branch information to get updated ahead/behind counts
            console.log('[GitPanel] Refreshing branches to get upstream status');
            await this.loadBranches();

            // Get upstream status for current branch
            const { gitBranchService } = getGitServices();
            if (gitBranchService) {
                console.log('[GitPanel] Fetching upstream status for current branch');
                const upstreamStatus = await gitBranchService.getUpstreamStatus();
                console.log('[GitPanel] Upstream status:', upstreamStatus);

                // Build notification message
                let message = 'Fetched latest changes from remote';
                if (upstreamStatus.hasUpstream) {
                    const parts = [];
                    if (upstreamStatus.behind > 0) {
                        parts.push(`${upstreamStatus.behind} commit${upstreamStatus.behind > 1 ? 's' : ''} behind`);
                    }
                    if (upstreamStatus.ahead > 0) {
                        parts.push(`${upstreamStatus.ahead} commit${upstreamStatus.ahead > 1 ? 's' : ''} ahead`);
                    }

                    if (parts.length > 0) {
                        message = `Fetched changes: ${parts.join(', ')}`;
                        console.log('[GitPanel] Branch status:', parts.join(', '));
                    } else {
                        message = 'Fetched changes: up to date';
                        console.log('[GitPanel] Branch is up to date');
                    }
                }

                this.showSuccess(message);

                // Emit success event with upstream info
                console.log('[GitPanel] Emitting git:fetch-completed event');
                eventBus.emit('git:fetch-completed', {
                    success: true,
                    remote: 'origin',
                    upstreamStatus
                });
            } else {
                console.warn('[GitPanel] GitBranchService not available for upstream status');
                this.showSuccess('Fetched latest changes from remote');

                eventBus.emit('git:fetch-completed', {
                    success: true,
                    remote: 'origin'
                });
            }

            // Refresh status to update UI
            console.log('[GitPanel] Refreshing status after fetch');
            await this.refreshStatus();

        } catch (error) {
            console.error('[GitPanel] Fetch operation failed with error:', error);
            console.error('[GitPanel] Error message:', error.message);
            console.error('[GitPanel] Error stack:', error.stack);

            // Categorize error for user-friendly message
            let errorMessage = error.message;
            if (error.message.includes('Authentication') || error.message.includes('authentication')) {
                errorMessage = 'Authentication failed. Please check your credentials.';
            } else if (error.message.includes('Connection') || error.message.includes('connection') || error.message.includes('network')) {
                errorMessage = 'Connection failed. Please check your network.';
            } else if (error.message.includes('Could not resolve host')) {
                errorMessage = 'Could not connect to remote. Please check your internet connection.';
            }

            this.showError(`Fetch failed: ${errorMessage}`);

            console.log('[GitPanel] Emitting git:fetch-failed event');
            eventBus.emit('git:fetch-failed', {
                error: error.message,
                stack: error.stack,
                remote: 'origin'
            });

        } finally {
            // Reset button state
            if (fetchBtn) {
                fetchBtn.textContent = originalText;
                fetchBtn.disabled = false;
            }
            console.log('[GitPanel] Fetch button state restored');
            console.log('[GitPanel] ========== FETCH CHANGES COMPLETE ==========');
        }
    }

    /**
     * Refresh Git status
     */
    async refreshStatus() {
        try {
            const { gitStore } = getGitServices();
            if (!gitStore) return;

            console.log('[GitPanel] Refreshing status');
            await gitStore.refreshStatus();
        } catch (error) {
            console.error('[GitPanel] Failed to refresh status:', error);
        }
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
     * Show success message
     * @param {string} message - Success message
     */
    showSuccess(message) {
        // Create toast notification
        const toast = document.createElement('div');
        toast.className = 'git-toast git-toast-success';
        toast.textContent = message;
        document.body.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('fade-out');
            setTimeout(() => toast.remove(), 300);
        }, 2000);
    }

    /**
     * Show the panel
     */
    show() {
        if (!this.panel) return;

        // Hide file explorer sidebar
        const sidebar = document.querySelector('.sidebar');
        if (sidebar) {
            sidebar.style.display = 'none';
        }

        // Show Git panel
        this.panel.style.display = 'flex';
        this.isVisible = true;
        this.refreshStatus();
        this.loadBranches();
        this.loadCommitHistory();
    }

    /**
     * Hide the panel
     */
    hide() {
        if (!this.panel) return;

        // Show file explorer sidebar
        const sidebar = document.querySelector('.sidebar');
        if (sidebar) {
            sidebar.style.display = 'flex';
        }

        // Hide Git panel
        this.panel.style.display = 'none';
        this.isVisible = false;
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
     * Load branches from Git using GitClient directly
     */
    async loadBranches() {
        const { gitStore, gitService } = getGitServices();
        if (!gitStore || !gitService) return;

        try {
            console.log('[GitPanel] Loading branches with GitClient');
            const repoPath = gitStore.getCurrentRepository();
            if (!repoPath) {
                console.warn('[GitPanel] No repository path available');
                return;
            }

            const client = new GitClient(repoPath);

            // Get current branch
            const currentBranchOutput = await client.execute(['branch', '--show-current']);
            this.currentBranch = currentBranchOutput.trim();

            // Get all branches
            const branchesOutput = await client.execute(['branch', '--format=%(refname:short)']);
            const branches = branchesOutput.split('\n')
                .map(b => b.trim())
                .filter(b => b);

            this.branches = branches;

            console.log('[GitPanel] Current branch:', this.currentBranch);
            console.log('[GitPanel] All branches:', branches);

            // Update dropdown
            this.branchSelect.innerHTML = '';

            branches.forEach(branch => {
                const option = document.createElement('option');
                option.value = branch;
                option.textContent = branch;
                option.selected = branch === this.currentBranch;
                this.branchSelect.appendChild(option);
            });

            console.log('[GitPanel] Loaded', branches.length, 'branches. Current:', this.currentBranch);
        } catch (error) {
            console.error('[GitPanel] Error loading branches:', error);
        }
    }

    /**
     * Switch to a different branch
     */
    async switchBranch(branchName) {
        if (!branchName || branchName === this.currentBranch) return;

        const { gitService, gitStore } = getGitServices();
        if (!gitService || !gitStore) return;

        try {
            console.log('[GitPanel] Switching to branch:', branchName);
            const repoPath = gitStore.getCurrentRepository();
            if (!repoPath) return;

            const client = new GitClient(repoPath);

            await client.execute(['checkout', branchName]);

            this.currentBranch = branchName;
            console.log('[GitPanel] Switched to branch:', branchName);

            // Refresh the panel
            this.refreshStatus();
            this.loadBranches();
            eventBus.emit('git:branch-changed', { branch: branchName });
        } catch (error) {
            console.error('[GitPanel] Error switching branch:', error);
            alert(`Failed to switch branch: ${error.message}`);
            // Revert selection
            this.branchSelect.value = this.currentBranch;
        }
    }

    /**
     * Create a new branch
     */
    async createNewBranch() {
        // Create dialog
        const dialog = document.createElement('div');
        dialog.className = 'git-branch-dialog';
        dialog.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.7);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
        `;

        const dialogContent = document.createElement('div');
        dialogContent.style.cssText = `
            background-color: #1e1e1e;
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 8px;
            padding: 24px;
            min-width: 400px;
            max-width: 500px;
        `;

        const dialogTitle = document.createElement('h3');
        dialogTitle.textContent = 'Create New Branch';
        dialogTitle.style.cssText = 'margin: 0 0 16px 0; font-size: 18px;';

        const dialogText = document.createElement('p');
        dialogText.textContent = 'Enter a name for the new branch:';
        dialogText.style.cssText = 'margin: 0 0 12px 0; color: rgba(255, 255, 255, 0.8);';

        // Branch name input
        const branchInput = document.createElement('input');
        branchInput.type = 'text';
        branchInput.placeholder = 'e.g., feature/new-feature';
        branchInput.style.cssText = `
            width: 100%;
            padding: 8px;
            margin-bottom: 8px;
            background-color: #2d2d2d;
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 4px;
            color: #ffffff;
            font-size: 14px;
            box-sizing: border-box;
        `;

        // Error message
        const errorMsg = document.createElement('div');
        errorMsg.style.cssText = `
            color: #f48771;
            font-size: 12px;
            margin-bottom: 16px;
            min-height: 18px;
        `;

        // Buttons
        const buttonContainer = document.createElement('div');
        buttonContainer.style.cssText = 'display: flex; gap: 8px; justify-content: flex-end;';

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancel';
        cancelBtn.style.cssText = `
            padding: 8px 16px;
            background-color: #2d2d2d;
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 4px;
            color: #ffffff;
            cursor: pointer;
        `;

        const createBtn = document.createElement('button');
        createBtn.textContent = 'Create';
        createBtn.style.cssText = `
            padding: 8px 16px;
            background-color: #0e639c;
            border: 1px solid #0e639c;
            border-radius: 4px;
            color: #ffffff;
            cursor: pointer;
        `;

        // Handle create
        const handleCreate = async () => {
            const branchName = branchInput.value.trim();
            if (!branchName) {
                errorMsg.textContent = 'Branch name cannot be empty';
                return;
            }

            // Validate branch name
            if (!/^[a-zA-Z0-9_\-\/]+$/.test(branchName)) {
                errorMsg.textContent = 'Invalid branch name. Use only letters, numbers, hyphens, underscores, and slashes.';
                return;
            }

            const { gitStore } = getGitServices();
            if (!gitStore) {
                dialog.remove();
                return;
            }

            try {
                console.log('[GitPanel] Creating new branch:', branchName);
                const repoPath = gitStore.getCurrentRepository();
                if (!repoPath) {
                    dialog.remove();
                    return;
                }

                const client = new GitClient(repoPath);
                await client.execute(['checkout', '-b', branchName]);

                console.log('[GitPanel] Created and switched to branch:', branchName);
                this.currentBranch = branchName;

                // Refresh the panel
                this.refreshStatus();
                this.loadBranches();
                eventBus.emit('git:branch-changed', { branch: branchName });

                // Close dialog
                dialog.remove();
            } catch (error) {
                console.error('[GitPanel] Error creating branch:', error);
                errorMsg.textContent = `Failed to create branch: ${error.message}`;
            }
        };

        // Handle cancel
        cancelBtn.addEventListener('click', () => {
            dialog.remove();
        });

        // Handle create button
        createBtn.addEventListener('click', handleCreate);

        // Handle Enter key
        branchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                handleCreate();
            } else if (e.key === 'Escape') {
                dialog.remove();
            }
        });

        // Assemble dialog
        buttonContainer.appendChild(cancelBtn);
        buttonContainer.appendChild(createBtn);
        dialogContent.appendChild(dialogTitle);
        dialogContent.appendChild(dialogText);
        dialogContent.appendChild(branchInput);
        dialogContent.appendChild(errorMsg);
        dialogContent.appendChild(buttonContainer);
        dialog.appendChild(dialogContent);

        // Add to DOM
        document.body.appendChild(dialog);

        // Focus input
        setTimeout(() => branchInput.focus(), 100);

        // Close on background click
        dialog.addEventListener('click', (e) => {
            if (e.target === dialog) {
                dialog.remove();
            }
        });
    }

    /**
     * Delete a branch with confirmation dialog
     */
    async deleteBranch() {
        console.log('[GitPanel] Delete branch button clicked');

        const { gitBranchService, gitStore } = getGitServices();
        if (!gitBranchService || !gitStore) {
            console.error('[GitPanel] GitBranchService or GitStore not available');
            this.showError('Git services not available');
            return;
        }

        // Get selected branch from dropdown
        const selectedBranch = this.branchSelect.value;
        if (!selectedBranch) {
            console.warn('[GitPanel] No branch selected for deletion');
            this.showError('No branch selected');
            return;
        }

        console.log('[GitPanel] Selected branch for deletion:', selectedBranch);

        // Safety check: Cannot delete current branch
        if (selectedBranch === this.currentBranch) {
            console.warn('[GitPanel] Cannot delete current branch:', selectedBranch);
            this.showError(`Cannot delete current branch '${selectedBranch}'. Switch to another branch first.`);
            return;
        }

        // Create confirmation dialog with force delete option
        console.log('[GitPanel] Showing delete confirmation dialog for branch:', selectedBranch);

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

        const title = document.createElement('h3');
        title.textContent = 'Delete Branch';
        title.style.cssText = 'margin: 0 0 12px 0; color: #ffffff;';

        const message = document.createElement('p');
        message.textContent = `Are you sure you want to delete branch '${selectedBranch}'?`;
        message.style.cssText = 'margin: 0 0 16px 0; color: rgba(255, 255, 255, 0.9);';

        const checkboxContainer = document.createElement('label');
        checkboxContainer.style.cssText = 'display: flex; align-items: center; gap: 8px; margin-bottom: 20px; cursor: pointer;';

        const forceCheckbox = document.createElement('input');
        forceCheckbox.type = 'checkbox';
        forceCheckbox.id = 'force-delete-checkbox';
        forceCheckbox.style.cssText = 'cursor: pointer;';

        const checkboxLabel = document.createElement('span');
        checkboxLabel.textContent = 'Force delete (even if unmerged)';
        checkboxLabel.style.cssText = 'color: rgba(255, 255, 255, 0.8); font-size: 13px;';

        checkboxContainer.appendChild(forceCheckbox);
        checkboxContainer.appendChild(checkboxLabel);

        const buttonContainer = document.createElement('div');
        buttonContainer.style.cssText = 'display: flex; gap: 8px; justify-content: flex-end;';

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'git-btn';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.style.cssText = 'padding: 6px 16px;';

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'git-btn';
        deleteBtn.textContent = 'Delete';
        deleteBtn.style.cssText = 'padding: 6px 16px; background-color: #dc3545; color: white;';

        buttonContainer.appendChild(cancelBtn);
        buttonContainer.appendChild(deleteBtn);

        dialog.appendChild(title);
        dialog.appendChild(message);
        dialog.appendChild(checkboxContainer);
        dialog.appendChild(buttonContainer);
        dialogContainer.appendChild(dialog);
        document.body.appendChild(dialogContainer);

        console.log('[GitPanel] Delete confirmation dialog displayed');

        // Handle dialog interactions
        const cleanup = () => {
            console.log('[GitPanel] Closing delete confirmation dialog');
            dialogContainer.remove();
        };

        cancelBtn.addEventListener('click', () => {
            console.log('[GitPanel] Delete cancelled by user');
            cleanup();
        });

        deleteBtn.addEventListener('click', async () => {
            const forceDelete = forceCheckbox.checked;
            console.log('[GitPanel] Delete confirmed. Force delete:', forceDelete);
            console.log('[GitPanel] Calling GitBranchService.deleteBranch with branch:', selectedBranch, 'force:', forceDelete);

            cleanup();

            try {
                const options = { force: forceDelete };
                const success = await gitBranchService.deleteBranch(selectedBranch, options);

                if (success) {
                    console.log('[GitPanel] Branch deleted successfully:', selectedBranch);
                    this.showSuccess(`Branch '${selectedBranch}' deleted successfully`);

                    // Refresh branch list
                    console.log('[GitPanel] Refreshing branch list after deletion');
                    await this.loadBranches();

                    // Refresh status
                    await this.refreshStatus();

                    console.log('[GitPanel] Delete operation completed successfully');
                } else {
                    console.error('[GitPanel] Failed to delete branch:', selectedBranch);
                    this.showError(`Failed to delete branch '${selectedBranch}'`);
                }
            } catch (error) {
                console.error('[GitPanel] Error during branch deletion:', error);
                this.showError(`Error deleting branch: ${error.message}`);
            }
        });

        // Close on backdrop click
        dialogContainer.addEventListener('click', (e) => {
            if (e.target === dialogContainer) {
                console.log('[GitPanel] Delete dialog closed by backdrop click');
                cleanup();
            }
        });
    }

    /**
     * Rename the current branch
     */
    async renameBranch() {
        console.log('[GitPanel] Rename branch button clicked');

        const { gitBranchService, gitStore } = getGitServices();
        if (!gitBranchService || !gitStore) {
            console.error('[GitPanel] GitBranchService or GitStore not available');
            this.showError('Git services not available');
            return;
        }

        if (!this.currentBranch) {
            console.warn('[GitPanel] No current branch to rename');
            this.showError('No current branch to rename');
            return;
        }

        console.log('[GitPanel] Current branch to rename:', this.currentBranch);

        // Create input dialog with current branch name pre-filled
        console.log('[GitPanel] Showing rename input dialog');

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

        const title = document.createElement('h3');
        title.textContent = 'Rename Branch';
        title.style.cssText = 'margin: 0 0 12px 0; color: #ffffff;';

        const label = document.createElement('label');
        label.textContent = 'New branch name:';
        label.style.cssText = 'display: block; margin-bottom: 8px; color: rgba(255, 255, 255, 0.9); font-size: 13px;';

        const input = document.createElement('input');
        input.type = 'text';
        input.value = this.currentBranch;
        input.style.cssText = `
            width: 100%;
            padding: 8px;
            background-color: rgba(0, 0, 0, 0.3);
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 4px;
            color: #ffffff;
            font-size: 13px;
            margin-bottom: 16px;
            box-sizing: border-box;
        `;

        const validationMessage = document.createElement('div');
        validationMessage.style.cssText = 'color: #dc3545; font-size: 12px; margin-bottom: 12px; min-height: 18px;';

        const buttonContainer = document.createElement('div');
        buttonContainer.style.cssText = 'display: flex; gap: 8px; justify-content: flex-end;';

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'git-btn';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.style.cssText = 'padding: 6px 16px;';

        const renameBtn = document.createElement('button');
        renameBtn.className = 'git-btn git-btn-primary';
        renameBtn.textContent = 'Rename';
        renameBtn.style.cssText = 'padding: 6px 16px;';

        buttonContainer.appendChild(cancelBtn);
        buttonContainer.appendChild(renameBtn);

        dialog.appendChild(title);
        dialog.appendChild(label);
        dialog.appendChild(input);
        dialog.appendChild(validationMessage);
        dialog.appendChild(buttonContainer);
        dialogContainer.appendChild(dialog);
        document.body.appendChild(dialogContainer);

        console.log('[GitPanel] Rename input dialog displayed with pre-filled value:', this.currentBranch);

        // Focus and select input text
        input.focus();
        input.select();

        // Validation regex
        const branchNameRegex = /^[a-zA-Z0-9_\/-]+$/;

        // Validate input on change
        const validateInput = () => {
            const newName = input.value.trim();
            console.log('[GitPanel] Validating branch name:', newName);

            if (!newName) {
                validationMessage.textContent = 'Branch name cannot be empty';
                console.log('[GitPanel] Validation failed: empty name');
                return false;
            }

            if (!branchNameRegex.test(newName)) {
                validationMessage.textContent = 'Invalid branch name. Use only letters, numbers, hyphens, underscores, and slashes.';
                console.log('[GitPanel] Validation failed: invalid characters in name:', newName);
                return false;
            }

            if (newName === this.currentBranch) {
                validationMessage.textContent = 'New name must be different from current name';
                console.log('[GitPanel] Validation failed: name unchanged');
                return false;
            }

            validationMessage.textContent = '';
            console.log('[GitPanel] Validation passed for name:', newName);
            return true;
        };

        input.addEventListener('input', validateInput);

        // Handle dialog interactions
        const cleanup = () => {
            console.log('[GitPanel] Closing rename dialog');
            dialogContainer.remove();
        };

        cancelBtn.addEventListener('click', () => {
            console.log('[GitPanel] Rename cancelled by user');
            cleanup();
        });

        const performRename = async () => {
            if (!validateInput()) {
                console.log('[GitPanel] Rename aborted due to validation failure');
                return;
            }

            const newName = input.value.trim();
            console.log('[GitPanel] Rename confirmed. New name:', newName);
            console.log('[GitPanel] Calling GitBranchService.renameBranch with new name:', newName);

            cleanup();

            try {
                const success = await gitBranchService.renameBranch(newName);

                if (success) {
                    console.log('[GitPanel] Branch renamed successfully from', this.currentBranch, 'to', newName);
                    this.currentBranch = newName;
                    this.showSuccess(`Branch renamed to '${newName}'`);

                    // Refresh branch list and update dropdown
                    console.log('[GitPanel] Refreshing branch list after rename');
                    await this.loadBranches();

                    // Refresh status
                    await this.refreshStatus();

                    console.log('[GitPanel] Rename operation completed successfully');
                } else {
                    console.error('[GitPanel] Failed to rename branch to:', newName);
                    this.showError(`Failed to rename branch to '${newName}'`);
                }
            } catch (error) {
                console.error('[GitPanel] Error during branch rename:', error);
                this.showError(`Error renaming branch: ${error.message}`);
            }
        };

        renameBtn.addEventListener('click', performRename);

        // Handle Enter key
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                console.log('[GitPanel] Enter key pressed in rename dialog');
                performRename();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                console.log('[GitPanel] Escape key pressed in rename dialog');
                cleanup();
            }
        });

        // Close on backdrop click
        dialogContainer.addEventListener('click', (e) => {
            if (e.target === dialogContainer) {
                console.log('[GitPanel] Rename dialog closed by backdrop click');
                cleanup();
            }
        });
    }

    /**
     * Load commit history
     */
    async loadCommitHistory(limit = 20) {
        const { gitService, gitStore } = getGitServices();
        if (!gitService || !gitStore) return;

        try {
            console.log('[GitPanel] Loading commit history');
            const repoPath = gitStore.getCurrentRepository();
            if (!repoPath) {
                console.warn('[GitPanel] No repository path available');
                return;
            }

            // Use Git client to get log
            const client = new GitClient(repoPath);

            const logOutput = await client.execute([
                'log',
                `--max-count=${limit}`,
                '--format=%H|%an|%ae|%ad|%s',
                '--date=iso'
            ]);

            // Parse commits
            const commits = logOutput.split('\n')
                .filter(line => line.trim())
                .map(line => {
                    const [hash, author_name, author_email, date, ...messageParts] = line.split('|');
                    return {
                        hash,
                        author_name,
                        author_email,
                        date,
                        message: messageParts.join('|')
                    };
                });

            this.commits = commits;
            this.renderCommitHistory();

            // Update count in header
            const countSpan = this.panel.querySelector('.git-history-section .git-section-count');
            if (countSpan) {
                countSpan.textContent = commits.length;
            }

            console.log('[GitPanel] Loaded', commits.length, 'commits');
        } catch (error) {
            console.error('[GitPanel] Error loading commit history:', error);
        }
    }

    /**
     * Render commit history
     */
    renderCommitHistory() {
        this.commitHistoryList.innerHTML = '';

        if (this.commits.length === 0) {
            const emptyMsg = document.createElement('div');
            emptyMsg.style.cssText = 'padding: 12px; color: rgba(255, 255, 255, 0.5); text-align: center;';
            emptyMsg.textContent = 'No commits yet';
            this.commitHistoryList.appendChild(emptyMsg);
            return;
        }

        this.commits.forEach(commit => {
            const commitItem = document.createElement('div');
            commitItem.className = 'git-commit-item';
            commitItem.style.cssText = `
                padding: 8px 12px;
                border-bottom: 1px solid rgba(255, 255, 255, 0.05);
                cursor: pointer;
                transition: background-color 0.2s;
            `;

            commitItem.addEventListener('mouseenter', () => {
                commitItem.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
            });
            commitItem.addEventListener('mouseleave', () => {
                commitItem.style.backgroundColor = 'transparent';
            });

            const messageDiv = document.createElement('div');
            messageDiv.style.cssText = 'font-size: 13px; margin-bottom: 4px; font-weight: 500;';
            messageDiv.textContent = commit.message.split('\n')[0]; // First line only

            const metaDiv = document.createElement('div');
            metaDiv.style.cssText = 'font-size: 11px; color: rgba(255, 255, 255, 0.5);';

            const date = new Date(commit.date);
            const timeAgo = this.formatTimeAgo(date);
            metaDiv.innerHTML = `
                <span style="color: #28a745;">${commit.author_name}</span>
                · ${timeAgo}
                · <span style="font-family: monospace;">${commit.hash.substring(0, 7)}</span>
            `;

            commitItem.appendChild(messageDiv);
            commitItem.appendChild(metaDiv);

            // Click to view commit details
            commitItem.addEventListener('click', () => this.viewCommit(commit));

            this.commitHistoryList.appendChild(commitItem);
        });
    }

    /**
     * Format timestamp as "time ago"
     */
    formatTimeAgo(date) {
        const now = new Date();
        const seconds = Math.floor((now - date) / 1000);

        if (seconds < 60) return 'just now';
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
        if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
        if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
        if (seconds < 2592000) return `${Math.floor(seconds / 604800)}w ago`;
        return date.toLocaleDateString();
    }

    /**
     * View commit details and diff
     */
    async viewCommit(commit) {
        console.log('[GitPanel] Viewing commit:', commit.hash);

        const { gitStore } = getGitServices();
        if (!gitStore) return;

        const repoPath = gitStore.getCurrentRepository();
        if (!repoPath) {
            console.warn('[GitPanel] No repository path available');
            return;
        }

        // Emit event to open commit view in editor
        eventBus.emit('git:view-commit', {
            commit: commit,
            repositoryPath: repoPath
        });
    }


    /**
     * Open merge dialog
     */
    async openMergeDialog() {
        console.log('[GitPanel] Opening merge dialog');
        console.log('[GitPanel] Current branch:', this.currentBranch);
        console.log('[GitPanel] Available branches:', this.branches);

        // Filter out current branch from merge options
        const mergeableBranches = this.branches.filter(b => b !== this.currentBranch);

        if (mergeableBranches.length === 0) {
            console.log('[GitPanel] No other branches available for merge');
            this.showError('No other branches available to merge');
            return;
        }

        console.log('[GitPanel] Mergeable branches:', mergeableBranches);

        // Create dialog
        const dialog = document.createElement('div');
        dialog.className = 'git-merge-dialog';
        dialog.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.7);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
        `;

        const dialogContent = document.createElement('div');
        dialogContent.style.cssText = `
            background-color: #1e1e1e;
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 8px;
            padding: 24px;
            min-width: 400px;
            max-width: 500px;
        `;

        const dialogTitle = document.createElement('h3');
        dialogTitle.textContent = 'Merge Branch';
        dialogTitle.style.cssText = 'margin: 0 0 16px 0; font-size: 18px;';

        const dialogText = document.createElement('p');
        dialogText.textContent = `Select a branch to merge into ${this.currentBranch}:`;
        dialogText.style.cssText = 'margin: 0 0 12px 0; color: rgba(255, 255, 255, 0.8);';

        // Branch selection
        const branchSelect = document.createElement('select');
        branchSelect.style.cssText = `
            width: 100%;
            padding: 8px;
            margin-bottom: 16px;
            background-color: #2d2d2d;
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 4px;
            color: #ffffff;
            font-size: 14px;
        `;

        mergeableBranches.forEach(branch => {
            const option = document.createElement('option');
            option.value = branch;
            option.textContent = branch;
            option.style.cssText = 'background-color: #2d2d2d; color: #ffffff;';
            branchSelect.appendChild(option);
        });

        // Merge options
        const optionsTitle = document.createElement('h4');
        optionsTitle.textContent = 'Merge Options:';
        optionsTitle.style.cssText = 'margin: 0 0 8px 0; font-size: 14px;';

        const noFfCheckbox = this.createCheckbox('no-ff', 'Create merge commit (--no-ff)', false);
        const ffOnlyCheckbox = this.createCheckbox('ff-only', 'Fast-forward only (--ff-only)', false);
        const squashCheckbox = this.createCheckbox('squash', 'Squash commits (--squash)', false);

        // Buttons
        const buttonRow = document.createElement('div');
        buttonRow.style.cssText = 'display: flex; gap: 8px; justify-content: flex-end; margin-top: 16px;';

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'git-btn';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.style.cssText = 'padding: 8px 16px;';
        cancelBtn.addEventListener('click', () => {
            console.log('[GitPanel] Merge dialog cancelled');
            dialog.remove();
        });

        const mergeBtn = document.createElement('button');
        mergeBtn.className = 'git-btn git-btn-primary';
        mergeBtn.textContent = 'Merge';
        mergeBtn.style.cssText = 'padding: 8px 16px;';
        mergeBtn.addEventListener('click', async () => {
            const selectedBranch = branchSelect.value;
            const options = {
                noFf: noFfCheckbox.querySelector('input').checked,
                ffOnly: ffOnlyCheckbox.querySelector('input').checked,
                squash: squashCheckbox.querySelector('input').checked
            };

            console.log('[GitPanel] Merge button clicked');
            console.log('[GitPanel] Selected branch:', selectedBranch);
            console.log('[GitPanel] Merge options:', options);

            dialog.remove();
            await this.mergeBranch(selectedBranch, options);
        });

        buttonRow.appendChild(cancelBtn);
        buttonRow.appendChild(mergeBtn);

        dialogContent.appendChild(dialogTitle);
        dialogContent.appendChild(dialogText);
        dialogContent.appendChild(branchSelect);
        dialogContent.appendChild(optionsTitle);
        dialogContent.appendChild(noFfCheckbox);
        dialogContent.appendChild(ffOnlyCheckbox);
        dialogContent.appendChild(squashCheckbox);
        dialogContent.appendChild(buttonRow);

        dialog.appendChild(dialogContent);
        document.body.appendChild(dialog);

        this.mergeDialog = dialog;
        console.log('[GitPanel] Merge dialog rendered');
    }

    /**
     * Create checkbox element for merge options
     */
    createCheckbox(id, label, checked) {
        const container = document.createElement('div');
        container.style.cssText = 'margin-bottom: 8px; display: flex; align-items: center;';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `merge-option-${id}`;
        checkbox.checked = checked;
        checkbox.style.cssText = 'margin-right: 8px;';

        const labelElement = document.createElement('label');
        labelElement.htmlFor = `merge-option-${id}`;
        labelElement.textContent = label;
        labelElement.style.cssText = 'font-size: 13px; cursor: pointer;';

        container.appendChild(checkbox);
        container.appendChild(labelElement);

        return container;
    }

    /**
     * Perform merge operation
     */
    async mergeBranch(branchName, options = {}) {
        console.log('[GitPanel] Starting merge operation');
        console.log('[GitPanel] Merging branch:', branchName);
        console.log('[GitPanel] Into current branch:', this.currentBranch);
        console.log('[GitPanel] With options:', options);

        try {
            const { gitService } = getGitServices();
            if (!gitService) {
                console.error('[GitPanel] Git service not available');
                return;
            }

            console.log('[GitPanel] Calling gitService.getRepository().merge()');
            const result = await gitService.getRepository().merge(branchName, options);

            console.log('[GitPanel] Merge operation completed');
            console.log('[GitPanel] Merge result:', result);

            if (result.conflicts) {
                console.log('[GitPanel] Merge has conflicts!');
                console.log('[GitPanel] Number of conflicted files:', result.conflictedFiles.length);
                console.log('[GitPanel] Conflicted files:', result.conflictedFiles);

                this.isMerging = true;
                this.conflictedFiles = result.conflictedFiles;

                this.showMergeConflicts(result.conflictedFiles);
            } else {
                console.log('[GitPanel] Merge successful with no conflicts');
                this.showSuccess(`Successfully merged ${branchName} into ${this.currentBranch}`);

                // Refresh status and branches
                await this.refreshStatus();
                await this.loadBranches();
                await this.loadCommitHistory();
            }
        } catch (error) {
            console.error('[GitPanel] Merge failed with error:', error);
            console.error('[GitPanel] Error message:', error.message);
            console.error('[GitPanel] Error stack:', error.stack);

            this.showError(`Merge failed: ${error.message}`);
        }
    }

    /**
     * Show merge conflicts UI
     */
    showMergeConflicts(conflictedFiles) {
        console.log('[GitPanel] Showing merge conflicts UI');
        console.log('[GitPanel] Conflicted files:', conflictedFiles);

        // Create conflict message section
        const conflictSection = document.createElement('div');
        conflictSection.className = 'git-conflict-section';
        conflictSection.style.cssText = `
            padding: 12px;
            background-color: rgba(220, 38, 38, 0.1);
            border: 1px solid rgba(220, 38, 38, 0.3);
            border-radius: 4px;
            margin-bottom: 12px;
        `;

        const conflictTitle = document.createElement('div');
        conflictTitle.style.cssText = 'font-weight: 500; margin-bottom: 8px; color: #dc2626;';
        conflictTitle.textContent = `Merge Conflicts (${conflictedFiles.length} files)`;

        const conflictMessage = document.createElement('div');
        conflictMessage.style.cssText = 'font-size: 12px; margin-bottom: 12px; color: rgba(255, 255, 255, 0.8);';
        conflictMessage.textContent = 'Resolve conflicts in the following files:';

        const conflictList = document.createElement('div');
        conflictList.style.cssText = 'margin-bottom: 12px;';

        conflictedFiles.forEach(filePath => {
            const fileItem = document.createElement('div');
            fileItem.style.cssText = `
                padding: 6px 8px;
                background-color: rgba(0, 0, 0, 0.2);
                border-radius: 3px;
                margin-bottom: 4px;
                font-size: 12px;
                font-family: monospace;
                cursor: pointer;
                transition: background-color 0.2s;
            `;
            fileItem.textContent = filePath;
            fileItem.addEventListener('mouseenter', () => {
                fileItem.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
            });
            fileItem.addEventListener('mouseleave', () => {
                fileItem.style.backgroundColor = 'rgba(0, 0, 0, 0.2)';
            });
            fileItem.addEventListener('click', () => {
                console.log('[GitPanel] Opening conflicted file:', filePath);
                this.openFileDiff(filePath);
            });
            conflictList.appendChild(fileItem);
        });

        // Abort merge button
        this.abortMergeBtn = document.createElement('button');
        this.abortMergeBtn.className = 'git-btn';
        this.abortMergeBtn.textContent = 'Abort Merge';
        this.abortMergeBtn.style.cssText = `
            width: 100%;
            padding: 8px;
            background-color: #dc2626;
            border: none;
            color: white;
            font-weight: 500;
        `;
        this.abortMergeBtn.addEventListener('click', () => this.abortMerge());

        conflictSection.appendChild(conflictTitle);
        conflictSection.appendChild(conflictMessage);
        conflictSection.appendChild(conflictList);
        conflictSection.appendChild(this.abortMergeBtn);

        // Insert conflict section at the top of the panel content
        const panelContent = this.panel.querySelector('.git-panel-content');
        const firstChild = panelContent.firstChild;
        panelContent.insertBefore(conflictSection, firstChild);

        console.log('[GitPanel] Merge conflicts UI rendered');

        this.showError(`Merge conflicts in ${conflictedFiles.length} file(s). Resolve conflicts and commit, or abort the merge.`);
    }

    /**
     * Abort ongoing merge
     */
    async abortMerge() {
        console.log('[GitPanel] Abort merge button clicked');

        if (!confirm('Are you sure you want to abort the merge? All merge progress will be lost.')) {
            console.log('[GitPanel] Abort merge cancelled by user');
            return;
        }

        try {
            console.log('[GitPanel] Calling gitService.getRepository().abortMerge()');
            const { gitService } = getGitServices();
            if (!gitService) {
                console.error('[GitPanel] Git service not available');
                return;
            }

            await gitService.getRepository().abortMerge();
            console.log('[GitPanel] Merge aborted successfully');

            this.isMerging = false;
            this.conflictedFiles = [];

            // Remove conflict section
            const conflictSection = this.panel.querySelector('.git-conflict-section');
            if (conflictSection) {
                console.log('[GitPanel] Removing conflict section from UI');
                conflictSection.remove();
            }

            this.showSuccess('Merge aborted successfully');

            // Refresh status
            await this.refreshStatus();
            console.log('[GitPanel] Status refreshed after abort');
        } catch (error) {
            console.error('[GitPanel] Failed to abort merge:', error);
            console.error('[GitPanel] Error message:', error.message);
            this.showError(`Failed to abort merge: ${error.message}`);
        }
    }
    /**
     * Cleanup
     */
    destroy() {
        if (this.panel) {
            this.panel.remove();
        }
        if (this.mergeDialog) {
            this.mergeDialog.remove();
        }
        eventBus.off('git:status-changed');
        eventBus.off('git:repository-changed');
        eventBus.off('file:saved');
        eventBus.off('git:toggle-panel');
    }
}

module.exports = GitPanel;

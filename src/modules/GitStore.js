/**
 * GitStore - Centralized Git state management
 *
 * Manages Git state and emits events on state changes.
 * Integrates all Git services and provides reactive state for UI components.
 *
 * Architecture inspired by Zed's GitStore and Vuex/Redux patterns.
 */

const EventBus = require('./EventBus');

class GitStore {
    constructor() {
        // Repository state
        this.state = {
            // Repository info
            repositoryPath: null,
            hasRepository: false,
            isInitialized: false,

            // Branch info
            currentBranch: null,
            branches: {
                local: [],
                remote: [],
                all: []
            },
            branchStats: {
                ahead: 0,
                behind: 0,
                upstream: null,
                trackingStatus: null
            },

            // File status
            files: {
                modified: [],
                staged: [],
                unstaged: [],
                untracked: [],
                conflicted: [],
                all: []
            },
            fileCount: {
                modified: 0,
                staged: 0,
                unstaged: 0,
                untracked: 0,
                conflicted: 0,
                total: 0
            },

            // Commit history
            commits: {
                recent: [],
                total: 0,
                hasMore: false
            },

            // Diff state per file: { filePath -> { unstaged, staged, hasChanges } }
            fileDiffs: new Map(),

            // Blame state per file: { filePath -> { enabled, entries } }
            fileBlames: new Map(),

            // Operation state
            operations: {
                isFetching: false,
                isPushing: false,
                isPulling: false,
                isCommitting: false,
                lastOperation: null,
                lastOperationTime: null
            },

            // Error state
            lastError: null
        };

        console.log('[GitStore] Initialized');

        // Setup event listeners
        this._setupEventListeners();
    }

    /**
     * Setup event listeners for Git events
     * @private
     */
    _setupEventListeners() {
        // Repository initialization
        EventBus.on('git:initialized', (data) => {
            this._handleInitialized(data);
        });

        // Branch events
        EventBus.on('git:branch-switched', (data) => {
            this._handleBranchSwitched(data);
        });

        EventBus.on('git:branch-created', (data) => {
            this._handleBranchCreated(data);
        });

        EventBus.on('git-branch:loaded', (data) => {
            this._handleBranchesLoaded(data);
        });

        // Status events
        EventBus.on('git:status-changed', (status) => {
            this._handleStatusChanged(status);
        });

        // Commit events
        EventBus.on('git:commit-created', (data) => {
            this._handleCommitCreated(data);
        });

        EventBus.on('git-history:loaded', (data) => {
            this._handleHistoryLoaded(data);
        });

        // File operation events
        EventBus.on('git:files-staged', (data) => {
            this._handleFilesStaged(data);
        });

        EventBus.on('git:files-unstaged', (data) => {
            this._handleFilesUnstaged(data);
        });

        EventBus.on('git:changes-discarded', (data) => {
            this._handleChangesDiscarded(data);
        });

        // Remote operation events
        EventBus.on('git:fetch-started', () => {
            this._setOperationState('fetch', true);
        });

        EventBus.on('git:fetch-completed', () => {
            this._setOperationState('fetch', false);
        });

        EventBus.on('git:push-started', () => {
            this._setOperationState('push', true);
        });

        EventBus.on('git:push-completed', () => {
            this._setOperationState('push', false);
        });

        EventBus.on('git:pull-started', () => {
            this._setOperationState('pull', true);
        });

        EventBus.on('git:pull-completed', () => {
            this._setOperationState('pull', false);
        });

        // Diff events
        EventBus.on('git-diff:loaded', (data) => {
            this._handleDiffLoaded(data);
        });

        EventBus.on('git-diff:enabled', (data) => {
            this._handleDiffEnabled(data);
        });

        // Blame events
        EventBus.on('git-blame:loaded', (data) => {
            this._handleBlameLoaded(data);
        });

        EventBus.on('git-blame:enabled', (data) => {
            this._handleBlameEnabled(data);
        });

        EventBus.on('git-blame:disabled', (data) => {
            this._handleBlameDisabled(data);
        });
    }

    // ============================================
    // EVENT HANDLERS
    // ============================================

    /**
     * Handle repository initialization
     * @private
     */
    _handleInitialized(data) {
        this.state.repositoryPath = data.path;
        this.state.hasRepository = data.hasRepository;
        this.state.isInitialized = true;

        console.log(`[GitStore] Repository initialized: ${data.path} (hasRepo: ${data.hasRepository})`);

        this._emitStateChange('initialized');
    }

    /**
     * Handle branch switched
     * @private
     */
    _handleBranchSwitched(data) {
        this.state.currentBranch = data.ref;

        console.log(`[GitStore] Branch switched to: ${data.ref}`);

        this._emitStateChange('branch-switched', { branch: data.ref });
    }

    /**
     * Handle branch created
     * @private
     */
    _handleBranchCreated(data) {
        console.log(`[GitStore] Branch created: ${data.branchName}`);

        this._emitStateChange('branch-created', { branch: data.branchName });
    }

    /**
     * Handle branches loaded
     * @private
     */
    _handleBranchesLoaded(data) {
        const { type, branches } = data;

        if (type === 'local') {
            this.state.branches.local = branches;

            // Update current branch tracking info
            const currentBranch = branches.find(b => b.isCurrent);
            if (currentBranch) {
                this.state.currentBranch = currentBranch.name;
                this.state.branchStats.ahead = currentBranch.ahead || 0;
                this.state.branchStats.behind = currentBranch.behind || 0;
                this.state.branchStats.upstream = currentBranch.upstream || null;
                this.state.branchStats.trackingStatus = currentBranch.getTrackingStatus();
            }
        } else if (type === 'remote') {
            this.state.branches.remote = branches;
        } else if (type === 'all') {
            this.state.branches.all = branches;
        }

        console.log(`[GitStore] Branches loaded (${type}): ${branches.length} branches`);

        this._emitStateChange('branches-updated', { type, count: branches.length });
    }

    /**
     * Handle status changed
     * @private
     */
    _handleStatusChanged(status) {
        // Update branch info
        if (status.branch) {
            this.state.currentBranch = status.branch;
        }
        if (status.upstream) {
            this.state.branchStats.upstream = status.upstream;
        }
        if (status.ahead !== undefined) {
            this.state.branchStats.ahead = status.ahead;
        }
        if (status.behind !== undefined) {
            this.state.branchStats.behind = status.behind;
        }

        // Update file status
        this.state.files.all = status.files || [];

        // Group files by status
        this.state.files.modified = status.files.filter(f => f.isModified());
        this.state.files.staged = status.files.filter(f => f.isStaged);
        this.state.files.unstaged = status.files.filter(f => f.hasUnstagedChanges());
        this.state.files.untracked = status.files.filter(f => f.isUntracked);
        this.state.files.conflicted = status.files.filter(f => f.isUnmerged);

        // Update counts
        this.state.fileCount.modified = this.state.files.modified.length;
        this.state.fileCount.staged = this.state.files.staged.length;
        this.state.fileCount.unstaged = this.state.files.unstaged.length;
        this.state.fileCount.untracked = this.state.files.untracked.length;
        this.state.fileCount.conflicted = this.state.files.conflicted.length;
        this.state.fileCount.total = status.files.length;

        console.log(`[GitStore] Status updated: ${this.state.fileCount.total} files (${this.state.fileCount.staged} staged, ${this.state.fileCount.unstaged} unstaged)`);

        this._emitStateChange('status-updated', {
            fileCount: this.state.fileCount,
            branchStats: this.state.branchStats
        });
    }

    /**
     * Handle commit created
     * @private
     */
    _handleCommitCreated(data) {
        console.log(`[GitStore] Commit created: ${data.sha}`);

        // Add to recent commits (if we have commit data)
        if (data.commit) {
            this.state.commits.recent.unshift(data.commit);

            // Keep only last 50 commits in memory
            if (this.state.commits.recent.length > 50) {
                this.state.commits.recent = this.state.commits.recent.slice(0, 50);
            }
        }

        this._emitStateChange('commit-created', { sha: data.sha, message: data.message });
    }

    /**
     * Handle history loaded
     * @private
     */
    _handleHistoryLoaded(data) {
        const { type, commits, hasMore } = data;

        if (type === 'repo') {
            this.state.commits.recent = commits;
            this.state.commits.total = commits.length;
            this.state.commits.hasMore = hasMore;

            console.log(`[GitStore] History loaded: ${commits.length} commits (hasMore: ${hasMore})`);
        }

        this._emitStateChange('history-updated', { type, count: commits.length, hasMore });
    }

    /**
     * Handle files staged
     * @private
     */
    _handleFilesStaged(data) {
        console.log(`[GitStore] Files staged: ${data.paths.length}`);

        this._emitStateChange('files-staged', { paths: data.paths });
    }

    /**
     * Handle files unstaged
     * @private
     */
    _handleFilesUnstaged(data) {
        console.log(`[GitStore] Files unstaged: ${data.paths.length}`);

        this._emitStateChange('files-unstaged', { paths: data.paths });
    }

    /**
     * Handle changes discarded
     * @private
     */
    _handleChangesDiscarded(data) {
        console.log(`[GitStore] Changes discarded: ${data.paths.length}`);

        this._emitStateChange('changes-discarded', { paths: data.paths });
    }

    /**
     * Handle diff loaded
     * @private
     */
    _handleDiffLoaded(data) {
        const { filePath, diffType, diffs } = data;

        let diffState = this.state.fileDiffs.get(filePath);
        if (!diffState) {
            diffState = {
                unstaged: null,
                staged: null,
                hasChanges: false
            };
            this.state.fileDiffs.set(filePath, diffState);
        }

        diffState[diffType] = diffs;
        diffState.hasChanges = (diffState.unstaged !== null && diffState.unstaged.length > 0) ||
                               (diffState.staged !== null && diffState.staged.length > 0);

        this._emitStateChange('diff-updated', { filePath, diffType });
    }

    /**
     * Handle diff enabled
     * @private
     */
    _handleDiffEnabled(data) {
        console.log(`[GitStore] Diff enabled for: ${data.filePath}`);

        this._emitStateChange('diff-enabled', { filePath: data.filePath });
    }

    /**
     * Handle blame loaded
     * @private
     */
    _handleBlameLoaded(data) {
        const { filePath, entries } = data;

        this.state.fileBlames.set(filePath, {
            enabled: true,
            entries
        });

        this._emitStateChange('blame-updated', { filePath, entryCount: entries.length });
    }

    /**
     * Handle blame enabled
     * @private
     */
    _handleBlameEnabled(data) {
        console.log(`[GitStore] Blame enabled for: ${data.filePath}`);

        const blameState = this.state.fileBlames.get(data.filePath) || { enabled: false, entries: null };
        blameState.enabled = true;
        this.state.fileBlames.set(data.filePath, blameState);

        this._emitStateChange('blame-enabled', { filePath: data.filePath });
    }

    /**
     * Handle blame disabled
     * @private
     */
    _handleBlameDisabled(data) {
        console.log(`[GitStore] Blame disabled for: ${data.filePath}`);

        const blameState = this.state.fileBlames.get(data.filePath);
        if (blameState) {
            blameState.enabled = false;
        }

        this._emitStateChange('blame-disabled', { filePath: data.filePath });
    }

    /**
     * Set operation state
     * @private
     */
    _setOperationState(operation, active) {
        const opKey = `is${operation.charAt(0).toUpperCase()}${operation.slice(1)}ing`;
        this.state.operations[opKey] = active;

        if (!active) {
            this.state.operations.lastOperation = operation;
            this.state.operations.lastOperationTime = Date.now();
        }

        this._emitStateChange('operation-state-changed', {
            operation,
            active,
            allOperations: this.state.operations
        });
    }

    // ============================================
    // STATE GETTERS
    // ============================================

    /**
     * Get current state
     * @returns {Object}
     */
    getState() {
        return this.state;
    }

    /**
     * Get repository info
     * @returns {Object}
     */
    getRepositoryInfo() {
        return {
            path: this.state.repositoryPath,
            hasRepository: this.state.hasRepository,
            isInitialized: this.state.isInitialized
        };
    }

    /**
     * Get current branch info
     * @returns {Object}
     */
    getCurrentBranchInfo() {
        return {
            name: this.state.currentBranch,
            ahead: this.state.branchStats.ahead,
            behind: this.state.branchStats.behind,
            upstream: this.state.branchStats.upstream,
            trackingStatus: this.state.branchStats.trackingStatus
        };
    }

    /**
     * Get file status summary
     * @returns {Object}
     */
    getFileStatusSummary() {
        return {
            counts: this.state.fileCount,
            files: {
                modified: this.state.files.modified,
                staged: this.state.files.staged,
                unstaged: this.state.files.unstaged,
                untracked: this.state.files.untracked,
                conflicted: this.state.files.conflicted
            }
        };
    }

    /**
     * Get diff state for a file
     * @param {string} filePath - File path
     * @returns {Object|null}
     */
    getFileDiffState(filePath) {
        return this.state.fileDiffs.get(filePath) || null;
    }

    /**
     * Get blame state for a file
     * @param {string} filePath - File path
     * @returns {Object|null}
     */
    getFileBlameState(filePath) {
        return this.state.fileBlames.get(filePath) || null;
    }

    /**
     * Get operation state
     * @returns {Object}
     */
    getOperationState() {
        return this.state.operations;
    }

    /**
     * Check if any operation is in progress
     * @returns {boolean}
     */
    isOperationInProgress() {
        return this.state.operations.isFetching ||
               this.state.operations.isPushing ||
               this.state.operations.isPulling ||
               this.state.operations.isCommitting;
    }

    /**
     * Get recent commits
     * @param {number} limit - Number of commits
     * @returns {Array<Commit>}
     */
    getRecentCommits(limit = 10) {
        return this.state.commits.recent.slice(0, limit);
    }

    /**
     * Get current repository path
     * @returns {string|null}
     */
    getCurrentRepository() {
        return this.state.repositoryPath;
    }

    /**
     * Get current branch name
     * @returns {string|null}
     */
    async getCurrentBranch() {
        return this.state.currentBranch;
    }

    /**
     * Get current Git status
     * @returns {Object}
     */
    async getStatus() {
        return {
            modifiedFiles: this.state.files.modified.map(f => ({ path: f.path, status: f.status })),
            stagedFiles: this.state.files.staged.map(f => ({ path: f.path, status: f.status })),
            unstagedFiles: this.state.files.unstaged.map(f => ({ path: f.path, status: f.status })),
            untrackedFiles: this.state.files.untracked.map(f => ({ path: f.path, status: f.status })),
            branch: this.state.currentBranch,
            ahead: this.state.branchStats.ahead,
            behind: this.state.branchStats.behind
        };
    }

    /**
     * Refresh Git status
     * Delegates to GitService to fetch fresh status
     * @returns {Promise<void>}
     */
    async refreshStatus() {
        try {
            // Get GitService lazily to avoid circular dependency
            const gitService = require('../services/GitService').getInstance();

            if (!this.state.hasRepository) {
                console.log('[GitStore] No repository to refresh status for');
                return;
            }

            console.log('[GitStore] Refreshing Git status...');

            // Request GitService to reload status
            // This will trigger git:status-changed event which we listen to
            await gitService.refreshStatus();

        } catch (error) {
            console.error('[GitStore] Failed to refresh status:', error);
            this.state.lastError = error.message;
        }
    }

    // ============================================
    // STATE UPDATES
    // ============================================

    /**
     * Update state manually (for external updates)
     * @param {string} path - State path (e.g., 'currentBranch')
     * @param {*} value - New value
     */
    updateState(path, value) {
        const keys = path.split('.');
        let target = this.state;

        for (let i = 0; i < keys.length - 1; i++) {
            target = target[keys[i]];
        }

        target[keys[keys.length - 1]] = value;

        this._emitStateChange('manual-update', { path, value });
    }

    /**
     * Reset state
     */
    resetState() {
        this.state.repositoryPath = null;
        this.state.hasRepository = false;
        this.state.isInitialized = false;
        this.state.currentBranch = null;
        this.state.branches = { local: [], remote: [], all: [] };
        this.state.branchStats = { ahead: 0, behind: 0, upstream: null, trackingStatus: null };
        this.state.files = { modified: [], staged: [], unstaged: [], untracked: [], conflicted: [], all: [] };
        this.state.fileCount = { modified: 0, staged: 0, unstaged: 0, untracked: 0, conflicted: 0, total: 0 };
        this.state.commits = { recent: [], total: 0, hasMore: false };
        this.state.fileDiffs.clear();
        this.state.fileBlames.clear();
        this.state.operations = { isFetching: false, isPushing: false, isPulling: false, isCommitting: false, lastOperation: null, lastOperationTime: null };
        this.state.lastError = null;

        console.log('[GitStore] State reset');

        this._emitStateChange('reset');
    }

    // ============================================
    // EVENT EMISSION
    // ============================================

    /**
     * Emit state change event
     * @param {string} type - Change type
     * @param {Object} data - Change data
     * @private
     */
    _emitStateChange(type, data = {}) {
        EventBus.emit('git-store:state-changed', {
            type,
            data,
            timestamp: Date.now()
        });

        // Also emit specific event
        EventBus.emit(`git-store:${type}`, data);
    }

    /**
     * Subscribe to state changes
     * @param {Function} callback - Callback function
     * @returns {Function} Unsubscribe function
     */
    subscribe(callback) {
        EventBus.on('git-store:state-changed', callback);

        // Return unsubscribe function
        return () => {
            EventBus.off('git-store:state-changed', callback);
        };
    }

    /**
     * Subscribe to specific state change type
     * @param {string} type - Change type
     * @param {Function} callback - Callback function
     * @returns {Function} Unsubscribe function
     */
    subscribeToType(type, callback) {
        const eventName = `git-store:${type}`;
        EventBus.on(eventName, callback);

        return () => {
            EventBus.off(eventName, callback);
        };
    }

    /**
     * Dispose store
     */
    dispose() {
        this.resetState();
        console.log('[GitStore] Disposed');
    }
}

// Singleton instance
let instance = null;

module.exports = {
    getInstance() {
        if (!instance) {
            instance = new GitStore();
        }
        return instance;
    }
};

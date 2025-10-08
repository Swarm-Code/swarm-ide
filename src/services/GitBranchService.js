/**
 * GitBranchService - Service layer for Git branch operations
 *
 * Manages branch listing, creation, deletion, checkout, and upstream tracking.
 * Provides formatted branch data for UI components.
 *
 * Architecture inspired by VS Code's ref provider and Zed's branch management.
 */

const EventBus = require('../modules/EventBus');

class GitBranchService {
    constructor(gitService) {
        this.gitService = gitService;

        // Branch cache: { local, remote, all, timestamp }
        this.branchCache = null;

        // Current branch cache
        this.currentBranch = null;

        // Cache timeout (ms)
        this.cacheTimeout = 2 * 60 * 1000; // 2 minutes

        console.log('[GitBranchService] Initialized');

        // Setup event listeners for cache invalidation
        this._setupEventListeners();
    }

    /**
     * Setup event listeners for cache invalidation
     * @private
     */
    _setupEventListeners() {
        // Invalidate on branch operations
        EventBus.on('git:branch-created', () => {
            this.invalidateCache();
        });

        EventBus.on('git:branch-switched', () => {
            this.invalidateCache();
        });

        EventBus.on('git:push-completed', () => {
            this.invalidateCache();
        });

        EventBus.on('git:pull-completed', () => {
            this.invalidateCache();
        });

        EventBus.on('git:fetch-completed', () => {
            this.invalidateCache();
        });
    }

    // ============================================
    // BRANCH LISTING
    // ============================================

    /**
     * Get local branches
     *
     * @param {Object} options - Options
     * @param {boolean} options.useCache - Use cached data if available
     * @returns {Promise<Branch[]>}
     */
    async getLocalBranches(options = {}) {
        const { useCache = true } = options;

        // Check cache
        if (useCache && this._isCacheValid()) {
            console.log('[GitBranchService] Using cached local branches');
            return this.branchCache.local;
        }

        // Fetch from GitService
        const branches = await this.gitService.getBranches({ remote: false });

        if (!branches) return [];

        // Update cache
        this._updateCache('local', branches);

        console.log(`[GitBranchService] Fetched ${branches.length} local branches`);

        EventBus.emit('git-branch:loaded', {
            type: 'local',
            branches
        });

        return branches;
    }

    /**
     * Get remote branches
     *
     * @param {Object} options - Options
     * @param {boolean} options.useCache - Use cached data if available
     * @returns {Promise<Branch[]>}
     */
    async getRemoteBranches(options = {}) {
        const { useCache = true } = options;

        // Check cache
        if (useCache && this._isCacheValid()) {
            console.log('[GitBranchService] Using cached remote branches');
            return this.branchCache.remote;
        }

        // Fetch from GitService
        const branches = await this.gitService.getBranches({ remote: true });

        if (!branches) return [];

        // Update cache
        this._updateCache('remote', branches);

        console.log(`[GitBranchService] Fetched ${branches.length} remote branches`);

        EventBus.emit('git-branch:loaded', {
            type: 'remote',
            branches
        });

        return branches;
    }

    /**
     * Get all branches (local and remote)
     *
     * @param {Object} options - Options
     * @param {boolean} options.useCache - Use cached data if available
     * @returns {Promise<Branch[]>}
     */
    async getAllBranches(options = {}) {
        const { useCache = true } = options;

        // Check cache
        if (useCache && this._isCacheValid()) {
            console.log('[GitBranchService] Using cached all branches');
            return this.branchCache.all;
        }

        // Fetch from GitService
        const branches = await this.gitService.getBranches({ all: true });

        if (!branches) return [];

        // Update cache
        this._updateCache('all', branches);

        console.log(`[GitBranchService] Fetched ${branches.length} total branches`);

        EventBus.emit('git-branch:loaded', {
            type: 'all',
            branches
        });

        return branches;
    }

    /**
     * Get current branch
     *
     * @param {Object} options - Options
     * @param {boolean} options.useCache - Use cached data
     * @returns {Promise<string|null>}
     */
    async getCurrentBranch(options = {}) {
        const { useCache = true } = options;

        // Check cache
        if (useCache && this.currentBranch) {
            return this.currentBranch;
        }

        // Fetch from GitService
        const branch = await this.gitService.getCurrentBranch();

        // Update cache
        this.currentBranch = branch;

        return branch;
    }

    /**
     * Refresh branch list (force reload)
     *
     * @returns {Promise<void>}
     */
    async refresh() {
        console.log('[GitBranchService] Refreshing branches');

        this.invalidateCache();

        // Fetch all branch types
        await Promise.all([
            this.getLocalBranches({ useCache: false }),
            this.getRemoteBranches({ useCache: false }),
            this.getCurrentBranch({ useCache: false })
        ]);

        EventBus.emit('git-branch:refreshed');
    }

    // ============================================
    // BRANCH OPERATIONS
    // ============================================

    /**
     * Create a new branch
     *
     * @param {string} branchName - Branch name
     * @param {Object} options - Create options
     * @param {string} options.startPoint - Starting commit (default: HEAD)
     * @param {boolean} options.checkout - Checkout after creating
     * @returns {Promise<boolean>} Success status
     */
    async createBranch(branchName, options = {}) {
        try {
            console.log(`[GitBranchService] Creating branch: ${branchName}`);

            const success = await this.gitService.createBranch(branchName, options);

            if (success) {
                // Invalidate cache
                this.invalidateCache();

                EventBus.emit('git-branch:created', { branchName, options });

                console.log(`[GitBranchService] Branch created: ${branchName}`);
            }

            return success;
        } catch (error) {
            console.error(`[GitBranchService] Failed to create branch ${branchName}:`, error);
            return false;
        }
    }

    /**
     * Delete a branch
     *
     * @param {string} branchName - Branch name
     * @param {Object} options - Delete options
     * @param {boolean} options.force - Force delete even if not merged
     * @returns {Promise<boolean>} Success status
     */
    async deleteBranch(branchName, options = {}) {
        try {
            console.log(`[GitBranchService] Deleting branch: ${branchName}`);

            // Cannot delete current branch
            const current = await this.getCurrentBranch();
            if (current === branchName) {
                console.warn(`[GitBranchService] Cannot delete current branch: ${branchName}`);
                return false;
            }

            const success = await this.gitService.deleteBranch(branchName, options);

            if (success) {
                // Invalidate cache
                this.invalidateCache();

                EventBus.emit('git-branch:deleted', { branchName, options });

                console.log(`[GitBranchService] Branch deleted: ${branchName}`);
            }

            return success;
        } catch (error) {
            console.error(`[GitBranchService] Failed to delete branch ${branchName}:`, error);
            return false;
        }
    }

    /**
     * Checkout a branch
     *
     * @param {string} branchName - Branch name
     * @param {Object} options - Checkout options
     * @param {boolean} options.createBranch - Create branch if it doesn't exist
     * @returns {Promise<boolean>} Success status
     */
    async checkout(branchName, options = {}) {
        try {
            console.log(`[GitBranchService] Checking out branch: ${branchName}`);

            const success = await this.gitService.checkout(branchName, options);

            if (success) {
                // Update current branch cache
                this.currentBranch = branchName;

                // Invalidate branch cache
                this.invalidateCache();

                EventBus.emit('git-branch:switched', { branchName, options });

                console.log(`[GitBranchService] Checked out branch: ${branchName}`);
            }

            return success;
        } catch (error) {
            console.error(`[GitBranchService] Failed to checkout branch ${branchName}:`, error);
            return false;
        }
    }

    /**
     * Rename current branch
     *
     * @param {string} newName - New branch name
     * @returns {Promise<boolean>} Success status
     */
    async renameBranch(newName) {
        try {
            const currentBranch = await this.getCurrentBranch();
            if (!currentBranch) {
                console.warn('[GitBranchService] No current branch to rename');
                return false;
            }

            console.log(`[GitBranchService] Renaming branch ${currentBranch} to ${newName}`);

            // Use git branch -m to rename
            const repository = this.gitService.getActiveRepository();
            if (!repository) return false;

            await repository.client.execute(['branch', '-m', newName]);

            // Update current branch cache
            this.currentBranch = newName;

            // Invalidate cache
            this.invalidateCache();

            EventBus.emit('git-branch:renamed', {
                oldName: currentBranch,
                newName
            });

            console.log(`[GitBranchService] Branch renamed to: ${newName}`);

            return true;
        } catch (error) {
            console.error('[GitBranchService] Failed to rename branch:', error);
            return false;
        }
    }

    // ============================================
    // BRANCH QUERIES
    // ============================================

    /**
     * Get branch by name
     *
     * @param {string} branchName - Branch name
     * @returns {Promise<Branch|null>}
     */
    async getBranch(branchName) {
        const branches = await this.getAllBranches();
        return branches.find(b => b.name === branchName) || null;
    }

    /**
     * Get branches with divergence from current branch
     *
     * @returns {Promise<Array<Branch>>} Branches with ahead/behind info
     */
    async getBranchesWithDivergence() {
        const branches = await this.getLocalBranches();

        // Filter branches with tracking info
        return branches.filter(b => b.upstream && (b.ahead > 0 || b.behind > 0));
    }

    /**
     * Get merged branches
     *
     * @param {string} targetBranch - Target branch to compare against (default: current)
     * @returns {Promise<Array<string>>} Branch names that are merged
     */
    async getMergedBranches(targetBranch = null) {
        try {
            const repository = this.gitService.getActiveRepository();
            if (!repository) return [];

            const args = ['branch', '--merged'];
            if (targetBranch) {
                args.push(targetBranch);
            }

            const output = await repository.client.execute(args);

            // Parse branch names (remove * and whitespace)
            const branches = output
                .split('\n')
                .map(line => line.replace(/^\*?\s+/, '').trim())
                .filter(name => name && name !== 'master' && name !== 'main');

            return branches;
        } catch (error) {
            console.error('[GitBranchService] Failed to get merged branches:', error);
            return [];
        }
    }

    /**
     * Get unmerged branches
     *
     * @param {string} targetBranch - Target branch to compare against (default: current)
     * @returns {Promise<Array<string>>} Branch names that are not merged
     */
    async getUnmergedBranches(targetBranch = null) {
        try {
            const repository = this.gitService.getActiveRepository();
            if (!repository) return [];

            const args = ['branch', '--no-merged'];
            if (targetBranch) {
                args.push(targetBranch);
            }

            const output = await repository.client.execute(args);

            // Parse branch names
            const branches = output
                .split('\n')
                .map(line => line.replace(/^\*?\s+/, '').trim())
                .filter(name => name);

            return branches;
        } catch (error) {
            console.error('[GitBranchService] Failed to get unmerged branches:', error);
            return [];
        }
    }

    // ============================================
    // BRANCH ORGANIZATION
    // ============================================

    /**
     * Group branches by type
     *
     * @returns {Promise<Object>} Grouped branches
     */
    async getGroupedBranches() {
        const [local, remote] = await Promise.all([
            this.getLocalBranches(),
            this.getRemoteBranches()
        ]);

        const current = await this.getCurrentBranch();

        return {
            current: local.find(b => b.isCurrent),
            local: local.filter(b => !b.isCurrent),
            remote: remote,
            withTracking: local.filter(b => b.upstream),
            withoutTracking: local.filter(b => !b.upstream && !b.isCurrent),
            diverged: local.filter(b => b.hasDiverged())
        };
    }

    /**
     * Get branch menu data for UI
     *
     * Formatted for branch switcher menu component
     *
     * @returns {Promise<Object>} Menu data
     */
    async getBranchMenuData() {
        const grouped = await this.getGroupedBranches();

        return {
            current: grouped.current ? {
                name: grouped.current.name,
                upstream: grouped.current.upstream,
                ahead: grouped.current.ahead,
                behind: grouped.current.behind,
                trackingStatus: grouped.current.getTrackingStatus()
            } : null,

            local: grouped.local.map(b => ({
                name: b.name,
                upstream: b.upstream,
                ahead: b.ahead,
                behind: b.behind,
                trackingStatus: b.getTrackingStatus(),
                lastCommit: b.commitSha,
                lastCommitDate: b.commitDate
            })),

            remote: grouped.remote.map(b => ({
                name: b.name,
                lastCommit: b.commitSha,
                lastCommitDate: b.commitDate
            })),

            suggestions: {
                needsUpstream: grouped.withoutTracking.map(b => b.name),
                diverged: grouped.diverged.map(b => b.name)
            }
        };
    }

    // ============================================
    // UPSTREAM TRACKING
    // ============================================

    /**
     * Set upstream for current branch
     *
     * @param {string} upstream - Upstream branch (e.g., "origin/main")
     * @returns {Promise<boolean>} Success status
     */
    async setUpstream(upstream) {
        try {
            const currentBranch = await this.getCurrentBranch();
            if (!currentBranch) {
                console.warn('[GitBranchService] No current branch for upstream setting');
                return false;
            }

            console.log(`[GitBranchService] Setting upstream ${upstream} for ${currentBranch}`);

            const repository = this.gitService.getActiveRepository();
            if (!repository) return false;

            await repository.client.execute(['branch', '--set-upstream-to', upstream]);

            // Invalidate cache
            this.invalidateCache();

            EventBus.emit('git-branch:upstream-set', {
                branch: currentBranch,
                upstream
            });

            console.log(`[GitBranchService] Upstream set: ${upstream}`);

            return true;
        } catch (error) {
            console.error('[GitBranchService] Failed to set upstream:', error);
            return false;
        }
    }

    /**
     * Unset upstream for current branch
     *
     * @returns {Promise<boolean>} Success status
     */
    async unsetUpstream() {
        try {
            const currentBranch = await this.getCurrentBranch();
            if (!currentBranch) return false;

            console.log(`[GitBranchService] Unsetting upstream for ${currentBranch}`);

            const repository = this.gitService.getActiveRepository();
            if (!repository) return false;

            await repository.client.execute(['branch', '--unset-upstream']);

            // Invalidate cache
            this.invalidateCache();

            EventBus.emit('git-branch:upstream-unset', {
                branch: currentBranch
            });

            return true;
        } catch (error) {
            console.error('[GitBranchService] Failed to unset upstream:', error);
            return false;
        }
    }

    // ============================================
    // BRANCH STATISTICS
    // ============================================

    /**
     * Get branch statistics
     *
     * @returns {Promise<Object>} Statistics
     */
    async getStatistics() {
        const grouped = await this.getGroupedBranches();

        return {
            totalLocal: grouped.local.length + (grouped.current ? 1 : 0),
            totalRemote: grouped.remote.length,
            withTracking: grouped.withTracking.length,
            withoutTracking: grouped.withoutTracking.length,
            diverged: grouped.diverged.length,
            current: grouped.current?.name || null
        };
    }

    // ============================================
    // CACHE MANAGEMENT
    // ============================================

    /**
     * Check if cache is valid
     *
     * @returns {boolean}
     * @private
     */
    _isCacheValid() {
        if (!this.branchCache) return false;

        const age = Date.now() - this.branchCache.timestamp;
        if (age > this.cacheTimeout) {
            console.log(`[GitBranchService] Cache expired (age: ${age}ms)`);
            this.branchCache = null;
            return false;
        }

        return true;
    }

    /**
     * Update cache with new branch data
     *
     * @param {string} type - 'local', 'remote', or 'all'
     * @param {Branch[]} branches - Branch array
     * @private
     */
    _updateCache(type, branches) {
        if (!this.branchCache) {
            this.branchCache = {
                local: null,
                remote: null,
                all: null,
                timestamp: Date.now()
            };
        }

        this.branchCache[type] = branches;
        this.branchCache.timestamp = Date.now();
    }

    /**
     * Invalidate branch cache
     */
    invalidateCache() {
        this.branchCache = null;
        this.currentBranch = null;
        console.log('[GitBranchService] Cache invalidated');

        EventBus.emit('git-branch:cache-invalidated');
    }

    /**
     * Get cache statistics
     *
     * @returns {Object} Cache stats
     */
    getCacheStats() {
        if (!this.branchCache) {
            return {
                cached: false,
                age: null
            };
        }

        return {
            cached: true,
            age: Date.now() - this.branchCache.timestamp,
            hasLocal: this.branchCache.local !== null,
            hasRemote: this.branchCache.remote !== null,
            hasAll: this.branchCache.all !== null,
            currentBranch: this.currentBranch
        };
    }

    // ============================================
    // CONFIGURATION
    // ============================================

    /**
     * Set cache timeout
     *
     * @param {number} timeout - Timeout in milliseconds
     */
    setCacheTimeout(timeout) {
        this.cacheTimeout = timeout;
        console.log(`[GitBranchService] Cache timeout set to: ${timeout}ms`);
    }

    /**
     * Dispose service
     */
    dispose() {
        this.branchCache = null;
        this.currentBranch = null;
        console.log('[GitBranchService] Disposed');
    }
}

module.exports = { GitBranchService };

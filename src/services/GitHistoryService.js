/**
 * GitHistoryService - Service layer for Git commit history
 *
 * Manages log retrieval with pagination, filtering, and caching.
 * Provides file-specific history tracking and commit detail loading.
 *
 * Architecture inspired by VS Code's SCM history provider and Zed's commit timeline.
 */

const EventBus = require('../modules/EventBus');

class GitHistoryService {
    constructor(gitService) {
        this.gitService = gitService;

        // History cache: key -> { commits, hasMore, filters, timestamp }
        // Key format: "repo" for repository history, "file:path" for file history
        this.historyCache = new Map();

        // Pagination state: key -> { limit, skip }
        this.paginationState = new Map();

        // Default pagination settings
        this.defaultLimit = 50;
        this.maxLimit = 200;

        // Cache timeout (ms)
        this.cacheTimeout = 5 * 60 * 1000; // 5 minutes

        // Commit detail cache: sha -> commit
        this.commitCache = new Map();

        console.log('[GitHistoryService] Initialized');

        // Setup event listeners for cache invalidation
        this._setupEventListeners();
    }

    /**
     * Setup event listeners for cache invalidation
     * @private
     */
    _setupEventListeners() {
        // Invalidate on new commits
        EventBus.on('git:commit-created', () => {
            this.invalidateAllCache();
        });

        EventBus.on('git:branch-switched', () => {
            this.invalidateAllCache();
        });

        EventBus.on('git:pull-completed', () => {
            this.invalidateAllCache();
        });

        EventBus.on('git:push-completed', () => {
            // Push doesn't affect local history, but update pagination
            this._resetPagination('repo');
        });
    }

    // ============================================
    // HISTORY FETCHING
    // ============================================

    /**
     * Get commit history for repository
     *
     * @param {Object} options - History options
     * @param {number} options.limit - Number of commits to fetch
     * @param {number} options.skip - Number of commits to skip
     * @param {string} options.author - Filter by author
     * @param {string} options.since - Filter by date (e.g., "1 week ago")
     * @param {string} options.until - Filter by end date
     * @param {string} options.grep - Filter by commit message pattern
     * @param {boolean} options.useCache - Use cached data if available
     * @param {boolean} options.append - Append to existing results (for pagination)
     * @returns {Promise<Object>} { commits, hasMore, total }
     */
    async getHistory(options = {}) {
        const {
            limit = this.defaultLimit,
            skip = 0,
            author,
            since,
            until,
            grep,
            useCache = true,
            append = false
        } = options;

        const cacheKey = 'repo';

        // Check cache
        if (useCache && !append) {
            const cached = this._getCachedHistory(cacheKey, { author, since, until, grep });
            if (cached) {
                console.log(`[GitHistoryService] Using cached repository history`);
                return {
                    commits: cached.commits.slice(skip, skip + limit),
                    hasMore: cached.hasMore,
                    total: cached.commits.length
                };
            }
        }

        // Fetch from GitService
        const commits = await this.gitService.getLog({
            limit: Math.min(limit, this.maxLimit),
            skip,
            author,
            since,
            until,
            grep
        });

        if (!commits) {
            return { commits: [], hasMore: false, total: 0 };
        }

        // Check if there are more commits
        const hasMore = commits.length === limit;

        // Update cache
        if (!append) {
            this._updateCache(cacheKey, {
                commits,
                hasMore,
                filters: { author, since, until, grep }
            });
        }

        // Update pagination state
        this.paginationState.set(cacheKey, { limit, skip: skip + commits.length });

        console.log(`[GitHistoryService] Fetched ${commits.length} commits (skip: ${skip})`);

        EventBus.emit('git-history:loaded', {
            type: 'repo',
            commits,
            hasMore
        });

        return {
            commits,
            hasMore,
            total: commits.length
        };
    }

    /**
     * Get commit history for a specific file
     *
     * @param {string} filePath - Absolute file path
     * @param {Object} options - History options
     * @param {boolean} options.follow - Follow file renames
     * @param {number} options.limit - Number of commits to fetch
     * @param {number} options.skip - Number of commits to skip
     * @param {boolean} options.useCache - Use cached data if available
     * @returns {Promise<Object>} { commits, hasMore, total }
     */
    async getFileHistory(filePath, options = {}) {
        const {
            follow = true,
            limit = this.defaultLimit,
            skip = 0,
            useCache = true
        } = options;

        const cacheKey = `file:${filePath}`;

        // Check cache
        if (useCache) {
            const cached = this._getCachedHistory(cacheKey, { follow });
            if (cached) {
                console.log(`[GitHistoryService] Using cached file history for: ${filePath}`);
                return {
                    commits: cached.commits.slice(skip, skip + limit),
                    hasMore: cached.hasMore,
                    total: cached.commits.length
                };
            }
        }

        // Fetch from GitService
        const commits = await this.gitService.getLog({
            path: filePath,
            follow,
            limit: Math.min(limit, this.maxLimit),
            skip
        });

        if (!commits) {
            return { commits: [], hasMore: false, total: 0 };
        }

        const hasMore = commits.length === limit;

        // Update cache
        this._updateCache(cacheKey, {
            commits,
            hasMore,
            filters: { follow }
        });

        console.log(`[GitHistoryService] Fetched ${commits.length} commits for file: ${filePath}`);

        EventBus.emit('git-history:loaded', {
            type: 'file',
            filePath,
            commits,
            hasMore
        });

        return {
            commits,
            hasMore,
            total: commits.length
        };
    }

    /**
     * Load more commits (pagination)
     *
     * @param {string} type - 'repo' or 'file'
     * @param {string} filePath - File path (for file history)
     * @param {Object} options - Options
     * @returns {Promise<Object>} { commits, hasMore, total }
     */
    async loadMore(type, filePath = null, options = {}) {
        const cacheKey = type === 'file' ? `file:${filePath}` : 'repo';

        // Get current pagination state
        const pagination = this.paginationState.get(cacheKey) || { limit: this.defaultLimit, skip: 0 };

        if (type === 'file') {
            return this.getFileHistory(filePath, {
                ...options,
                skip: pagination.skip,
                limit: pagination.limit,
                useCache: false
            });
        } else {
            return this.getHistory({
                ...options,
                skip: pagination.skip,
                limit: pagination.limit,
                useCache: false
            });
        }
    }

    /**
     * Refresh history (force reload)
     *
     * @param {string} type - 'repo' or 'file'
     * @param {string} filePath - File path (for file history)
     * @param {Object} options - Options
     * @returns {Promise<Object>}
     */
    async refresh(type, filePath = null, options = {}) {
        const cacheKey = type === 'file' ? `file:${filePath}` : 'repo';

        // Clear cache and pagination
        this.invalidateCache(cacheKey);
        this._resetPagination(cacheKey);

        if (type === 'file') {
            return this.getFileHistory(filePath, { ...options, useCache: false });
        } else {
            return this.getHistory({ ...options, useCache: false });
        }
    }

    // ============================================
    // COMMIT DETAILS
    // ============================================

    /**
     * Get commit by SHA
     *
     * @param {string} sha - Commit SHA
     * @param {Object} options - Options
     * @param {boolean} options.useCache - Use cached data
     * @returns {Promise<Commit|null>}
     */
    async getCommit(sha, options = {}) {
        const { useCache = true } = options;

        // Check cache
        if (useCache && this.commitCache.has(sha)) {
            console.log(`[GitHistoryService] Using cached commit: ${sha}`);
            return this.commitCache.get(sha);
        }

        // Fetch from GitService
        const commits = await this.gitService.getLog({ limit: 1, revision: sha });

        if (!commits || commits.length === 0) {
            return null;
        }

        const commit = commits[0];

        // Cache the commit
        this.commitCache.set(sha, commit);

        return commit;
    }

    /**
     * Get diff for a commit
     *
     * @param {string} sha - Commit SHA
     * @returns {Promise<Diff[]|null>}
     */
    async getCommitDiff(sha) {
        try {
            const diffs = await this.gitService.getDiff(null, {
                revision: `${sha}^..${sha}`
            });

            EventBus.emit('git-history:commit-diff-loaded', { sha, diffs });

            return diffs;
        } catch (error) {
            console.error(`[GitHistoryService] Failed to get diff for commit ${sha}:`, error);
            return null;
        }
    }

    /**
     * Get files changed in a commit
     *
     * @param {string} sha - Commit SHA
     * @returns {Promise<Array<Object>>} Files with stats
     */
    async getCommitFiles(sha) {
        try {
            const stats = await this.gitService.getDiffStats(null, {
                revision: `${sha}^..${sha}`
            });

            return stats || [];
        } catch (error) {
            console.error(`[GitHistoryService] Failed to get files for commit ${sha}:`, error);
            return [];
        }
    }

    // ============================================
    // SEARCH AND FILTERING
    // ============================================

    /**
     * Search commits by message
     *
     * @param {string} query - Search query
     * @param {Object} options - Search options
     * @returns {Promise<Array<Commit>>}
     */
    async searchByMessage(query, options = {}) {
        const { limit = this.defaultLimit } = options;

        const commits = await this.gitService.getLog({
            grep: query,
            limit
        });

        EventBus.emit('git-history:search-results', {
            query,
            commits: commits || []
        });

        return commits || [];
    }

    /**
     * Get commits by author
     *
     * @param {string} author - Author name or email
     * @param {Object} options - Options
     * @returns {Promise<Array<Commit>>}
     */
    async getCommitsByAuthor(author, options = {}) {
        const { limit = this.defaultLimit, since } = options;

        const commits = await this.gitService.getLog({
            author,
            limit,
            since
        });

        return commits || [];
    }

    /**
     * Get commits in a date range
     *
     * @param {string} since - Start date
     * @param {string} until - End date
     * @param {Object} options - Options
     * @returns {Promise<Array<Commit>>}
     */
    async getCommitsByDateRange(since, until, options = {}) {
        const { limit = this.defaultLimit } = options;

        const commits = await this.gitService.getLog({
            since,
            until,
            limit
        });

        return commits || [];
    }

    /**
     * Get unique authors from history
     *
     * @param {Object} options - Options
     * @returns {Promise<Array<string>>}
     */
    async getAuthors(options = {}) {
        const { limit = 100 } = options;

        const commits = await this.gitService.getLog({ limit });

        if (!commits) return [];

        const authors = new Set();
        for (const commit of commits) {
            authors.add(commit.author);
        }

        return Array.from(authors).sort();
    }

    // ============================================
    // HISTORY STATISTICS
    // ============================================

    /**
     * Get commit statistics for a time period
     *
     * @param {string} since - Start date
     * @param {Object} options - Options
     * @returns {Promise<Object>} Statistics
     */
    async getStatistics(since = '1 month ago', options = {}) {
        const commits = await this.gitService.getLog({ since });

        if (!commits || commits.length === 0) {
            return {
                totalCommits: 0,
                authors: [],
                commitsPerDay: {},
                commitsPerAuthor: {}
            };
        }

        // Calculate statistics
        const authors = new Set();
        const commitsPerDay = {};
        const commitsPerAuthor = {};

        for (const commit of commits) {
            authors.add(commit.author);

            // Count by day
            const date = new Date(commit.authorTime * 1000).toISOString().split('T')[0];
            commitsPerDay[date] = (commitsPerDay[date] || 0) + 1;

            // Count by author
            commitsPerAuthor[commit.author] = (commitsPerAuthor[commit.author] || 0) + 1;
        }

        return {
            totalCommits: commits.length,
            authors: Array.from(authors),
            commitsPerDay,
            commitsPerAuthor
        };
    }

    /**
     * Get activity timeline
     *
     * @param {string} since - Start date
     * @returns {Promise<Array<Object>>} Timeline entries
     */
    async getActivityTimeline(since = '1 week ago') {
        const commits = await this.gitService.getLog({ since });

        if (!commits) return [];

        // Group commits by day
        const timeline = {};

        for (const commit of commits) {
            const date = new Date(commit.authorTime * 1000).toISOString().split('T')[0];

            if (!timeline[date]) {
                timeline[date] = {
                    date,
                    commits: [],
                    count: 0
                };
            }

            timeline[date].commits.push(commit);
            timeline[date].count++;
        }

        // Convert to array and sort by date
        return Object.values(timeline).sort((a, b) => b.date.localeCompare(a.date));
    }

    // ============================================
    // CACHE MANAGEMENT
    // ============================================

    /**
     * Get cached history if valid
     *
     * @param {string} key - Cache key
     * @param {Object} filters - Filter parameters
     * @returns {Object|null}
     * @private
     */
    _getCachedHistory(key, filters = {}) {
        const cached = this.historyCache.get(key);
        if (!cached) return null;

        // Check filters match
        const filtersMatch = JSON.stringify(filters) === JSON.stringify(cached.filters);
        if (!filtersMatch) {
            console.log(`[GitHistoryService] Cache miss: filter mismatch for ${key}`);
            return null;
        }

        // Check cache timeout
        const age = Date.now() - cached.timestamp;
        if (age > this.cacheTimeout) {
            console.log(`[GitHistoryService] Cache expired for ${key} (age: ${age}ms)`);
            this.historyCache.delete(key);
            return null;
        }

        return cached;
    }

    /**
     * Update cache with new history data
     *
     * @param {string} key - Cache key
     * @param {Object} data - History data
     * @private
     */
    _updateCache(key, data) {
        this.historyCache.set(key, {
            ...data,
            timestamp: Date.now()
        });
    }

    /**
     * Reset pagination state for a key
     *
     * @param {string} key - Cache key
     * @private
     */
    _resetPagination(key) {
        this.paginationState.delete(key);
    }

    /**
     * Invalidate cache for a specific key
     *
     * @param {string} key - Cache key
     */
    invalidateCache(key) {
        if (this.historyCache.has(key)) {
            this.historyCache.delete(key);
            console.log(`[GitHistoryService] Cache invalidated for: ${key}`);

            EventBus.emit('git-history:cache-invalidated', { key });
        }
    }

    /**
     * Invalidate all history cache
     */
    invalidateAllCache() {
        const count = this.historyCache.size;
        this.historyCache.clear();
        this.commitCache.clear();
        this.paginationState.clear();

        console.log(`[GitHistoryService] All cache invalidated (${count} history entries)`);

        EventBus.emit('git-history:cache-invalidated', { all: true });
    }

    /**
     * Clear old cache entries
     *
     * @param {number} maxAge - Maximum age in milliseconds
     */
    clearOldCache(maxAge = this.cacheTimeout) {
        const now = Date.now();
        let cleared = 0;

        for (const [key, cached] of this.historyCache.entries()) {
            const age = now - cached.timestamp;
            if (age > maxAge) {
                this.historyCache.delete(key);
                cleared++;
            }
        }

        if (cleared > 0) {
            console.log(`[GitHistoryService] Cleared ${cleared} old cache entries`);
        }
    }

    /**
     * Get cache statistics
     *
     * @returns {Object} Cache stats
     */
    getCacheStats() {
        const stats = {
            historyEntries: this.historyCache.size,
            commitEntries: this.commitCache.size,
            paginationStates: this.paginationState.size,
            entries: []
        };

        for (const [key, cached] of this.historyCache.entries()) {
            stats.entries.push({
                key,
                commits: cached.commits.length,
                hasMore: cached.hasMore,
                filters: cached.filters,
                age: Date.now() - cached.timestamp
            });
        }

        return stats;
    }

    // ============================================
    // CONFIGURATION
    // ============================================

    /**
     * Set default pagination limit
     *
     * @param {number} limit - Default limit
     */
    setDefaultLimit(limit) {
        this.defaultLimit = limit;
        console.log(`[GitHistoryService] Default limit set to: ${limit}`);
    }

    /**
     * Set maximum pagination limit
     *
     * @param {number} limit - Maximum limit
     */
    setMaxLimit(limit) {
        this.maxLimit = limit;
        console.log(`[GitHistoryService] Max limit set to: ${limit}`);
    }

    /**
     * Set cache timeout
     *
     * @param {number} timeout - Timeout in milliseconds
     */
    setCacheTimeout(timeout) {
        this.cacheTimeout = timeout;
        console.log(`[GitHistoryService] Cache timeout set to: ${timeout}ms`);
    }

    /**
     * Dispose service
     */
    dispose() {
        this.historyCache.clear();
        this.commitCache.clear();
        this.paginationState.clear();
        console.log('[GitHistoryService] Disposed');
    }
}

module.exports = { GitHistoryService };

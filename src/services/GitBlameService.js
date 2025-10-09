/**
 * GitBlameService - Service layer for Git blame operations
 *
 * Manages blame data fetching, caching, and formatting for editor integration.
 * Provides debounced blame loading, incremental updates, and decoration data.
 *
 * Architecture inspired by Zed's blame debouncing and VS Code's blame provider.
 */

const EventBus = require('../modules/EventBus');
const logger = require('../utils/Logger');

class GitBlameService {
    constructor(gitService) {
        this.gitService = gitService;

        // Blame cache: filePath -> { entries, lineMap, revision, timestamp }
        this.blameCache = new Map();

        // Active blame files: Set of file paths with blame enabled
        this.activeBlameFiles = new Set();

        // Debounce timers: filePath -> timeoutId
        this.debounceTimers = new Map();

        // Default debounce delay (ms) - like Zed's blame delay
        this.debounceDelay = 300;

        // Cache timeout (ms) - blame data validity period
        this.cacheTimeout = 5 * 60 * 1000; // 5 minutes

        logger.debug('gitBlame', '[GitBlameService] Initialized');

        // Listen to git events for cache invalidation
        this._setupEventListeners();
    }

    /**
     * Setup event listeners for cache invalidation
     * @private
     */
    _setupEventListeners() {
        // Invalidate cache on commit, checkout, pull
        EventBus.on('git:commit-created', () => {
            this.invalidateAllCache();
        });

        EventBus.on('git:branch-switched', () => {
            this.invalidateAllCache();
        });

        EventBus.on('git:pull-completed', () => {
            this.invalidateAllCache();
        });

        // Invalidate specific file on stage/unstage
        EventBus.on('git:files-staged', ({ paths }) => {
            paths.forEach(path => this.invalidateCache(path));
        });

        EventBus.on('git:files-unstaged', ({ paths }) => {
            paths.forEach(path => this.invalidateCache(path));
        });

        EventBus.on('git:changes-discarded', ({ paths }) => {
            paths.forEach(path => this.invalidateCache(path));
        });
    }

    // ============================================
    // BLAME FETCHING
    // ============================================

    /**
     * Get blame for a file with caching and debouncing
     *
     * @param {string} filePath - Absolute file path
     * @param {Object} options - Blame options
     * @param {string} options.revision - Commit to blame (default: HEAD)
     * @param {boolean} options.useCache - Use cached data if available
     * @param {boolean} options.debounce - Debounce the request
     * @returns {Promise<BlameEntry[]|null>}
     */
    async getBlame(filePath, options = {}) {
        const {
            revision = 'HEAD',
            useCache = true,
            debounce = true
        } = options;

        // Check cache first
        if (useCache) {
            const cached = this._getCachedBlame(filePath, revision);
            if (cached) {
                logger.debug('gitBlame', `[GitBlameService] Using cached blame for: ${filePath}`);
                return cached.entries;
            }
        }

        // Debounce if requested
        if (debounce) {
            return this._debouncedGetBlame(filePath, options);
        }

        // Fetch blame data
        return this._fetchBlame(filePath, options);
    }

    /**
     * Get blame with debouncing to prevent excessive git calls
     *
     * @param {string} filePath - Absolute file path
     * @param {Object} options - Blame options
     * @returns {Promise<BlameEntry[]|null>}
     * @private
     */
    async _debouncedGetBlame(filePath, options) {
        // Clear existing timer
        if (this.debounceTimers.has(filePath)) {
            clearTimeout(this.debounceTimers.get(filePath));
        }

        // Create promise that resolves after debounce delay
        return new Promise((resolve) => {
            const timerId = setTimeout(async () => {
                this.debounceTimers.delete(filePath);
                const entries = await this._fetchBlame(filePath, options);
                resolve(entries);
            }, this.debounceDelay);

            this.debounceTimers.set(filePath, timerId);
        });
    }

    /**
     * Fetch blame data from GitService and cache it
     *
     * @param {string} filePath - Absolute file path
     * @param {Object} options - Blame options
     * @returns {Promise<BlameEntry[]|null>}
     * @private
     */
    async _fetchBlame(filePath, options = {}) {
        try {
            const revision = options.revision || 'HEAD';

            logger.debug('gitBlame', `[GitBlameService] Fetching blame for: ${filePath} @ ${revision}`);

            // Fetch from GitService
            const entries = await this.gitService.getBlame(filePath, options);

            if (!entries || entries.length === 0) {
                logger.warn('gitBlame', `[GitBlameService] No blame data for: ${filePath}`);
                return null;
            }

            // Create line map for fast lookup
            const lineMap = this._createLineMap(entries);

            // Cache the result
            this.blameCache.set(filePath, {
                entries,
                lineMap,
                revision,
                timestamp: Date.now()
            });

            logger.debug('gitBlame', `[GitBlameService] Cached ${entries.length} blame entries for: ${filePath}`);

            // Emit event
            EventBus.emit('git-blame:loaded', {
                filePath,
                entries,
                revision
            });

            return entries;
        } catch (error) {
            logger.error('gitBlame', `[GitBlameService] Failed to fetch blame for ${filePath}:`, error);
            return null;
        }
    }

    /**
     * Get blame for a file with streaming (for large files)
     *
     * @param {string} filePath - Absolute file path
     * @param {Function} onEntry - Callback for each blame entry
     * @param {Object} options - Blame options
     * @returns {Promise<void>}
     */
    async getBlameStream(filePath, onEntry, options = {}) {
        try {
            logger.debug('gitBlame', `[GitBlameService] Streaming blame for: ${filePath}`);

            const entries = [];
            const wrappedCallback = (entry) => {
                entries.push(entry);
                onEntry(entry);
            };

            await this.gitService.getBlameStream(filePath, wrappedCallback, options);

            // Cache after streaming completes
            const revision = options.revision || 'HEAD';
            const lineMap = this._createLineMap(entries);

            this.blameCache.set(filePath, {
                entries,
                lineMap,
                revision,
                timestamp: Date.now()
            });

            logger.debug('gitBlame', `[GitBlameService] Stream complete, cached ${entries.length} entries`);
        } catch (error) {
            logger.error('gitBlame', `[GitBlameService] Stream failed for ${filePath}:`, error);
        }
    }

    // ============================================
    // BLAME QUERIES
    // ============================================

    /**
     * Get blame entry for a specific line number
     *
     * @param {string} filePath - Absolute file path
     * @param {number} lineNumber - Line number (1-indexed)
     * @param {Object} options - Options
     * @returns {Promise<BlameEntry|null>}
     */
    async getBlameForLine(filePath, lineNumber, options = {}) {
        // Try cache first
        const cached = this._getCachedBlame(filePath, options.revision || 'HEAD');
        if (cached && cached.lineMap) {
            return cached.lineMap.get(lineNumber) || null;
        }

        // Fetch if not cached
        const entries = await this.getBlame(filePath, options);
        if (!entries) return null;

        // Find entry for this line
        return entries.find(entry =>
            lineNumber >= entry.lineStart && lineNumber <= entry.lineEnd
        ) || null;
    }

    /**
     * Get blame entries for a line range
     *
     * @param {string} filePath - Absolute file path
     * @param {number} startLine - Start line (1-indexed)
     * @param {number} endLine - End line (1-indexed)
     * @param {Object} options - Options
     * @returns {Promise<BlameEntry[]>}
     */
    async getBlameForRange(filePath, startLine, endLine, options = {}) {
        const entries = await this.getBlame(filePath, options);
        if (!entries) return [];

        // Find entries that overlap with the range
        return entries.filter(entry =>
            (entry.lineStart >= startLine && entry.lineStart <= endLine) ||
            (entry.lineEnd >= startLine && entry.lineEnd <= endLine) ||
            (entry.lineStart <= startLine && entry.lineEnd >= endLine)
        );
    }

    /**
     * Get unique commits from blame data
     *
     * @param {string} filePath - Absolute file path
     * @param {Object} options - Options
     * @returns {Promise<Array<Object>>} Unique commits
     */
    async getUniqueCommits(filePath, options = {}) {
        const entries = await this.getBlame(filePath, options);
        if (!entries) return [];

        const commits = new Map();

        for (const entry of entries) {
            if (!commits.has(entry.sha)) {
                commits.set(entry.sha, {
                    sha: entry.sha,
                    shortSha: entry.shortSha,
                    author: entry.author,
                    authorMail: entry.authorMail,
                    authorTime: entry.authorTime,
                    summary: entry.summary
                });
            }
        }

        return Array.from(commits.values());
    }

    // ============================================
    // BLAME STATE MANAGEMENT
    // ============================================

    /**
     * Enable blame for a file (adds to active set)
     *
     * @param {string} filePath - Absolute file path
     * @returns {Promise<void>}
     */
    async enableBlame(filePath) {
        if (!this.activeBlameFiles.has(filePath)) {
            this.activeBlameFiles.add(filePath);
            logger.debug('gitBlame', `[GitBlameService] Blame enabled for: ${filePath}`);

            // Fetch blame data
            await this.getBlame(filePath, { debounce: true });

            EventBus.emit('git-blame:enabled', { filePath });
        }
    }

    /**
     * Disable blame for a file (removes from active set)
     *
     * @param {string} filePath - Absolute file path
     */
    disableBlame(filePath) {
        if (this.activeBlameFiles.has(filePath)) {
            this.activeBlameFiles.delete(filePath);
            logger.debug('gitBlame', `[GitBlameService] Blame disabled for: ${filePath}`);

            EventBus.emit('git-blame:disabled', { filePath });
        }
    }

    /**
     * Toggle blame for a file
     *
     * @param {string} filePath - Absolute file path
     * @returns {Promise<boolean>} New blame state (true = enabled)
     */
    async toggleBlame(filePath) {
        if (this.activeBlameFiles.has(filePath)) {
            this.disableBlame(filePath);
            return false;
        } else {
            await this.enableBlame(filePath);
            return true;
        }
    }

    /**
     * Check if blame is enabled for a file
     *
     * @param {string} filePath - Absolute file path
     * @returns {boolean}
     */
    isBlameEnabled(filePath) {
        return this.activeBlameFiles.has(filePath);
    }

    // ============================================
    // DECORATION DATA FORMATTING
    // ============================================

    /**
     * Get decoration data for editor gutter
     *
     * Format suitable for CodeMirror gutter rendering
     *
     * @param {string} filePath - Absolute file path
     * @param {Object} options - Options
     * @returns {Promise<Array<Object>>} Decoration data
     */
    async getGutterDecorations(filePath, options = {}) {
        const entries = await this.getBlame(filePath, options);
        if (!entries) return [];

        const decorations = [];

        for (const entry of entries) {
            for (let line = entry.lineStart; line <= entry.lineEnd; line++) {
                decorations.push({
                    line: line,
                    sha: entry.sha,
                    shortSha: entry.shortSha,
                    author: entry.author,
                    authorTime: entry.authorTime,
                    summary: entry.summary,
                    annotation: entry.getAnnotation({
                        maxLength: 40,
                        relativeTimes: true
                    }),
                    tooltip: entry.getTooltip()
                });
            }
        }

        return decorations;
    }

    /**
     * Get hover tooltip data for a line
     *
     * @param {string} filePath - Absolute file path
     * @param {number} lineNumber - Line number (1-indexed)
     * @param {Object} options - Options
     * @returns {Promise<Object|null>} Tooltip data
     */
    async getHoverTooltip(filePath, lineNumber, options = {}) {
        const entry = await this.getBlameForLine(filePath, lineNumber, options);
        if (!entry) return null;

        return {
            sha: entry.sha,
            shortSha: entry.shortSha,
            author: entry.author,
            authorMail: entry.authorMail,
            authorTime: entry.authorTime,
            summary: entry.summary,
            tooltip: entry.getTooltip(),
            lines: `${entry.lineStart}-${entry.lineEnd}`
        };
    }

    // ============================================
    // CACHE MANAGEMENT
    // ============================================

    /**
     * Get cached blame data if valid
     *
     * @param {string} filePath - Absolute file path
     * @param {string} revision - Commit revision
     * @returns {Object|null} Cached data or null
     * @private
     */
    _getCachedBlame(filePath, revision) {
        const cached = this.blameCache.get(filePath);
        if (!cached) return null;

        // Check revision match
        if (cached.revision !== revision) {
            logger.debug('gitBlame', `[GitBlameService] Cache miss: revision mismatch for ${filePath}`);
            return null;
        }

        // Check cache timeout
        const age = Date.now() - cached.timestamp;
        if (age > this.cacheTimeout) {
            logger.debug('gitBlame', `[GitBlameService] Cache expired for ${filePath} (age: ${age}ms)`);
            this.blameCache.delete(filePath);
            return null;
        }

        return cached;
    }

    /**
     * Create line number to blame entry map
     *
     * @param {BlameEntry[]} entries - Blame entries
     * @returns {Map<number, BlameEntry>}
     * @private
     */
    _createLineMap(entries) {
        const lineMap = new Map();

        for (const entry of entries) {
            for (let line = entry.lineStart; line <= entry.lineEnd; line++) {
                lineMap.set(line, entry);
            }
        }

        return lineMap;
    }

    /**
     * Invalidate cache for a specific file
     *
     * @param {string} filePath - Absolute file path
     */
    invalidateCache(filePath) {
        if (this.blameCache.has(filePath)) {
            this.blameCache.delete(filePath);
            logger.debug('gitBlame', `[GitBlameService] Cache invalidated for: ${filePath}`);

            EventBus.emit('git-blame:cache-invalidated', { filePath });
        }
    }

    /**
     * Invalidate all blame cache
     */
    invalidateAllCache() {
        const count = this.blameCache.size;
        this.blameCache.clear();
        logger.debug('gitBlame', `[GitBlameService] All cache invalidated (${count} entries)`);

        EventBus.emit('git-blame:cache-invalidated', { all: true });
    }

    /**
     * Clear cache entries older than specified age
     *
     * @param {number} maxAge - Maximum age in milliseconds
     */
    clearOldCache(maxAge = this.cacheTimeout) {
        const now = Date.now();
        let cleared = 0;

        for (const [filePath, cached] of this.blameCache.entries()) {
            const age = now - cached.timestamp;
            if (age > maxAge) {
                this.blameCache.delete(filePath);
                cleared++;
            }
        }

        if (cleared > 0) {
            logger.debug('gitBlame', `[GitBlameService] Cleared ${cleared} old cache entries`);
        }
    }

    /**
     * Get cache statistics
     *
     * @returns {Object} Cache stats
     */
    getCacheStats() {
        const stats = {
            totalEntries: this.blameCache.size,
            activeFiles: this.activeBlameFiles.size,
            pendingDebounces: this.debounceTimers.size,
            entries: []
        };

        for (const [filePath, cached] of this.blameCache.entries()) {
            stats.entries.push({
                filePath,
                revision: cached.revision,
                blameEntries: cached.entries.length,
                age: Date.now() - cached.timestamp,
                isActive: this.activeBlameFiles.has(filePath)
            });
        }

        return stats;
    }

    // ============================================
    // CONFIGURATION
    // ============================================

    /**
     * Set debounce delay
     *
     * @param {number} delay - Delay in milliseconds
     */
    setDebounceDelay(delay) {
        this.debounceDelay = delay;
        logger.debug('gitBlame', `[GitBlameService] Debounce delay set to: ${delay}ms`);
    }

    /**
     * Set cache timeout
     *
     * @param {number} timeout - Timeout in milliseconds
     */
    setCacheTimeout(timeout) {
        this.cacheTimeout = timeout;
        logger.debug('gitBlame', `[GitBlameService] Cache timeout set to: ${timeout}ms`);
    }

    /**
     * Dispose service
     */
    dispose() {
        // Clear all timers
        for (const timerId of this.debounceTimers.values()) {
            clearTimeout(timerId);
        }
        this.debounceTimers.clear();

        // Clear cache
        this.blameCache.clear();
        this.activeBlameFiles.clear();

        logger.debug('gitBlame', '[GitBlameService] Disposed');
    }
}

module.exports = { GitBlameService };

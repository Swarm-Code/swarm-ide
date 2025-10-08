/**
 * GitDiffService - Service layer for Git diff operations
 *
 * Manages diff computation, hunk tracking, and gutter decoration data.
 * Provides real-time diff updates for editor integration.
 *
 * Architecture inspired by VS Code's diff decorations and Zed's buffer diff state.
 */

const EventBus = require('../modules/EventBus');
const { DiffParser } = require('../lib/git/parsers/DiffParser');

class GitDiffService {
    constructor(gitService) {
        this.gitService = gitService;

        // Diff cache: filePath -> { unstaged, staged, timestamp }
        this.diffCache = new Map();

        // Active diff files: Set of file paths with diff tracking enabled
        this.activeDiffFiles = new Set();

        // Cache timeout (ms)
        this.cacheTimeout = 2 * 60 * 1000; // 2 minutes

        console.log('[GitDiffService] Initialized');

        // Setup event listeners for cache invalidation
        this._setupEventListeners();
    }

    /**
     * Setup event listeners for cache invalidation
     * @private
     */
    _setupEventListeners() {
        // Invalidate on git operations
        EventBus.on('git:files-staged', ({ paths }) => {
            paths.forEach(path => this.invalidateCache(path));
        });

        EventBus.on('git:files-unstaged', ({ paths }) => {
            paths.forEach(path => this.invalidateCache(path));
        });

        EventBus.on('git:changes-discarded', ({ paths }) => {
            paths.forEach(path => this.invalidateCache(path));
        });

        EventBus.on('git:commit-created', () => {
            this.invalidateAllCache();
        });

        EventBus.on('git:branch-switched', () => {
            this.invalidateAllCache();
        });

        EventBus.on('git:pull-completed', () => {
            this.invalidateAllCache();
        });

        // Listen to file changes for real-time diff updates
        EventBus.on('file:changed', ({ filePath }) => {
            if (this.activeDiffFiles.has(filePath)) {
                this.refreshDiff(filePath);
            }
        });

        EventBus.on('file:saved', ({ filePath }) => {
            if (this.activeDiffFiles.has(filePath)) {
                this.refreshDiff(filePath);
            }
        });
    }

    // ============================================
    // DIFF FETCHING
    // ============================================

    /**
     * Get diff for a file (unstaged changes)
     *
     * @param {string} filePath - Absolute file path
     * @param {Object} options - Diff options
     * @param {boolean} options.useCache - Use cached data if available
     * @returns {Promise<Diff[]|null>}
     */
    async getDiff(filePath, options = {}) {
        const { useCache = true } = options;

        // Check cache
        if (useCache) {
            const cached = this._getCachedDiff(filePath, 'unstaged');
            if (cached) {
                console.log(`[GitDiffService] Using cached unstaged diff for: ${filePath}`);
                return cached;
            }
        }

        // Fetch unstaged diff (working tree vs index)
        return this._fetchDiff(filePath, { staged: false });
    }

    /**
     * Get staged diff for a file
     *
     * @param {string} filePath - Absolute file path
     * @param {Object} options - Diff options
     * @param {boolean} options.useCache - Use cached data if available
     * @returns {Promise<Diff[]|null>}
     */
    async getStagedDiff(filePath, options = {}) {
        const { useCache = true } = options;

        // Check cache
        if (useCache) {
            const cached = this._getCachedDiff(filePath, 'staged');
            if (cached) {
                console.log(`[GitDiffService] Using cached staged diff for: ${filePath}`);
                return cached;
            }
        }

        // Fetch staged diff (index vs HEAD)
        return this._fetchDiff(filePath, { staged: true });
    }

    /**
     * Get both unstaged and staged diffs
     *
     * @param {string} filePath - Absolute file path
     * @param {Object} options - Diff options
     * @returns {Promise<Object>} { unstaged, staged }
     */
    async getAllDiffs(filePath, options = {}) {
        const [unstaged, staged] = await Promise.all([
            this.getDiff(filePath, options),
            this.getStagedDiff(filePath, options)
        ]);

        return { unstaged, staged };
    }

    /**
     * Fetch diff from GitService and cache it
     *
     * @param {string} filePath - Absolute file path
     * @param {Object} options - Diff options
     * @returns {Promise<Diff[]|null>}
     * @private
     */
    async _fetchDiff(filePath, options = {}) {
        try {
            const diffType = options.staged ? 'staged' : 'unstaged';
            console.log(`[GitDiffService] Fetching ${diffType} diff for: ${filePath}`);

            // Fetch from GitService
            const diffs = await this.gitService.getDiff(filePath, options);

            if (!diffs || diffs.length === 0) {
                console.log(`[GitDiffService] No ${diffType} changes for: ${filePath}`);

                // Cache empty result
                this._updateCache(filePath, diffType, null);
                return null;
            }

            // Cache the result
            this._updateCache(filePath, diffType, diffs);

            console.log(`[GitDiffService] Cached ${diffs.length} ${diffType} diff(s) for: ${filePath}`);

            // Emit event
            EventBus.emit('git-diff:loaded', {
                filePath,
                diffType,
                diffs
            });

            return diffs;
        } catch (error) {
            console.error(`[GitDiffService] Failed to fetch diff for ${filePath}:`, error);
            return null;
        }
    }

    /**
     * Refresh diff for a file (force fetch)
     *
     * @param {string} filePath - Absolute file path
     * @returns {Promise<void>}
     */
    async refreshDiff(filePath) {
        console.log(`[GitDiffService] Refreshing diff for: ${filePath}`);

        // Invalidate cache
        this.invalidateCache(filePath);

        // Fetch both diffs
        await this.getAllDiffs(filePath, { useCache: false });

        EventBus.emit('git-diff:refreshed', { filePath });
    }

    // ============================================
    // DIFF QUERIES
    // ============================================

    /**
     * Get changed lines for a file
     *
     * @param {string} filePath - Absolute file path
     * @param {Object} options - Options
     * @param {boolean} options.staged - Get staged changes
     * @returns {Promise<Object>} { added: [lineNumbers], modified: [lineNumbers], deleted: [lineNumbers] }
     */
    async getChangedLines(filePath, options = {}) {
        const diffs = options.staged
            ? await this.getStagedDiff(filePath, options)
            : await this.getDiff(filePath, options);

        if (!diffs || diffs.length === 0) {
            return { added: [], modified: [], deleted: [] };
        }

        // Use DiffParser to extract changed lines
        const changedLines = DiffParser.getChangedLines(diffs[0]);

        // Categorize changes
        const added = [];
        const modified = [];
        const deleted = [];

        for (const line of changedLines.added) {
            // If there are corresponding deletions nearby, it's a modification
            const hasNearbyDeletion = changedLines.removed.some(
                removedLine => Math.abs(removedLine - line) <= 3
            );

            if (hasNearbyDeletion) {
                modified.push(line);
            } else {
                added.push(line);
            }
        }

        // Deleted lines are shown at the line number where they were removed
        deleted.push(...changedLines.removed);

        return { added, modified, deleted };
    }

    /**
     * Get hunks for a file
     *
     * @param {string} filePath - Absolute file path
     * @param {Object} options - Options
     * @returns {Promise<Hunk[]>}
     */
    async getHunks(filePath, options = {}) {
        const diffs = options.staged
            ? await this.getStagedDiff(filePath, options)
            : await this.getDiff(filePath, options);

        if (!diffs || diffs.length === 0) {
            return [];
        }

        return diffs[0].hunks || [];
    }

    /**
     * Get hunk containing a specific line
     *
     * @param {string} filePath - Absolute file path
     * @param {number} lineNumber - Line number (1-indexed)
     * @param {Object} options - Options
     * @returns {Promise<Hunk|null>}
     */
    async getHunkForLine(filePath, lineNumber, options = {}) {
        const hunks = await this.getHunks(filePath, options);

        return hunks.find(hunk => hunk.containsLine(lineNumber)) || null;
    }

    /**
     * Get diff statistics for a file
     *
     * @param {string} filePath - Absolute file path
     * @param {Object} options - Options
     * @returns {Promise<Object>} { additions, deletions, changes }
     */
    async getDiffStats(filePath, options = {}) {
        const diffs = options.staged
            ? await this.getStagedDiff(filePath, options)
            : await this.getDiff(filePath, options);

        if (!diffs || diffs.length === 0) {
            return { additions: 0, deletions: 0, changes: 0 };
        }

        const stats = diffs[0].getStats();
        return {
            additions: stats.additions,
            deletions: stats.deletions,
            changes: stats.additions + stats.deletions
        };
    }

    // ============================================
    // GUTTER DECORATIONS
    // ============================================

    /**
     * Get gutter decoration data for editor
     *
     * Format suitable for CodeMirror gutter rendering
     *
     * @param {string} filePath - Absolute file path
     * @param {Object} options - Options
     * @param {boolean} options.staged - Show staged changes
     * @param {boolean} options.showBoth - Show both staged and unstaged
     * @returns {Promise<Array<Object>>} Decoration data
     */
    async getGutterDecorations(filePath, options = {}) {
        const decorations = [];

        if (options.showBoth) {
            // Get both staged and unstaged
            const { unstaged, staged } = await this.getAllDiffs(filePath, options);

            // Process unstaged changes
            if (unstaged && unstaged.length > 0) {
                const unstagedDecorations = this._createDecorations(unstaged[0], 'unstaged');
                decorations.push(...unstagedDecorations);
            }

            // Process staged changes
            if (staged && staged.length > 0) {
                const stagedDecorations = this._createDecorations(staged[0], 'staged');
                decorations.push(...stagedDecorations);
            }
        } else {
            // Get single diff type
            const diffs = options.staged
                ? await this.getStagedDiff(filePath, options)
                : await this.getDiff(filePath, options);

            if (diffs && diffs.length > 0) {
                const diffType = options.staged ? 'staged' : 'unstaged';
                const decos = this._createDecorations(diffs[0], diffType);
                decorations.push(...decos);
            }
        }

        return decorations;
    }

    /**
     * Create decoration objects from diff
     *
     * @param {Diff} diff - Diff object
     * @param {string} diffType - 'staged' or 'unstaged'
     * @returns {Array<Object>} Decorations
     * @private
     */
    _createDecorations(diff, diffType) {
        const decorations = [];

        for (const hunk of diff.hunks) {
            let currentLine = hunk.newStart;

            for (const line of hunk.lines) {
                const content = line.substring(1); // Remove +/- prefix
                const changeType = line[0];

                if (changeType === '+') {
                    // Added line
                    decorations.push({
                        line: currentLine,
                        type: 'added',
                        diffType,
                        color: 'green',
                        icon: '+',
                        content,
                        hunk: hunk.header
                    });
                    currentLine++;
                } else if (changeType === '-') {
                    // Deleted line (shown before the next line)
                    decorations.push({
                        line: currentLine,
                        type: 'deleted',
                        diffType,
                        color: 'red',
                        icon: '-',
                        content,
                        hunk: hunk.header
                    });
                    // Don't increment line for deletions
                } else {
                    // Context line
                    currentLine++;
                }
            }
        }

        // Detect modifications (additions near deletions)
        this._markModifications(decorations);

        return decorations;
    }

    /**
     * Mark decorations as modifications if they have nearby additions and deletions
     *
     * @param {Array<Object>} decorations - Decoration array
     * @private
     */
    _markModifications(decorations) {
        const addedLines = new Set(
            decorations.filter(d => d.type === 'added').map(d => d.line)
        );
        const deletedLines = new Set(
            decorations.filter(d => d.type === 'deleted').map(d => d.line)
        );

        for (const decoration of decorations) {
            if (decoration.type === 'added') {
                // Check if there's a deletion within 3 lines
                const hasNearbyDeletion = Array.from(deletedLines).some(
                    deletedLine => Math.abs(deletedLine - decoration.line) <= 3
                );

                if (hasNearbyDeletion) {
                    decoration.type = 'modified';
                    decoration.color = 'yellow';
                    decoration.icon = '~';
                }
            }
        }
    }

    /**
     * Get decoration for a specific line
     *
     * @param {string} filePath - Absolute file path
     * @param {number} lineNumber - Line number (1-indexed)
     * @param {Object} options - Options
     * @returns {Promise<Object|null>} Decoration data or null
     */
    async getDecorationForLine(filePath, lineNumber, options = {}) {
        const decorations = await this.getGutterDecorations(filePath, options);
        return decorations.find(d => d.line === lineNumber) || null;
    }

    // ============================================
    // DIFF STATE MANAGEMENT
    // ============================================

    /**
     * Enable diff tracking for a file
     *
     * @param {string} filePath - Absolute file path
     * @returns {Promise<void>}
     */
    async enableDiff(filePath) {
        if (!this.activeDiffFiles.has(filePath)) {
            this.activeDiffFiles.add(filePath);
            console.log(`[GitDiffService] Diff tracking enabled for: ${filePath}`);

            // Fetch initial diff
            await this.getAllDiffs(filePath, { useCache: false });

            EventBus.emit('git-diff:enabled', { filePath });
        }
    }

    /**
     * Disable diff tracking for a file
     *
     * @param {string} filePath - Absolute file path
     */
    disableDiff(filePath) {
        if (this.activeDiffFiles.has(filePath)) {
            this.activeDiffFiles.delete(filePath);
            console.log(`[GitDiffService] Diff tracking disabled for: ${filePath}`);

            EventBus.emit('git-diff:disabled', { filePath });
        }
    }

    /**
     * Toggle diff tracking for a file
     *
     * @param {string} filePath - Absolute file path
     * @returns {Promise<boolean>} New diff state (true = enabled)
     */
    async toggleDiff(filePath) {
        if (this.activeDiffFiles.has(filePath)) {
            this.disableDiff(filePath);
            return false;
        } else {
            await this.enableDiff(filePath);
            return true;
        }
    }

    /**
     * Check if diff tracking is enabled for a file
     *
     * @param {string} filePath - Absolute file path
     * @returns {boolean}
     */
    isDiffEnabled(filePath) {
        return this.activeDiffFiles.has(filePath);
    }

    /**
     * Check if file has unstaged changes
     *
     * @param {string} filePath - Absolute file path
     * @returns {Promise<boolean>}
     */
    async hasUnstagedChanges(filePath) {
        const diff = await this.getDiff(filePath);
        return diff !== null && diff.length > 0;
    }

    /**
     * Check if file has staged changes
     *
     * @param {string} filePath - Absolute file path
     * @returns {Promise<boolean>}
     */
    async hasStagedChanges(filePath) {
        const diff = await this.getStagedDiff(filePath);
        return diff !== null && diff.length > 0;
    }

    // ============================================
    // CACHE MANAGEMENT
    // ============================================

    /**
     * Get cached diff data if valid
     *
     * @param {string} filePath - Absolute file path
     * @param {string} diffType - 'staged' or 'unstaged'
     * @returns {Diff[]|null}
     * @private
     */
    _getCachedDiff(filePath, diffType) {
        const cached = this.diffCache.get(filePath);
        if (!cached) return null;

        // Check cache timeout
        const age = Date.now() - cached.timestamp;
        if (age > this.cacheTimeout) {
            console.log(`[GitDiffService] Cache expired for ${filePath} (age: ${age}ms)`);
            this.diffCache.delete(filePath);
            return null;
        }

        return cached[diffType] || null;
    }

    /**
     * Update cache with new diff data
     *
     * @param {string} filePath - Absolute file path
     * @param {string} diffType - 'staged' or 'unstaged'
     * @param {Diff[]|null} diffs - Diff data
     * @private
     */
    _updateCache(filePath, diffType, diffs) {
        let cached = this.diffCache.get(filePath);

        if (!cached) {
            cached = {
                unstaged: null,
                staged: null,
                timestamp: Date.now()
            };
            this.diffCache.set(filePath, cached);
        }

        cached[diffType] = diffs;
        cached.timestamp = Date.now();
    }

    /**
     * Invalidate cache for a specific file
     *
     * @param {string} filePath - Absolute file path
     */
    invalidateCache(filePath) {
        if (this.diffCache.has(filePath)) {
            this.diffCache.delete(filePath);
            console.log(`[GitDiffService] Cache invalidated for: ${filePath}`);

            EventBus.emit('git-diff:cache-invalidated', { filePath });
        }
    }

    /**
     * Invalidate all diff cache
     */
    invalidateAllCache() {
        const count = this.diffCache.size;
        this.diffCache.clear();
        console.log(`[GitDiffService] All cache invalidated (${count} entries)`);

        EventBus.emit('git-diff:cache-invalidated', { all: true });
    }

    /**
     * Clear cache entries older than specified age
     *
     * @param {number} maxAge - Maximum age in milliseconds
     */
    clearOldCache(maxAge = this.cacheTimeout) {
        const now = Date.now();
        let cleared = 0;

        for (const [filePath, cached] of this.diffCache.entries()) {
            const age = now - cached.timestamp;
            if (age > maxAge) {
                this.diffCache.delete(filePath);
                cleared++;
            }
        }

        if (cleared > 0) {
            console.log(`[GitDiffService] Cleared ${cleared} old cache entries`);
        }
    }

    /**
     * Get cache statistics
     *
     * @returns {Object} Cache stats
     */
    getCacheStats() {
        const stats = {
            totalEntries: this.diffCache.size,
            activeFiles: this.activeDiffFiles.size,
            entries: []
        };

        for (const [filePath, cached] of this.diffCache.entries()) {
            stats.entries.push({
                filePath,
                hasUnstaged: cached.unstaged !== null,
                hasStaged: cached.staged !== null,
                age: Date.now() - cached.timestamp,
                isActive: this.activeDiffFiles.has(filePath)
            });
        }

        return stats;
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
        console.log(`[GitDiffService] Cache timeout set to: ${timeout}ms`);
    }

    /**
     * Dispose service
     */
    dispose() {
        this.diffCache.clear();
        this.activeDiffFiles.clear();
        console.log('[GitDiffService] Disposed');
    }
}

module.exports = { GitDiffService };

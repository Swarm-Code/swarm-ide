/**
 * GitService - Main Git service coordinator
 *
 * Coordinates all Git operations and integrates sub-services.
 * Manages repository detection, initialization, and provides unified API for UI.
 *
 * Architecture inspired by Zed's GitStore and VS Code's Repository pattern.
 */

const path = require('path');
const { GitRepository } = require('../lib/git/GitRepository');
const EventBus = require('../modules/EventBus');

class GitService {
    constructor() {
        this.repositories = new Map(); // path -> GitRepository
        this.activeRepository = null; // Currently focused repository
        this.workspacePath = null;

        // Service initialization state
        this.initialized = false;

        console.log('[GitService] Initialized');
    }

    /**
     * Initialize Git service for a workspace
     *
     * @param {string} workspacePath - Path to workspace root
     * @returns {Promise<boolean>} Success status
     */
    async initialize(workspacePath) {
        if (this.initialized) {
            console.log('[GitService] Already initialized');
            return true;
        }

        this.workspacePath = workspacePath;

        try {
            // Detect if workspace is a Git repository
            const repository = await this.detectRepository(workspacePath);

            if (repository) {
                this.repositories.set(workspacePath, repository);
                this.activeRepository = repository;

                // Initial repository state load
                await this.loadRepositoryState(repository);

                this.initialized = true;

                EventBus.emit('git:initialized', {
                    path: workspacePath,
                    hasRepository: true
                });

                console.log('[GitService] Initialized for repository:', workspacePath);
                return true;
            } else {
                console.log('[GitService] No Git repository detected at:', workspacePath);
                EventBus.emit('git:initialized', {
                    path: workspacePath,
                    hasRepository: false
                });
                return false;
            }
        } catch (error) {
            console.error('[GitService] Initialization failed:', error);
            return false;
        }
    }

    /**
     * Detect Git repository at path
     *
     * @param {string} repoPath - Path to check
     * @returns {Promise<GitRepository|null>}
     */
    async detectRepository(repoPath) {
        try {
            const repo = new GitRepository(repoPath);

            // Check if git is available
            const isAvailable = await repo.isGitAvailable();
            if (!isAvailable) {
                console.warn('[GitService] Git is not available on system');
                return null;
            }

            // Check if path is a repository
            const isRepo = await repo.isRepository();
            if (!isRepo) {
                console.log('[GitService] Path is not a Git repository:', repoPath);
                return null;
            }

            return repo;
        } catch (error) {
            console.error('[GitService] Repository detection failed:', error);
            return null;
        }
    }

    /**
     * Load initial repository state
     *
     * @param {GitRepository} repository
     * @returns {Promise<void>}
     */
    async loadRepositoryState(repository) {
        try {
            // Load current branch
            const branch = await repository.getCurrentBranch();

            // Load status
            const status = await repository.status();

            // Load branches
            const branches = await repository.getBranches();

            // Emit state loaded event
            EventBus.emit('git:state-loaded', {
                branch,
                status,
                branches
            });

            console.log(`[GitService] State loaded: branch=${branch}, files=${status.files.length}`);
        } catch (error) {
            console.error('[GitService] Failed to load repository state:', error);
        }
    }

    /**
     * Get repository for a file path
     *
     * @param {string} filePath - File path
     * @returns {GitRepository|null}
     */
    getRepositoryForPath(filePath) {
        // For now, return active repository
        // In multi-repo workspaces, this would search for the containing repo
        return this.activeRepository;
    }

    /**
     * Get active repository
     *
     * @returns {GitRepository|null}
     */
    getActiveRepository() {
        return this.activeRepository;
    }

    /**
     * Get repository (alias for getActiveRepository for backward compatibility)
     *
     * @returns {GitRepository|null}
     */
    getRepository() {
        return this.activeRepository;
    }

    // ============================================
    // BLAME OPERATIONS
    // ============================================

    /**
     * Get blame information for a file
     *
     * @param {string} filePath - Absolute file path
     * @param {Object} options - Blame options
     * @returns {Promise<BlameEntry[]|null>}
     */
    async getBlame(filePath, options = {}) {
        const repo = this.getRepositoryForPath(filePath);
        if (!repo) {
            console.warn('[GitService] No repository found for file:', filePath);
            return null;
        }

        try {
            // Convert absolute path to relative
            const relativePath = repo.client.getRelativePath(filePath);

            const blameEntries = await repo.blame(relativePath, options);

            EventBus.emit('git:blame-loaded', {
                filePath,
                entries: blameEntries
            });

            return blameEntries;
        } catch (error) {
            console.error('[GitService] Blame failed:', error);
            return null;
        }
    }

    /**
     * Get blame for a file with streaming
     *
     * @param {string} filePath - Absolute file path
     * @param {Function} onEntry - Callback for each entry
     * @param {Object} options - Blame options
     * @returns {Promise<void>}
     */
    async getBlameStream(filePath, onEntry, options = {}) {
        const repo = this.getRepositoryForPath(filePath);
        if (!repo) return;

        try {
            const relativePath = repo.client.getRelativePath(filePath);
            await repo.blameStream(relativePath, onEntry, options);
        } catch (error) {
            console.error('[GitService] Blame stream failed:', error);
        }
    }

    // ============================================
    // DIFF OPERATIONS
    // ============================================

    /**
     * Get diff for a file
     *
     * @param {string} filePath - Absolute file path (optional)
     * @param {Object} options - Diff options
     * @returns {Promise<Diff[]|null>}
     */
    async getDiff(filePath = null, options = {}) {
        const repo = this.getRepositoryForPath(filePath || this.workspacePath);
        if (!repo) return null;

        try {
            const diffOptions = { ...options };

            if (filePath) {
                diffOptions.path = repo.client.getRelativePath(filePath);
            }

            const diffs = await repo.diff(diffOptions);

            EventBus.emit('git:diff-loaded', {
                filePath,
                diffs
            });

            return diffs;
        } catch (error) {
            console.error('[GitService] Diff failed:', error);
            return null;
        }
    }

    /**
     * Get diff statistics for a file
     *
     * @param {string} filePath - Absolute file path (optional)
     * @param {Object} options - Diff options
     * @returns {Promise<Object[]|null>}
     */
    async getDiffStats(filePath = null, options = {}) {
        const repo = this.getRepositoryForPath(filePath || this.workspacePath);
        if (!repo) return null;

        try {
            const stats = await repo.diffStat(options);
            return stats;
        } catch (error) {
            console.error('[GitService] Diff stats failed:', error);
            return null;
        }
    }

    // ============================================
    // STATUS OPERATIONS
    // ============================================

    /**
     * Get repository status
     *
     * @param {Object} options - Status options
     * @returns {Promise<Object|null>}
     */
    async getStatus(options = {}) {
        if (!this.activeRepository) return null;

        try {
            const status = await this.activeRepository.status(options);

            EventBus.emit('git:status-changed', status);

            return status;
        } catch (error) {
            console.error('[GitService] Status failed:', error);
            return null;
        }
    }

    /**
     * Refresh repository status
     *
     * @returns {Promise<void>}
     */
    async refreshStatus() {
        await this.getStatus({ useCache: false });
    }

    // ============================================
    // BRANCH OPERATIONS
    // ============================================

    /**
     * Get all branches
     *
     * @param {Object} options - Branch options
     * @returns {Promise<Branch[]|null>}
     */
    async getBranches(options = {}) {
        if (!this.activeRepository) return null;

        try {
            const branches = await this.activeRepository.getBranches(options);

            EventBus.emit('git:branches-loaded', branches);

            return branches;
        } catch (error) {
            console.error('[GitService] Get branches failed:', error);
            return null;
        }
    }

    /**
     * Get current branch
     *
     * @returns {Promise<string|null>}
     */
    async getCurrentBranch() {
        if (!this.activeRepository) return null;

        try {
            return await this.activeRepository.getCurrentBranch();
        } catch (error) {
            console.error('[GitService] Get current branch failed:', error);
            return null;
        }
    }

    /**
     * Create a new branch
     *
     * @param {string} branchName - Branch name
     * @param {Object} options - Create options
     * @returns {Promise<boolean>}
     */
    async createBranch(branchName, options = {}) {
        if (!this.activeRepository) return false;

        try {
            await this.activeRepository.createBranch(branchName, options);

            EventBus.emit('git:branch-created', { name: branchName });

            // Refresh state
            await this.refreshStatus();
            await this.getBranches({ useCache: false });

            return true;
        } catch (error) {
            console.error('[GitService] Create branch failed:', error);
            return false;
        }
    }

    /**
     * Checkout a branch
     *
     * @param {string} ref - Branch name or commit
     * @param {Object} options - Checkout options
     * @returns {Promise<boolean>}
     */
    async checkout(ref, options = {}) {
        if (!this.activeRepository) return false;

        try {
            await this.activeRepository.checkout(ref, options);

            EventBus.emit('git:branch-switched', { ref });

            // Refresh state
            await this.refreshStatus();
            await this.getBranches({ useCache: false });

            return true;
        } catch (error) {
            console.error('[GitService] Checkout failed:', error);
            return false;
        }
    }

    // ============================================
    // COMMIT OPERATIONS
    // ============================================

    /**
     * Get commit log
     *
     * @param {Object} options - Log options
     * @returns {Promise<Commit[]|null>}
     */
    async getLog(options = {}) {
        if (!this.activeRepository) return null;

        try {
            const commits = await this.activeRepository.log(options);

            EventBus.emit('git:log-loaded', commits);

            return commits;
        } catch (error) {
            console.error('[GitService] Get log failed:', error);
            return null;
        }
    }

    /**
     * Create a commit
     *
     * @param {string} message - Commit message
     * @param {Object} options - Commit options
     * @returns {Promise<string|null>} Commit SHA
     */
    async commit(message, options = {}) {
        if (!this.activeRepository) return null;

        try {
            const sha = await this.activeRepository.commit(message, options);

            EventBus.emit('git:commit-created', { sha, message });

            // Refresh state
            await this.refreshStatus();

            return sha;
        } catch (error) {
            console.error('[GitService] Commit failed:', error);
            return null;
        }
    }

    // ============================================
    // STAGING OPERATIONS
    // ============================================

    /**
     * Stage files
     *
     * @param {string|string[]} paths - File paths (relative or absolute)
     * @returns {Promise<boolean>}
     */
    async stage(paths) {
        if (!this.activeRepository) return false;

        try {
            // Convert to relative paths if needed
            const relativePaths = Array.isArray(paths) ? paths : [paths];
            const converted = relativePaths.map(p =>
                path.isAbsolute(p) ? this.activeRepository.client.getRelativePath(p) : p
            );

            await this.activeRepository.stage(converted);

            EventBus.emit('git:files-staged', { paths: converted });

            // Refresh status
            await this.refreshStatus();

            return true;
        } catch (error) {
            console.error('[GitService] Stage failed:', error);
            return false;
        }
    }

    /**
     * Unstage files
     *
     * @param {string|string[]} paths - File paths
     * @returns {Promise<boolean>}
     */
    async unstage(paths) {
        if (!this.activeRepository) return false;

        try {
            const relativePaths = Array.isArray(paths) ? paths : [paths];
            const converted = relativePaths.map(p =>
                path.isAbsolute(p) ? this.activeRepository.client.getRelativePath(p) : p
            );

            await this.activeRepository.unstage(converted);

            EventBus.emit('git:files-unstaged', { paths: converted });

            await this.refreshStatus();

            return true;
        } catch (error) {
            console.error('[GitService] Unstage failed:', error);
            return false;
        }
    }

    /**
     * Discard changes
     *
     * @param {string|string[]} paths - File paths
     * @returns {Promise<boolean>}
     */
    async discard(paths) {
        if (!this.activeRepository) return false;

        try {
            const relativePaths = Array.isArray(paths) ? paths : [paths];
            const converted = relativePaths.map(p =>
                path.isAbsolute(p) ? this.activeRepository.client.getRelativePath(p) : p
            );

            await this.activeRepository.discard(converted);

            EventBus.emit('git:changes-discarded', { paths: converted });

            await this.refreshStatus();

            return true;
        } catch (error) {
            console.error('[GitService] Discard failed:', error);
            return false;
        }
    }

    // ============================================
    // REMOTE OPERATIONS
    // ============================================

    /**
     * Push to remote
     *
     * @param {Object} options - Push options
     * @returns {Promise<boolean>}
     */
    async push(options = {}) {
        if (!this.activeRepository) return false;

        try {
            EventBus.emit('git:push-started');

            await this.activeRepository.push(options);

            EventBus.emit('git:push-completed');

            await this.refreshStatus();
            await this.getBranches({ useCache: false });

            return true;
        } catch (error) {
            console.error('[GitService] Push failed:', error);
            EventBus.emit('git:push-failed', { error: error.message });
            return false;
        }
    }

    /**
     * Pull from remote
     *
     * @param {Object} options - Pull options
     * @returns {Promise<boolean>}
     */
    async pull(options = {}) {
        if (!this.activeRepository) return false;

        try {
            EventBus.emit('git:pull-started');

            await this.activeRepository.pull(options);

            EventBus.emit('git:pull-completed');

            await this.refreshStatus();
            await this.getBranches({ useCache: false });

            return true;
        } catch (error) {
            console.error('[GitService] Pull failed:', error);
            EventBus.emit('git:pull-failed', { error: error.message });
            return false;
        }
    }

    /**
     * Fetch from remote
     *
     * @param {Object} options - Fetch options
     * @returns {Promise<boolean>}
     */
    async fetch(options = {}) {
        if (!this.activeRepository) return false;

        try {
            EventBus.emit('git:fetch-started');

            await this.activeRepository.fetch(options);

            EventBus.emit('git:fetch-completed');

            await this.getBranches({ useCache: false });

            return true;
        } catch (error) {
            console.error('[GitService] Fetch failed:', error);
            EventBus.emit('git:fetch-failed', { error: error.message });
            return false;
        }
    }

    /**
     * Dispose service
     */
    dispose() {
        this.repositories.clear();
        this.activeRepository = null;
        this.initialized = false;
        console.log('[GitService] Disposed');
    }
}

// Singleton instance
let instance = null;

module.exports = {
    getInstance() {
        if (!instance) {
            instance = new GitService();
        }
        return instance;
    }
};

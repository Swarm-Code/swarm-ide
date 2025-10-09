/**
 * GitRepository - High-level Git repository abstraction
 *
 * Wraps GitClient and provides convenient methods for common Git operations.
 * Uses parsers to convert raw git output into structured data models.
 */

const { GitClient } = require('./GitClient');
const { BlameParser } = require('./parsers/BlameParser');
const { DiffParser } = require('./parsers/DiffParser');
const { LogParser } = require('./parsers/LogParser');
const { StatusParser } = require('./parsers/StatusParser');
const { BranchParser } = require('./parsers/BranchParser');
const logger = require('../../utils/Logger');

class GitRepository {
    /**
     * Create a GitRepository instance
     *
     * @param {string} repositoryPath - Path to the repository root
     * @param {Object} options - Configuration options
     */
    constructor(repositoryPath, options = {}) {
        this.path = repositoryPath;
        this.client = new GitClient(repositoryPath, options);

        // Cache
        this.cache = {
            branches: null,
            currentBranch: null,
            status: null,
            lastStatusCheck: 0
        };

        logger.debug('gitStatus', `Initialized for: ${repositoryPath}`);
    }

    /**
     * Check if git is available
     * @returns {Promise<boolean>}
     */
    async isGitAvailable() {
        return await this.client.isGitAvailable();
    }

    /**
     * Check if this is a valid repository
     * @returns {Promise<boolean>}
     */
    async isRepository() {
        return await this.client.isRepository();
    }

    /**
     * Get repository root path
     * @returns {Promise<string>}
     */
    async getRoot() {
        return await this.client.getRepositoryRoot();
    }

    // ============================================
    // BLAME OPERATIONS
    // ============================================

    /**
     * Get blame information for a file
     *
     * @param {string} filePath - Relative path to file from repository root
     * @param {Object} options - Blame options
     * @param {string} options.revision - Commit to blame (default: HEAD)
     * @returns {Promise<BlameEntry[]>} Array of blame entries
     */
    async blame(filePath, options = {}) {
        const args = ['blame', '--incremental'];

        if (options.revision) {
            args.push(options.revision);
        }

        args.push('--', filePath);

        const output = await this.client.execute(args);
        return BlameParser.parse(output);
    }

    /**
     * Get blame information with streaming
     *
     * @param {string} filePath - File path
     * @param {Function} onEntry - Callback for each blame entry
     * @param {Object} options - Blame options
     * @returns {Promise<void>}
     */
    async blameStream(filePath, onEntry, options = {}) {
        const args = ['blame', '--incremental'];

        if (options.revision) {
            args.push(options.revision);
        }

        args.push('--', filePath);

        const parser = BlameParser.createStreamParser(onEntry);

        await this.client.executeStream(args, (line) => {
            parser.addLine(line);
        });

        logger.debug('gitStatus', `Blame stream complete for: ${filePath}`, parser.getStats());
    }

    // ============================================
    // DIFF OPERATIONS
    // ============================================

    /**
     * Get diff for a file or the entire repository
     *
     * @param {Object} options - Diff options
     * @param {string} options.path - Specific file path (optional)
     * @param {string} options.revision - Commit to diff against (default: HEAD)
     * @param {boolean} options.staged - Show staged changes only
     * @param {boolean} options.cached - Alias for staged
     * @returns {Promise<Diff[]>} Array of diff objects
     */
    async diff(options = {}) {
        const args = ['diff'];

        if (options.staged || options.cached) {
            args.push('--cached');
        }

        if (options.revision) {
            args.push(options.revision);
        }

        if (options.path) {
            args.push('--', options.path);
        }

        const output = await this.client.execute(args);
        return DiffParser.parse(output);
    }

    /**
     * Get diff statistics
     *
     * @param {Object} options - Diff options
     * @returns {Promise<Object[]>} Array of file statistics
     */
    async diffStat(options = {}) {
        const args = ['diff', '--stat'];

        if (options.staged || options.cached) {
            args.push('--cached');
        }

        if (options.revision) {
            args.push(options.revision);
        }

        const output = await this.client.execute(args);
        return DiffParser.parseStats(output);
    }

    /**
     * Get diff for a specific commit
     *
     * @param {string} commitSha - Commit SHA
     * @returns {Promise<Diff[]>}
     */
    async showCommit(commitSha) {
        const args = ['show', commitSha];
        const output = await this.client.execute(args);
        return DiffParser.parse(output);
    }

    // ============================================
    // LOG / HISTORY OPERATIONS
    // ============================================

    /**
     * Get commit history
     *
     * @param {Object} options - Log options
     * @param {number} options.limit - Maximum number of commits
     * @param {number} options.skip - Number of commits to skip
     * @param {string} options.path - Filter by file path
     * @param {string} options.author - Filter by author
     * @param {string} options.since - Filter by date (e.g., "1 week ago")
     * @param {boolean} options.follow - Follow file history across renames
     * @param {boolean} options.includeRefs - Include branch/tag references
     * @returns {Promise<Commit[]>} Array of commits
     */
    async log(options = {}) {
        const args = ['log', `--format=${LogParser.getFormatString(options)}`];

        if (options.limit) {
            args.push(`-n`, options.limit.toString());
        }

        if (options.skip) {
            args.push(`--skip=${options.skip}`);
        }

        if (options.author) {
            args.push(`--author=${options.author}`);
        }

        if (options.since) {
            args.push(`--since=${options.since}`);
        }

        if (options.follow) {
            args.push('--follow');
        }

        if (options.path) {
            args.push('--', options.path);
        }

        const output = await this.client.execute(args);
        return LogParser.parse(output, options);
    }

    /**
     * Get commit by SHA
     *
     * @param {string} sha - Commit SHA
     * @returns {Promise<Commit>}
     */
    async getCommit(sha) {
        const commits = await this.log({ limit: 1, revision: sha });
        return commits[0] || null;
    }

    // ============================================
    // STATUS OPERATIONS
    // ============================================

    /**
     * Get repository status
     *
     * @param {Object} options - Status options
     * @param {boolean} options.useCache - Use cached status if recent (default: false)
     * @param {number} options.cacheTimeout - Cache timeout in ms (default: 1000)
     * @returns {Promise<Object>} Status object with files and branch info
     */
    async status(options = {}) {
        // Check cache
        if (options.useCache) {
            const cacheTimeout = options.cacheTimeout || 1000;
            const now = Date.now();
            if (this.cache.status && (now - this.cache.lastStatusCheck) < cacheTimeout) {
                return this.cache.status;
            }
        }

        const args = ['status', '--porcelain=v2', '--branch'];
        const output = await this.client.execute(args);
        const status = StatusParser.parseV2(output);

        // Update cache
        this.cache.status = status;
        this.cache.lastStatusCheck = Date.now();
        this.cache.currentBranch = status.branch;

        return status;
    }

    /**
     * Get current branch
     *
     * @param {boolean} useCache - Use cached value if available
     * @returns {Promise<string|null>}
     */
    async getCurrentBranch(useCache = false) {
        if (useCache && this.cache.currentBranch) {
            return this.cache.currentBranch;
        }

        try {
            const output = await this.client.execute(['branch', '--show-current']);
            const branch = output.trim();
            this.cache.currentBranch = branch || null;
            return this.cache.currentBranch;
        } catch (error) {
            return null;
        }
    }

    // ============================================
    // BRANCH OPERATIONS
    // ============================================

    /**
     * Get all branches
     *
     * @param {Object} options - Branch options
     * @param {boolean} options.remote - Include remote branches
     * @param {boolean} options.all - Include both local and remote
     * @param {boolean} options.useCache - Use cached branches
     * @returns {Promise<Branch[]>}
     */
    async getBranches(options = {}) {
        if (options.useCache && this.cache.branches) {
            return this.cache.branches;
        }

        const args = ['branch', `--format=${BranchParser.BRANCH_FORMAT}`];

        if (options.all) {
            args.push('--all');
        } else if (options.remote) {
            args.push('--remotes');
        }

        const currentBranch = await this.getCurrentBranch();
        const output = await this.client.execute(args);
        const branches = BranchParser.parse(output, currentBranch);

        // Cache local branches
        if (!options.remote && !options.all) {
            this.cache.branches = branches;
        }

        return branches;
    }

    /**
     * Create a new branch
     *
     * @param {string} branchName - Name of new branch
     * @param {Object} options - Create options
     * @param {string} options.startPoint - Starting commit (default: HEAD)
     * @param {boolean} options.checkout - Checkout after creating
     * @returns {Promise<void>}
     */
    async createBranch(branchName, options = {}) {
        const args = ['branch', branchName];

        if (options.startPoint) {
            args.push(options.startPoint);
        }

        await this.client.execute(args);

        if (options.checkout) {
            await this.checkout(branchName);
        }

        // Invalidate cache
        this.cache.branches = null;
    }

    /**
     * Delete a branch
     *
     * @param {string} branchName - Name of branch to delete
     * @param {Object} options - Delete options
     * @param {boolean} options.force - Force delete even if not merged
     * @returns {Promise<void>}
     */
    async deleteBranch(branchName, options = {}) {
        const args = ['branch', options.force ? '-D' : '-d', branchName];
        await this.client.execute(args);

        // Invalidate cache
        this.cache.branches = null;
    }

    /**
     * Checkout a branch or commit
     *
     * @param {string} ref - Branch name or commit SHA
     * @param {Object} options - Checkout options
     * @param {boolean} options.createBranch - Create branch if it doesn't exist
     * @returns {Promise<void>}
     */
    async checkout(ref, options = {}) {
        const args = ['checkout'];

        if (options.createBranch) {
            args.push('-b');
        }

        args.push(ref);

        await this.client.execute(args);

        // Invalidate cache
        this.cache.currentBranch = ref;
        this.cache.branches = null;
        this.cache.status = null;
    }

    // ============================================
    // STAGING OPERATIONS
    // ============================================

    /**
     * Stage files
     *
     * @param {string|string[]} paths - File path(s) to stage
     * @returns {Promise<void>}
     */
    async stage(paths) {
        const pathArray = Array.isArray(paths) ? paths : [paths];
        const args = ['add', '--', ...pathArray];
        await this.client.execute(args);

        // Invalidate status cache
        this.cache.status = null;
    }

    /**
     * Unstage files
     *
     * @param {string|string[]} paths - File path(s) to unstage
     * @returns {Promise<void>}
     */
    async unstage(paths) {
        const pathArray = Array.isArray(paths) ? paths : [paths];
        const args = ['reset', 'HEAD', '--', ...pathArray];
        await this.client.execute(args);

        // Invalidate status cache
        this.cache.status = null;
    }

    /**
     * Discard changes in working directory
     *
     * @param {string|string[]} paths - File path(s) to discard
     * @returns {Promise<void>}
     */
    async discard(paths) {
        const pathArray = Array.isArray(paths) ? paths : [paths];
        const args = ['checkout', '--', ...pathArray];
        await this.client.execute(args);

        // Invalidate status cache
        this.cache.status = null;
    }

    // ============================================
    // COMMIT OPERATIONS
    // ============================================

    /**
     * Create a commit
     *
     * @param {string} message - Commit message
     * @param {Object} options - Commit options
     * @param {boolean} options.all - Stage all modified files
     * @param {boolean} options.amend - Amend previous commit
     * @returns {Promise<string>} Commit SHA
     */
    async commit(message, options = {}) {
        const args = ['commit', '-m', message];

        if (options.all) {
            args.push('-a');
        }

        if (options.amend) {
            args.push('--amend');
        }

        await this.client.execute(args);

        // Get the commit SHA
        const sha = await this.client.execute(['rev-parse', 'HEAD']);

        // Invalidate cache
        this.cache.status = null;

        return sha.trim();
    }

    // ============================================
    // REMOTE OPERATIONS
    // ============================================

    /**
     * Push to remote
     *
     * @param {Object} options - Push options
     * @param {string} options.remote - Remote name (default: origin)
     * @param {string} options.branch - Branch to push (default: current)
     * @param {boolean} options.setUpstream - Set upstream tracking
     * @param {boolean} options.force - Force push
     * @returns {Promise<void>}
     */
    async push(options = {}) {
        const args = ['push'];

        if (options.setUpstream) {
            args.push('--set-upstream');
        }

        if (options.force) {
            args.push('--force');
        }

        const remote = options.remote || 'origin';
        args.push(remote);

        if (options.branch) {
            args.push(options.branch);
        }

        await this.client.execute(args);
    }

    /**
     * Pull from remote
     *
     * @param {Object} options - Pull options
     * @param {string} options.remote - Remote name (default: origin)
     * @param {string} options.branch - Branch to pull
     * @returns {Promise<void>}
     */
    async pull(options = {}) {
        const args = ['pull'];

        const remote = options.remote || 'origin';
        args.push(remote);

        if (options.branch) {
            args.push(options.branch);
        }

        await this.client.execute(args);

        // Invalidate cache
        this.cache.status = null;
        this.cache.branches = null;
    }

    /**
     * Fetch from remote
     *
     * @param {Object} options - Fetch options
     * @param {string} options.remote - Remote name (default: origin)
     * @returns {Promise<void>}
     */
    async fetch(options = {}) {
        const args = ['fetch'];

        const remote = options.remote || 'origin';
        args.push(remote);

        await this.client.execute(args);

        // Invalidate branch cache
        this.cache.branches = null;
    }

    // ============================================
    // UTILITY METHODS
    // ============================================

    /**
     * Clear all caches
     */
    clearCache() {
        this.cache = {
            branches: null,
            currentBranch: null,
            status: null,
            lastStatusCheck: 0
        };
    }
}

module.exports = { GitRepository };

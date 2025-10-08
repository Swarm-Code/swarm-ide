/**
 * GitClient - Core Git command execution client
 *
 * This class handles all low-level git command execution via IPC to the main process,
 * managing I/O streams, handling errors, and providing a clean async API.
 *
 * Features:
 * - Executes git processes via IPC (main process has child_process access)
 * - Handles stdout/stderr streams with encoding
 * - Implements timeout protection for long-running commands
 * - Provides detailed error messages with git stderr output
 * - Supports custom working directories per command
 * - Validates git availability on initialization
 */

const path = require('path');
const fs = require('fs').promises;

class GitClient {
    /**
     * Create a new GitClient
     * @param {string} repositoryPath - Path to the git repository root
     * @param {Object} options - Configuration options
     * @param {number} options.timeout - Default timeout in milliseconds (default: 30000)
     * @param {string} options.encoding - Output encoding (default: 'utf8')
     */
    constructor(repositoryPath, options = {}) {
        this.repositoryPath = repositoryPath;
        this.timeout = options.timeout || 30000;
        this.encoding = options.encoding || 'utf8';
        this.gitPath = options.gitPath || 'git'; // Allow custom git binary path

        console.log(`[GitClient] Initialized for repository: ${repositoryPath}`);
    }

    /**
     * Check if git is available on the system
     * @returns {Promise<boolean>} True if git is available
     */
    async isGitAvailable() {
        try {
            const result = await this.execute(['--version'], { cwd: process.cwd() });
            console.log(`[GitClient] Git version: ${result.trim()}`);
            return true;
        } catch (error) {
            console.error('[GitClient] Git is not available:', error.message);
            return false;
        }
    }

    /**
     * Check if the repository path is a valid git repository
     * @returns {Promise<boolean>} True if path is a git repository
     */
    async isRepository() {
        try {
            await this.execute(['rev-parse', '--git-dir']);
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * Get the root directory of the git repository
     * @returns {Promise<string>} Absolute path to repository root
     */
    async getRepositoryRoot() {
        try {
            const result = await this.execute(['rev-parse', '--show-toplevel']);
            return result.trim();
        } catch (error) {
            throw new Error(`Not a git repository: ${this.repositoryPath}`);
        }
    }

    /**
     * Execute a git command
     *
     * @param {string[]} args - Git command arguments (e.g., ['status', '--porcelain'])
     * @param {Object} options - Execution options
     * @param {string} options.cwd - Working directory (defaults to repositoryPath)
     * @param {number} options.timeout - Command timeout in ms (defaults to this.timeout)
     * @param {string} options.input - Stdin input for the command
     * @param {string} options.encoding - Output encoding (defaults to this.encoding)
     * @param {boolean} options.raw - Return raw buffer instead of string (default: false)
     * @returns {Promise<string>} Command stdout output
     * @throws {GitError} If command fails or times out
     */
    async execute(args, options = {}) {
        const cwd = options.cwd || this.repositoryPath;
        const timeout = options.timeout || this.timeout;
        const encoding = options.encoding || this.encoding;
        const input = options.input;
        const raw = options.raw || false;

        console.log(`[GitClient] Executing: git ${args.join(' ')} (cwd: ${cwd})`);

        try {
            // Execute git command via IPC to main process
            const result = await window.electronAPI.gitExecute(this.gitPath, args, {
                cwd,
                timeout,
                encoding,
                input
            });

            if (!result.success) {
                // Determine error type
                let errorType = 'EXIT_CODE';
                if (result.error && result.error.includes('timed out')) {
                    errorType = 'TIMEOUT';
                } else if (result.error && result.error.includes('spawn')) {
                    errorType = 'SPAWN_ERROR';
                }

                throw new GitError(
                    result.error || 'Git command failed',
                    args,
                    result.exitCode || null,
                    result.stderr || '',
                    errorType
                );
            }

            // Success
            const output = raw ? Buffer.from(result.stdout, encoding) : result.stdout;
            console.log(`[GitClient] Command completed successfully (${output.length} bytes)`);
            return output;

        } catch (error) {
            // Re-throw GitError as-is
            if (error instanceof GitError) {
                throw error;
            }

            // Wrap other errors
            throw new GitError(
                `Git execution error: ${error.message}`,
                args,
                null,
                '',
                'SPAWN_ERROR',
                error
            );
        }
    }

    /**
     * Execute a git command and stream output line by line
     *
     * @param {string[]} args - Git command arguments
     * @param {Function} onLine - Callback for each line of output: (line: string) => void
     * @param {Object} options - Execution options (same as execute())
     * @returns {Promise<void>} Resolves when command completes
     */
    async executeStream(args, onLine, options = {}) {
        const cwd = options.cwd || this.repositoryPath;
        const timeout = options.timeout || this.timeout;
        const encoding = options.encoding || this.encoding;

        console.log(`[GitClient] Executing (stream): git ${args.join(' ')} (cwd: ${cwd})`);

        try {
            // Execute git command via IPC
            const result = await window.electronAPI.gitExecute(this.gitPath, args, {
                cwd,
                timeout,
                encoding
            });

            if (!result.success) {
                // Determine error type
                let errorType = 'EXIT_CODE';
                if (result.error && result.error.includes('timed out')) {
                    errorType = 'TIMEOUT';
                } else if (result.error && result.error.includes('spawn')) {
                    errorType = 'SPAWN_ERROR';
                }

                throw new GitError(
                    result.error || 'Git command failed',
                    args,
                    result.exitCode || null,
                    result.stderr || '',
                    errorType
                );
            }

            // Simulate streaming by splitting output into lines and calling onLine
            const lines = result.stdout.split('\n');
            lines.forEach(line => {
                if (line) {
                    onLine(line);
                }
            });

            console.log('[GitClient] Stream command completed successfully');

        } catch (error) {
            // Re-throw GitError as-is
            if (error instanceof GitError) {
                throw error;
            }

            // Wrap other errors
            throw new GitError(
                `Git execution error: ${error.message}`,
                args,
                null,
                '',
                'SPAWN_ERROR',
                error
            );
        }
    }

    /**
     * Check if a file exists in the repository
     * @param {string} filePath - Relative path from repository root
     * @returns {Promise<boolean>} True if file exists
     */
    async fileExists(filePath) {
        try {
            const fullPath = path.join(this.repositoryPath, filePath);
            await fs.access(fullPath);
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * Resolve a path relative to the repository root
     * @param {string} relativePath - Relative path
     * @returns {string} Absolute path
     */
    resolvePath(relativePath) {
        return path.resolve(this.repositoryPath, relativePath);
    }

    /**
     * Get a relative path from repository root
     * @param {string} absolutePath - Absolute path
     * @returns {string} Relative path
     */
    getRelativePath(absolutePath) {
        return path.relative(this.repositoryPath, absolutePath);
    }
}

/**
 * Custom error class for Git operations
 */
class GitError extends Error {
    /**
     * @param {string} message - Error message
     * @param {string[]} args - Git command arguments
     * @param {number|null} exitCode - Process exit code
     * @param {string} stderr - Git stderr output
     * @param {string} errorType - Error type (TIMEOUT, EXIT_CODE, SPAWN_ERROR)
     * @param {Error} originalError - Original error if any
     */
    constructor(message, args, exitCode, stderr, errorType, originalError = null) {
        super(message);
        this.name = 'GitError';
        this.command = args.join(' ');
        this.args = args;
        this.exitCode = exitCode;
        this.stderr = stderr;
        this.errorType = errorType;
        this.originalError = originalError;

        // Include stderr in message if available
        if (stderr && stderr.trim()) {
            this.message += `\nGit output: ${stderr.trim()}`;
        }
    }

    /**
     * Check if error is due to timeout
     * @returns {boolean}
     */
    isTimeout() {
        return this.errorType === 'TIMEOUT';
    }

    /**
     * Check if error is due to git not being available
     * @returns {boolean}
     */
    isSpawnError() {
        return this.errorType === 'SPAWN_ERROR';
    }

    /**
     * Get a user-friendly error message
     * @returns {string}
     */
    getUserMessage() {
        switch (this.errorType) {
            case 'TIMEOUT':
                return `Git operation timed out. The command took too long to complete.`;
            case 'SPAWN_ERROR':
                return `Git is not available. Please ensure git is installed and in your PATH.`;
            case 'EXIT_CODE':
                return this.stderr ? this.stderr.trim() : `Git command failed: ${this.command}`;
            default:
                return this.message;
        }
    }
}

module.exports = { GitClient, GitError };

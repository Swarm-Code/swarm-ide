/**
 * FileSystemService - Encapsulates all file system operations
 *
 * Provides a clean API for file operations that communicates with the main
 * process through IPC. This service acts as a bridge between the renderer
 * process and Node.js file system APIs.
 *
 * Usage:
 *   await fileSystemService.readDirectory('/path/to/dir');
 *   await fileSystemService.readFile('/path/to/file.txt');
 */

const eventBus = require('../modules/EventBus');

class FileSystemService {
    constructor() {
        this.api = null;
        this.cache = new Map();
        this.cacheEnabled = false;
    }

    /**
     * Initialize the service with the Electron API
     * @param {Object} electronAPI - The API exposed via preload script
     */
    initialize(electronAPI) {
        this.api = electronAPI;
        this.setupFileWatcherListener();
        eventBus.emit('fs:initialized');
    }

    /**
     * Read contents of a directory
     * @param {string} dirPath - Directory path
     * @param {boolean} useCache - Whether to use cached results
     * @returns {Promise<Array>} List of directory entries
     */
    async readDirectory(dirPath, useCache = false) {
        try {
            // Check cache first if enabled
            if (useCache && this.cache.has(dirPath)) {
                return this.cache.get(dirPath);
            }

            const result = await this.api.readDirectory(dirPath);

            // Handle IPC response format {success, entries, error}
            if (!result.success) {
                console.error('[FileSystemService] Failed to read directory:', result.error);
                return [];
            }

            const entries = result.entries || [];

            // Sort: directories first, then files, alphabetically
            const sorted = entries.sort((a, b) => {
                if (a.isDirectory && !b.isDirectory) return -1;
                if (!a.isDirectory && b.isDirectory) return 1;
                return a.name.localeCompare(b.name);
            });

            // Cache the result
            if (this.cacheEnabled) {
                this.cache.set(dirPath, sorted);
            }

            eventBus.emit('fs:directory-read', { path: dirPath, entries: sorted });

            return sorted;
        } catch (error) {
            console.error('[FileSystemService] Error reading directory:', error);
            eventBus.emit('fs:error', { operation: 'readDirectory', path: dirPath, error: error.message });
            return [];
        }
    }

    /**
     * Read contents of a file
     * @param {string} filePath - File path
     * @returns {Promise<Object>} Object with success status and content
     */
    async readFile(filePath) {
        try {
            const result = await this.api.readFile(filePath);

            if (result.success) {
                eventBus.emit('fs:file-read', { path: filePath, size: result.content.length });
            } else {
                eventBus.emit('fs:error', { operation: 'readFile', path: filePath, error: result.error });
            }

            return result;
        } catch (error) {
            console.error('[FileSystemService] Error reading file:', error);
            eventBus.emit('fs:error', { operation: 'readFile', path: filePath, error: error.message });
            return { success: false, error: error.message };
        }
    }

    /**
     * Get user's home directory
     * @returns {Promise<string>} Home directory path
     */
    async getHomeDirectory() {
        try {
            const homePath = await this.api.getHomeDir();
            return homePath;
        } catch (error) {
            console.error('[FileSystemService] Error getting home directory:', error);
            return null;
        }
    }

    /**
     * Open folder selection dialog
     * @returns {Promise<Object>} Selected folder result {canceled, path}
     */
    async selectFolder() {
        try {
            const result = await this.api.selectFolder();
            return result;
        } catch (error) {
            console.error('[FileSystemService] Error selecting folder:', error);
            return { canceled: true };
        }
    }

    /**
     * Check if a path is a directory
     * @param {string} path - Path to check
     * @returns {boolean}
     */
    isDirectory(path) {
        // This is a simple check based on cached data or file extension
        // For more accurate checks, we'd need to add an IPC handler
        return !this.hasFileExtension(path);
    }

    /**
     * Check if a path has a file extension
     * @param {string} path - Path to check
     * @returns {boolean}
     */
    hasFileExtension(path) {
        const parts = path.split('/');
        const fileName = parts[parts.length - 1];
        return fileName.includes('.');
    }

    /**
     * Get file extension
     * @param {string} filePath - File path
     * @returns {string} File extension (without dot)
     */
    getFileExtension(filePath) {
        const parts = filePath.split('.');
        return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
    }

    /**
     * Get file name from path
     * @param {string} filePath - File path
     * @returns {string} File name
     */
    getFileName(filePath) {
        const parts = filePath.split('/');
        return parts[parts.length - 1];
    }

    /**
     * Get parent directory path
     * @param {string} filePath - File path
     * @returns {string} Parent directory path
     */
    getParentPath(filePath) {
        const parts = filePath.split('/');
        parts.pop();
        return parts.join('/');
    }

    /**
     * Join path segments
     * @param {...string} segments - Path segments
     * @returns {string} Joined path
     */
    joinPath(...segments) {
        return segments.join('/').replace(/\/+/g, '/');
    }

    /**
     * Clear the cache
     */
    clearCache() {
        this.cache.clear();
        eventBus.emit('fs:cache-cleared');
    }

    /**
     * Enable or disable caching
     * @param {boolean} enabled - Whether caching should be enabled
     */
    setCacheEnabled(enabled) {
        this.cacheEnabled = enabled;
        if (!enabled) {
            this.clearCache();
        }
    }

    /**
     * Get cache statistics
     * @returns {Object} Cache statistics
     */
    getCacheStats() {
        return {
            size: this.cache.size,
            enabled: this.cacheEnabled,
            keys: Array.from(this.cache.keys())
        };
    }

    /**
     * Create a new file
     * @param {string} filePath - Path where file should be created
     * @returns {Promise<Object>} Result {success, error}
     */
    async createFile(filePath) {
        try {
            const result = await this.api.createFile(filePath);
            if (result.success) {
                eventBus.emit('fs:file-created', { path: filePath });
                this.clearCache(); // Clear cache to refresh directory listings
            } else {
                eventBus.emit('fs:error', { operation: 'createFile', path: filePath, error: result.error });
            }
            return result;
        } catch (error) {
            console.error('[FileSystemService] Error creating file:', error);
            eventBus.emit('fs:error', { operation: 'createFile', path: filePath, error: error.message });
            return { success: false, error: error.message };
        }
    }

    /**
     * Create a new folder
     * @param {string} folderPath - Path where folder should be created
     * @returns {Promise<Object>} Result {success, error}
     */
    async createFolder(folderPath) {
        try {
            const result = await this.api.createFolder(folderPath);
            if (result.success) {
                eventBus.emit('fs:folder-created', { path: folderPath });
                this.clearCache();
            } else {
                eventBus.emit('fs:error', { operation: 'createFolder', path: folderPath, error: result.error });
            }
            return result;
        } catch (error) {
            console.error('[FileSystemService] Error creating folder:', error);
            eventBus.emit('fs:error', { operation: 'createFolder', path: folderPath, error: error.message });
            return { success: false, error: error.message };
        }
    }

    /**
     * Rename file or folder
     * @param {string} oldPath - Current path
     * @param {string} newPath - New path
     * @returns {Promise<Object>} Result {success, error}
     */
    async renameItem(oldPath, newPath) {
        try {
            const result = await this.api.renameItem(oldPath, newPath);
            if (result.success) {
                eventBus.emit('fs:item-renamed', { oldPath, newPath });
                this.clearCache();
            } else {
                eventBus.emit('fs:error', { operation: 'renameItem', paths: [oldPath, newPath], error: result.error });
            }
            return result;
        } catch (error) {
            console.error('[FileSystemService] Error renaming item:', error);
            eventBus.emit('fs:error', { operation: 'renameItem', paths: [oldPath, newPath], error: error.message });
            return { success: false, error: error.message };
        }
    }

    /**
     * Delete file or folder
     * @param {string} itemPath - Path to item to delete
     * @returns {Promise<Object>} Result {success, error}
     */
    async deleteItem(itemPath) {
        try {
            const result = await this.api.deleteItem(itemPath);
            if (result.success) {
                eventBus.emit('fs:item-deleted', { path: itemPath });
                this.clearCache();
            } else {
                eventBus.emit('fs:error', { operation: 'deleteItem', path: itemPath, error: result.error });
            }
            return result;
        } catch (error) {
            console.error('[FileSystemService] Error deleting item:', error);
            eventBus.emit('fs:error', { operation: 'deleteItem', path: itemPath, error: error.message });
            return { success: false, error: error.message };
        }
    }

    /**
     * Check if a path exists
     * @param {string} itemPath - Path to check
     * @returns {Promise<boolean>} True if exists
     */
    async pathExists(itemPath) {
        try {
            const result = await this.api.checkPathExists(itemPath);
            return result.exists;
        } catch (error) {
            console.error('[FileSystemService] Error checking path:', error);
            return false;
        }
    }

    /**
     * Copy file or directory recursively
     * @param {string} sourcePath - Source path
     * @param {string} destPath - Destination path
     * @returns {Promise<Object>} Result {success, error}
     */
    async copyItemRecursive(sourcePath, destPath) {
        try {
            const result = await this.api.copyItemRecursive(sourcePath, destPath);
            if (result.success) {
                eventBus.emit('fs:item-copied', { sourcePath, destPath });
                this.clearCache();
            } else {
                eventBus.emit('fs:error', { operation: 'copyItemRecursive', paths: [sourcePath, destPath], error: result.error });
            }
            return result;
        } catch (error) {
            console.error('[FileSystemService] Error copying item:', error);
            eventBus.emit('fs:error', { operation: 'copyItemRecursive', paths: [sourcePath, destPath], error: error.message });
            return { success: false, error: error.message };
        }
    }

    /**
     * Reveal item in system file explorer
     * @param {string} itemPath - Path to reveal
     * @returns {Promise<Object>} Result {success, error}
     */
    async revealInExplorer(itemPath) {
        try {
            const result = await this.api.revealInExplorer(itemPath);
            return result;
        } catch (error) {
            console.error('[FileSystemService] Error revealing in explorer:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Write text to system clipboard
     * @param {string} text - Text to write
     * @returns {Promise<Object>} Result {success, error}
     */
    async writeToClipboard(text) {
        try {
            const result = await this.api.writeToClipboard(text);
            return result;
        } catch (error) {
            console.error('[FileSystemService] Error writing to clipboard:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Search for text in files
     * @param {string} dirPath - Directory to search in
     * @param {string} query - Search query
     * @param {Object} options - Search options {caseSensitive, regex, maxResults}
     * @returns {Promise<Object>} Result {success, matches, error}
     */
    async searchInFiles(dirPath, query, options = {}) {
        try {
            const result = await this.api.searchInFiles(dirPath, query, options);
            return result;
        } catch (error) {
            console.error('[FileSystemService] Error searching in files:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Replace text in multiple files
     * @param {string} searchPattern - Search pattern (literal string or regex)
     * @param {string} replaceText - Replacement text (supports $1, $2 for regex capture groups)
     * @param {string[]} filePaths - Array of file paths to replace in
     * @param {Object} options - Options {regex, caseSensitive}
     * @returns {Promise<Object>} Result {success, filesModified, totalMatches, results, error}
     */
    async replaceInFiles(searchPattern, replaceText, filePaths, options = {}) {
        try {
            console.log('[FileSystemService] Replace in files:', {
                pattern: searchPattern,
                replacement: replaceText,
                fileCount: filePaths.length,
                options
            });

            const result = await this.api.replaceInFiles(searchPattern, replaceText, filePaths, options);

            if (result.success && result.filesModified > 0) {
                // Emit events for modified files
                result.results.forEach(fileResult => {
                    if (fileResult.modified) {
                        eventBus.emit('fs:file-modified', { path: fileResult.file });
                    }
                });

                // Clear cache to ensure fresh reads
                this.clearCache();

                console.log('[FileSystemService] ✓ Replacement completed:', {
                    filesModified: result.filesModified,
                    totalMatches: result.totalMatches
                });
            } else if (!result.success) {
                eventBus.emit('fs:error', {
                    operation: 'replaceInFiles',
                    error: result.error
                });
            }

            return result;
        } catch (error) {
            console.error('[FileSystemService] Error replacing in files:', error);
            eventBus.emit('fs:error', {
                operation: 'replaceInFiles',
                error: error.message
            });
            return { success: false, error: error.message, filesModified: 0, totalMatches: 0 };
        }
    }

    /**
     * Watch a directory for file system changes
     * @param {string} dirPath - Directory to watch
     * @returns {Promise<Object>} Watch result
     */
    async watchDirectory(dirPath) {
        try {
            const result = await this.api.watchDirectory(dirPath);
            if (result.success) {
                console.log('[FileSystemService] Watching directory:', dirPath);
                eventBus.emit('fs:watch-started', { path: dirPath });
            }
            return result;
        } catch (error) {
            console.error('[FileSystemService] Error watching directory:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Stop watching a directory
     * @param {string} dirPath - Directory to stop watching
     * @returns {Promise<Object>} Unwatch result
     */
    async unwatchDirectory(dirPath) {
        try {
            const result = await this.api.unwatchDirectory(dirPath);
            if (result.success) {
                console.log('[FileSystemService] Stopped watching directory:', dirPath);
                eventBus.emit('fs:watch-stopped', { path: dirPath });
            }
            return result;
        } catch (error) {
            console.error('[FileSystemService] Error unwatching directory:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Register callback for file watcher events
     * This should be called once during initialization
     */
    setupFileWatcherListener() {
        if (!this.api || !this.api.onFileWatcherEvent) {
            console.warn('[FileSystemService] File watcher API not available');
            return;
        }

        this.api.onFileWatcherEvent((rootPath, events) => {
            console.log('[FileSystemService] File watcher events received:', events.length, 'changes in', rootPath);
            eventBus.emit('fs:file-changes', { rootPath, events });
        });

        console.log('[FileSystemService] File watcher listener setup complete');
    }
}

// Export singleton instance
const fileSystemService = new FileSystemService();
module.exports = fileSystemService;

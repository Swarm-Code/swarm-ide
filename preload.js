const { contextBridge, ipcRenderer } = require('electron');

/**
 * Preload script - Securely exposes IPC API to renderer process
 *
 * Following Electron security best practices:
 * - contextIsolation enabled
 * - nodeIntegration disabled
 * - Secure API exposure via contextBridge
 */

// Expose protected API to renderer process
contextBridge.exposeInMainWorld('electronAPI', {
    /**
     * Read directory contents
     * @param {string} dirPath - Directory path
     * @returns {Promise<Array>} Directory entries
     */
    readDirectory: (dirPath) => {
        return ipcRenderer.invoke('read-directory', dirPath);
    },

    /**
     * Read file contents
     * @param {string} filePath - File path
     * @returns {Promise<Object>} File read result
     */
    readFile: (filePath) => {
        return ipcRenderer.invoke('read-file', filePath);
    },

    /**
     * Get user's home directory
     * @returns {Promise<string>} Home directory path
     */
    getHomeDir: () => {
        return ipcRenderer.invoke('get-home-dir');
    },

    /**
     * Get initial folder from command line args
     * @returns {Promise<string|null>} Initial folder path or null
     */
    getInitialFolder: () => {
        return ipcRenderer.invoke('get-initial-folder');
    },

    /**
     * Open folder selection dialog
     * @returns {Promise<Object>} Selected folder result
     */
    selectFolder: () => {
        return ipcRenderer.invoke('select-folder');
    },

    /**
     * Get crash logs list
     * @returns {Promise<Array>} List of crash logs
     */
    getCrashLogs: () => {
        return ipcRenderer.invoke('get-crash-logs');
    },

    /**
     * Read a specific crash log file
     * @param {string} filename - Crash log filename
     * @returns {Promise<string>} Crash log content
     */
    readCrashLog: (filename) => {
        return ipcRenderer.invoke('read-crash-log', filename);
    },

    /**
     * Get crash logs directory path
     * @returns {Promise<string>} Directory path
     */
    getCrashLogsDirectory: () => {
        return ipcRenderer.invoke('get-crash-logs-directory');
    },

    /**
     * Log a renderer error to crash logs
     * @param {Object} errorInfo - Error information
     * @returns {Promise<string>} Path to log file
     */
    logRendererError: (errorInfo) => {
        return ipcRenderer.invoke('log-renderer-error', errorInfo);
    },

    /**
     * List tables in SQLite database
     * @param {string} dbPath - Database file path
     * @returns {Promise<Object>} Tables list result
     */
    sqliteListTables: (dbPath) => {
        return ipcRenderer.invoke('sqlite-list-tables', dbPath);
    },

    /**
     * Get table schema
     * @param {string} dbPath - Database file path
     * @param {string} tableName - Table name
     * @returns {Promise<Object>} Schema result
     */
    sqliteGetSchema: (dbPath, tableName) => {
        return ipcRenderer.invoke('sqlite-get-schema', dbPath, tableName);
    },

    /**
     * Query table data with pagination
     * @param {string} dbPath - Database file path
     * @param {string} tableName - Table name
     * @param {number} limit - Number of rows to return
     * @param {number} offset - Offset for pagination
     * @returns {Promise<Object>} Query result with data and total count
     */
    sqliteQueryTable: (dbPath, tableName, limit, offset) => {
        return ipcRenderer.invoke('sqlite-query-table', dbPath, tableName, limit, offset);
    },

    /**
     * Execute custom SQL query
     * @param {string} dbPath - Database file path
     * @param {string} query - SQL query to execute
     * @returns {Promise<Object>} Query result
     */
    sqliteExecuteQuery: (dbPath, query) => {
        return ipcRenderer.invoke('sqlite-execute-query', dbPath, query);
    },

    /**
     * Get video file metadata
     * @param {string} videoPath - Video file path
     * @returns {Promise<Object>} Metadata result with duration, resolution, codec, etc.
     */
    videoGetMetadata: (videoPath) => {
        return ipcRenderer.invoke('video-get-metadata', videoPath);
    },

    /**
     * Generate thumbnail from video
     * @param {string} videoPath - Video file path
     * @param {number} timestamp - Timestamp in seconds (default: 1)
     * @returns {Promise<Object>} Thumbnail generation result with path
     */
    videoGenerateThumbnail: (videoPath, timestamp = 1) => {
        return ipcRenderer.invoke('video-generate-thumbnail', videoPath, timestamp);
    },

    /**
     * Generate multiple thumbnails for seek bar
     * @param {string} videoPath - Video file path
     * @param {number} count - Number of thumbnails to generate (default: 10)
     * @returns {Promise<Object>} Array of thumbnail paths
     */
    videoGenerateSeekThumbnails: (videoPath, count = 10) => {
        return ipcRenderer.invoke('video-generate-seek-thumbnails', videoPath, count);
    },

    /**
     * Get safe file:// URL for video playback
     * @param {string} videoPath - Video file path
     * @returns {Promise<Object>} File URL result
     */
    videoGetFilePath: (videoPath) => {
        return ipcRenderer.invoke('video-get-file-path', videoPath);
    },

    /**
     * Clear video cache (thumbnails and metadata)
     * @returns {Promise<Object>} Clear cache result
     */
    videoClearCache: () => {
        return ipcRenderer.invoke('video-clear-cache');
    },

    /**
     * Create a new file
     * @param {string} filePath - Path where file should be created
     * @returns {Promise<Object>} Creation result
     */
    createFile: (filePath) => {
        return ipcRenderer.invoke('create-file', filePath);
    },

    /**
     * Create a new folder
     * @param {string} folderPath - Path where folder should be created
     * @returns {Promise<Object>} Creation result
     */
    createFolder: (folderPath) => {
        return ipcRenderer.invoke('create-folder', folderPath);
    },

    /**
     * Rename file or folder
     * @param {string} oldPath - Current path
     * @param {string} newPath - New path
     * @returns {Promise<Object>} Rename result
     */
    renameItem: (oldPath, newPath) => {
        return ipcRenderer.invoke('rename-item', oldPath, newPath);
    },

    /**
     * Delete file or folder
     * @param {string} itemPath - Path to item to delete
     * @returns {Promise<Object>} Delete result
     */
    deleteItem: (itemPath) => {
        return ipcRenderer.invoke('delete-item', itemPath);
    },

    /**
     * Check if path exists
     * @param {string} itemPath - Path to check
     * @returns {Promise<Object>} Exists result
     */
    checkPathExists: (itemPath) => {
        return ipcRenderer.invoke('check-path-exists', itemPath);
    },

    /**
     * Save file content
     * @param {string} filePath - File path to save to
     * @param {string} content - File content to save
     * @returns {Promise<Object>} Save result
     */
    saveFile: (filePath, content) => {
        return ipcRenderer.invoke('save-file', filePath, content);
    },

    /**
     * Replace text in multiple files
     * @param {string} searchPattern - Search pattern (literal string or regex)
     * @param {string} replaceText - Replacement text (supports $1, $2 for regex capture groups)
     * @param {string[]} filePaths - Array of file paths to replace in
     * @param {Object} options - Options { regex: boolean, caseSensitive: boolean }
     * @returns {Promise<Object>} Replacement result { success, filesModified, totalMatches, results }
     */
    replaceInFiles: (searchPattern, replaceText, filePaths, options) => {
        return ipcRenderer.invoke('replace-in-files', searchPattern, replaceText, filePaths, options);
    },

    /**
     * Copy file or directory recursively
     * @param {string} sourcePath - Source path
     * @param {string} destPath - Destination path
     * @returns {Promise<Object>} Copy result
     */
    copyItemRecursive: (sourcePath, destPath) => {
        return ipcRenderer.invoke('copy-item-recursive', sourcePath, destPath);
    },

    /**
     * Reveal item in system file explorer
     * @param {string} itemPath - Path to reveal
     * @returns {Promise<Object>} Result
     */
    revealInExplorer: (itemPath) => {
        return ipcRenderer.invoke('reveal-in-explorer', itemPath);
    },

    /**
     * Write text to system clipboard
     * @param {string} text - Text to write
     * @returns {Promise<Object>} Result
     */
    writeToClipboard: (text) => {
        return ipcRenderer.invoke('write-to-clipboard', text);
    },

    /**
     * Search for text in files
     * @param {string} dirPath - Directory to search in
     * @param {string} query - Search query
     * @param {Object} options - Search options
     * @returns {Promise<Object>} Search results
     */
    searchInFiles: (dirPath, query, options) => {
        return ipcRenderer.invoke('search-in-files', dirPath, query, options);
    },

    /**
     * Send LSP request
     * @param {string} languageId - Language identifier
     * @param {string} method - LSP method
     * @param {Object} params - Request parameters
     * @param {string} rootPath - Workspace root path
     * @returns {Promise<Object>} LSP response
     */
    lspRequest: (languageId, method, params, rootPath) => {
        return ipcRenderer.invoke('lsp-request', languageId, method, params, rootPath);
    },

    /**
     * Send LSP notification
     * @param {string} language Id - Language identifier
     * @param {string} method - LSP method
     * @param {Object} params - Notification parameters
     * @param {string} rootPath - Workspace root path
     * @returns {Promise<Object>} Result
     */
    lspNotification: (languageId, method, params, rootPath) => {
        return ipcRenderer.invoke('lsp-notification', languageId, method, params, rootPath);
    },

    // ========================================
    // Browser API
    // ========================================

    /**
     * Create a new browser view
     * @param {string} tabId - Unique tab identifier
     * @param {Object} bounds - View bounds {x, y, width, height}
     * @returns {Promise<Object>} Creation result
     */
    browserCreateView: (tabId, bounds) => {
        return ipcRenderer.invoke('browser-create-view', tabId, bounds);
    },

    /**
     * Destroy a browser view
     * @param {string} tabId - Tab identifier
     * @returns {Promise<Object>} Destruction result
     */
    browserDestroyView: (tabId) => {
        return ipcRenderer.invoke('browser-destroy-view', tabId);
    },

    /**
     * Navigate browser to URL
     * @param {string} tabId - Tab identifier
     * @param {string} url - URL to navigate to
     * @returns {Promise<Object>} Navigation result
     */
    browserNavigate: (tabId, url) => {
        return ipcRenderer.invoke('browser-navigate', tabId, url);
    },

    /**
     * Go back in browser history
     * @param {string} tabId - Tab identifier
     * @returns {Promise<Object>} Result
     */
    browserGoBack: (tabId) => {
        return ipcRenderer.invoke('browser-go-back', tabId);
    },

    /**
     * Go forward in browser history
     * @param {string} tabId - Tab identifier
     * @returns {Promise<Object>} Result
     */
    browserGoForward: (tabId) => {
        return ipcRenderer.invoke('browser-go-forward', tabId);
    },

    /**
     * Reload current page
     * @param {string} tabId - Tab identifier
     * @returns {Promise<Object>} Result
     */
    browserReload: (tabId) => {
        return ipcRenderer.invoke('browser-reload', tabId);
    },

    /**
     * Toggle DevTools for browser view
     * @param {string} tabId - Tab identifier
     * @returns {Promise<Object>} Result
     */
    browserToggleDevTools: (tabId) => {
        return ipcRenderer.invoke('browser-toggle-devtools', tabId);
    },

    /**
     * Update browser view bounds
     * @param {string} tabId - Tab identifier
     * @param {Object} bounds - New bounds {x, y, width, height}
     * @returns {Promise<Object>} Result
     */
    browserUpdateBounds: (tabId, bounds) => {
        return ipcRenderer.invoke('browser-update-bounds', tabId, bounds);
    },

    // ========================================
    // File Watcher API
    // ========================================

    /**
     * Watch a directory for file system changes
     * @param {string} dirPath - Directory path to watch
     * @returns {Promise<Object>} Watch result
     */
    watchDirectory: (dirPath) => {
        return ipcRenderer.invoke('watch-directory', dirPath);
    },

    /**
     * Stop watching a directory
     * @param {string} dirPath - Directory path to stop watching
     * @returns {Promise<Object>} Unwatch result
     */
    unwatchDirectory: (dirPath) => {
        return ipcRenderer.invoke('unwatch-directory', dirPath);
    },

    /**
     * Register a callback for file watcher events
     * @param {Function} callback - Callback function receiving (rootPath, events)
     */
    onFileWatcherEvent: (callback) => {
        ipcRenderer.on('file-watcher-event', (event, data) => {
            callback(data.rootPath, data.events);
        });
    },

    /**
     * Remove file watcher event listener
     * @param {Function} callback - Callback function to remove
     */
    removeFileWatcherListener: (callback) => {
        ipcRenderer.removeListener('file-watcher-event', callback);
    }
});

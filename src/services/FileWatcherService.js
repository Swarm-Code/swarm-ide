/**
 * FileWatcherService - Monitors filesystem changes
 *
 * Provides automatic detection of file/folder creation, modification, and deletion.
 * Batches changes to avoid excessive updates (500ms debounce like VS Code).
 *
 * Usage (Main Process):
 *   const watcher = new FileWatcherService();
 *   watcher.watch('/path/to/dir', (events) => {
 *     console.log('Changes:', events);
 *   });
 */

const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

class FileWatcherService extends EventEmitter {
    constructor() {
        super();
        this.watchers = new Map(); // path -> FSWatcher
        this.watchCallbacks = new Map(); // path -> callback
        this.pendingChanges = new Map(); // path -> Set of changed paths
        this.debounceTimers = new Map(); // path -> timeout
        this.DEBOUNCE_DELAY = 500; // 500ms like VS Code
    }

    /**
     * Watch a directory for changes
     * @param {string} dirPath - Directory to watch
     * @param {Function} callback - Called with array of change events
     * @returns {boolean} Success status
     */
    watch(dirPath, callback) {
        if (this.watchers.has(dirPath)) {
            console.log('[FileWatcher] Already watching:', dirPath);
            return true;
        }

        try {
            console.log('[FileWatcher] Starting to watch:', dirPath);

            // Store callback
            this.watchCallbacks.set(dirPath, callback);
            this.pendingChanges.set(dirPath, new Set());

            // Create watcher with recursive option
            const watcher = fs.watch(dirPath, { recursive: true }, (eventType, filename) => {
                if (!filename) return;

                const fullPath = path.join(dirPath, filename);
                console.log('[FileWatcher] Event:', eventType, 'for', fullPath);

                // Determine what kind of change occurred
                this.handleFileChange(dirPath, fullPath, eventType);
            });

            watcher.on('error', (error) => {
                console.error('[FileWatcher] Error watching', dirPath, ':', error);
                this.emit('error', { path: dirPath, error: error.message });
            });

            this.watchers.set(dirPath, watcher);
            console.log('[FileWatcher] Successfully watching:', dirPath);
            return true;
        } catch (error) {
            console.error('[FileWatcher] Failed to watch directory:', error);
            this.emit('error', { path: dirPath, error: error.message });
            return false;
        }
    }

    /**
     * Handle a file change event
     * @param {string} rootPath - Root directory being watched
     * @param {string} filePath - Full path of changed file
     * @param {string} eventType - Type of event ('rename' or 'change')
     */
    handleFileChange(rootPath, filePath, eventType) {
        // Add to pending changes
        const pending = this.pendingChanges.get(rootPath);
        if (pending) {
            pending.add(filePath);
        }

        // Clear existing debounce timer
        if (this.debounceTimers.has(rootPath)) {
            clearTimeout(this.debounceTimers.get(rootPath));
        }

        // Set new debounce timer
        const timer = setTimeout(() => {
            this.flushPendingChanges(rootPath);
        }, this.DEBOUNCE_DELAY);

        this.debounceTimers.set(rootPath, timer);
    }

    /**
     * Flush pending changes and call callback
     * @param {string} rootPath - Root directory being watched
     */
    async flushPendingChanges(rootPath) {
        const pending = this.pendingChanges.get(rootPath);
        if (!pending || pending.size === 0) return;

        const callback = this.watchCallbacks.get(rootPath);
        if (!callback) return;

        // Convert pending changes to event objects
        const events = await this.determineChangeTypes(Array.from(pending));

        console.log('[FileWatcher] Flushing', events.length, 'changes for', rootPath);

        // Clear pending changes
        pending.clear();

        // Call callback with events
        if (events.length > 0) {
            callback(events);
        }
    }

    /**
     * Determine the type of change for each path
     * @param {Array<string>} paths - Paths that changed
     * @returns {Promise<Array>} Array of change events
     */
    async determineChangeTypes(paths) {
        const events = [];

        for (const filePath of paths) {
            try {
                const exists = fs.existsSync(filePath);

                if (exists) {
                    const stats = fs.statSync(filePath);
                    const isDirectory = stats.isDirectory();

                    // Could be created or modified - we'll treat all as 'changed'
                    // for simplicity and let the explorer re-read the directory
                    events.push({
                        type: 'changed',
                        path: filePath,
                        isDirectory
                    });
                } else {
                    // File was deleted
                    events.push({
                        type: 'deleted',
                        path: filePath,
                        isDirectory: false // We can't know for sure, but it doesn't matter
                    });
                }
            } catch (error) {
                console.error('[FileWatcher] Error determining change type:', error);
            }
        }

        return events;
    }

    /**
     * Stop watching a directory
     * @param {string} dirPath - Directory to stop watching
     */
    unwatch(dirPath) {
        const watcher = this.watchers.get(dirPath);
        if (watcher) {
            console.log('[FileWatcher] Stopping watch on:', dirPath);
            watcher.close();
            this.watchers.delete(dirPath);
            this.watchCallbacks.delete(dirPath);
            this.pendingChanges.delete(dirPath);

            // Clear debounce timer
            if (this.debounceTimers.has(dirPath)) {
                clearTimeout(this.debounceTimers.get(dirPath));
                this.debounceTimers.delete(dirPath);
            }
        }
    }

    /**
     * Stop watching all directories
     */
    unwatchAll() {
        console.log('[FileWatcher] Stopping all watches');
        for (const dirPath of this.watchers.keys()) {
            this.unwatch(dirPath);
        }
    }

    /**
     * Get list of watched directories
     * @returns {Array<string>}
     */
    getWatchedPaths() {
        return Array.from(this.watchers.keys());
    }
}

module.exports = FileWatcherService;

/**
 * SSHMediaCache - Media file caching service for SSH connections
 *
 * Provides caching functionality for media files accessed over SSH.
 * Downloads files to a temporary cache directory for viewing in media players.
 *
 * Features:
 * - Automatic caching of media files (images, videos, audio, PDFs, docs)
 * - Cache size management with configurable limits
 * - LRU (Least Recently Used) eviction strategy
 * - Progress tracking for large file downloads
 * - Automatic cleanup on app close
 * - Cache hit detection to avoid re-downloading
 *
 * Usage:
 *   const sshMediaCache = require('./SSHMediaCache');
 *   await sshMediaCache.initialize(electronAPI);
 *   const localPath = await sshMediaCache.getCachedFile(connectionId, remotePath);
 */

const path = require('path');
const logger = require('../utils/Logger');
const eventBus = require('../modules/EventBus');

class SSHMediaCache {
    constructor() {
        this.api = null;
        this.initialized = false;
        this.cacheDir = null;

        // Cache metadata: key = `${connectionId}:${remotePath}`, value = { localPath, size, timestamp, accessCount }
        this.cache = new Map();

        // Configuration
        this.config = {
            maxCacheSize: 200 * 1024 * 1024, // 200MB (reduced from 500MB for memory optimization)
            autoCleanup: true,
            maxFileAge: 24 * 60 * 60 * 1000, // 24 hours
            largeSizeWarningThreshold: 50 * 1024 * 1024, // 50MB - warn before downloading (reduced from 100MB)
        };

        // Statistics
        this.stats = {
            totalSize: 0,
            fileCount: 0,
            hits: 0,
            misses: 0,
            evictions: 0
        };

        logger.debug('ssh-cache', 'SSH Media Cache initialized');
    }

    /**
     * Initialize the cache service
     * @param {Object} electronAPI - The API exposed via preload script
     */
    async initialize(electronAPI) {
        if (this.initialized) {
            logger.debug('ssh-cache', 'SSH Media Cache already initialized');
            return;
        }

        this.api = electronAPI;

        try {
            // Get cache directory from main process
            const result = await this.api.invoke('ssh-media-cache-init');
            if (!result.success) {
                throw new Error(result.error);
            }

            this.cacheDir = result.cacheDir;
            logger.info('ssh-cache', `Cache directory: ${this.cacheDir}`);

            // Load existing cache metadata
            await this.loadCacheMetadata();

            // Set up cleanup on app close
            if (this.config.autoCleanup) {
                window.addEventListener('beforeunload', () => {
                    this.saveCacheMetadata();
                });
            }

            this.initialized = true;
            logger.info('ssh-cache', 'SSH Media Cache initialized successfully');

        } catch (error) {
            logger.error('ssh-cache', 'Failed to initialize SSH Media Cache:', error.message);
            throw error;
        }
    }

    /**
     * Get cached file path, downloading if necessary
     * @param {string} connectionId - SSH connection ID
     * @param {string} remotePath - Remote file path
     * @param {Function} onProgress - Progress callback (optional)
     * @returns {Promise<string>} Local file path
     */
    async getCachedFile(connectionId, remotePath, onProgress = null) {
        if (!this.initialized) {
            throw new Error('SSH Media Cache not initialized');
        }

        const cacheKey = `${connectionId}:${remotePath}`;

        // Check if file is already cached
        if (this.cache.has(cacheKey)) {
            const cacheEntry = this.cache.get(cacheKey);

            // Verify file still exists
            const exists = await this.api.invoke('ssh-media-cache-file-exists', cacheEntry.localPath);
            if (exists.success && exists.exists) {
                // Update access time and count
                cacheEntry.lastAccess = Date.now();
                cacheEntry.accessCount++;
                this.stats.hits++;

                logger.debug('ssh-cache', `Cache hit: ${remotePath}`);
                return cacheEntry.localPath;
            } else {
                // File was deleted, remove from cache
                this.cache.delete(cacheKey);
                this.stats.fileCount--;
                this.stats.totalSize -= cacheEntry.size;
            }
        }

        // Cache miss - download file
        this.stats.misses++;
        logger.debug('ssh-cache', `Cache miss: ${remotePath}, downloading...`);

        // Get file stats to check size
        const statsResult = await this.api.invoke('ssh-get-stats', connectionId, remotePath);
        if (!statsResult.success) {
            throw new Error(`Failed to get file stats: ${statsResult.error}`);
        }

        const fileSize = statsResult.stats.size;

        // Warn if file is large
        if (fileSize > this.config.largeSizeWarningThreshold) {
            const sizeFormatted = this.formatBytes(fileSize);
            const fileNameDisplay = path.basename(remotePath);

            const userConfirmed = confirm(
                `⚠️ Large File Warning\n\n` +
                `File: ${fileNameDisplay}\n` +
                `Size: ${sizeFormatted}\n\n` +
                `This file is quite large and will take time to download.\n\n` +
                `Are you sure you want to download and open this file?`
            );

            if (!userConfirmed) {
                throw new Error('Download cancelled by user');
            }
        }

        // Check if we need to evict files to make room
        await this.ensureCacheSpace(fileSize);

        // Generate local path
        const fileName = path.basename(remotePath);
        const localPath = await this.api.invoke('ssh-media-cache-get-local-path', connectionId, fileName);
        if (!localPath.success) {
            throw new Error(`Failed to get local path: ${localPath.error}`);
        }

        // Download file
        try {
            eventBus.emit('ssh:mediaCacheDownloadStart', {
                connectionId,
                remotePath,
                localPath: localPath.path,
                size: fileSize
            });

            const downloadResult = await this.api.invoke(
                'ssh-download-file',
                connectionId,
                remotePath,
                localPath.path
            );

            if (!downloadResult.success) {
                throw new Error(downloadResult.error);
            }

            // Add to cache
            const cacheEntry = {
                localPath: localPath.path,
                remotePath,
                connectionId,
                size: fileSize,
                timestamp: Date.now(),
                lastAccess: Date.now(),
                accessCount: 1
            };

            this.cache.set(cacheKey, cacheEntry);
            this.stats.totalSize += fileSize;
            this.stats.fileCount++;

            eventBus.emit('ssh:mediaCacheDownloadComplete', {
                connectionId,
                remotePath,
                localPath: localPath.path
            });

            logger.info('ssh-cache', `File cached: ${remotePath} (${this.formatBytes(fileSize)})`);
            return localPath.path;

        } catch (error) {
            eventBus.emit('ssh:mediaCacheDownloadError', {
                connectionId,
                remotePath,
                error: error.message
            });

            logger.error('ssh-cache', `Failed to cache file ${remotePath}:`, error.message);
            throw error;
        }
    }

    /**
     * Ensure there's enough space in the cache for a file
     * @param {number} requiredSize - Required size in bytes
     */
    async ensureCacheSpace(requiredSize) {
        // Check if file is too large for cache
        if (requiredSize > this.config.maxCacheSize) {
            logger.warn('ssh-cache', `File size (${this.formatBytes(requiredSize)}) exceeds max cache size (${this.formatBytes(this.config.maxCacheSize)})`);
            // For large files, we'll still try to cache but immediately evict after use
            // Or we could throw an error - for now, just log warning
        }

        // Evict old files until we have enough space
        while (this.stats.totalSize + requiredSize > this.config.maxCacheSize) {
            const evicted = await this.evictLRUFile();
            if (!evicted) {
                // No more files to evict
                break;
            }
        }
    }

    /**
     * Evict the least recently used file
     * @returns {Promise<boolean>} True if a file was evicted
     */
    async evictLRUFile() {
        if (this.cache.size === 0) {
            return false;
        }

        // Find LRU file (oldest lastAccess time)
        let lruKey = null;
        let lruTime = Date.now();

        for (const [key, entry] of this.cache.entries()) {
            if (entry.lastAccess < lruTime) {
                lruTime = entry.lastAccess;
                lruKey = key;
            }
        }

        if (!lruKey) {
            return false;
        }

        const entry = this.cache.get(lruKey);

        // Delete the file
        try {
            await this.api.invoke('ssh-media-cache-delete-file', entry.localPath);
            this.cache.delete(lruKey);
            this.stats.totalSize -= entry.size;
            this.stats.fileCount--;
            this.stats.evictions++;

            logger.info('ssh-cache', `Evicted LRU file: ${entry.remotePath} (${this.formatBytes(entry.size)})`);
            return true;

        } catch (error) {
            logger.error('ssh-cache', `Failed to evict file ${entry.remotePath}:`, error.message);
            // Remove from cache anyway
            this.cache.delete(lruKey);
            return false;
        }
    }

    /**
     * Clear all cached files for a specific connection
     * @param {string} connectionId - Connection ID
     */
    async clearConnectionCache(connectionId) {
        if (!this.initialized) {
            throw new Error('SSH Media Cache not initialized');
        }

        const keysToDelete = [];
        for (const [key, entry] of this.cache.entries()) {
            if (entry.connectionId === connectionId) {
                keysToDelete.push(key);
            }
        }

        for (const key of keysToDelete) {
            const entry = this.cache.get(key);
            try {
                await this.api.invoke('ssh-media-cache-delete-file', entry.localPath);
                this.stats.totalSize -= entry.size;
                this.stats.fileCount--;
            } catch (error) {
                logger.error('ssh-cache', `Failed to delete cached file ${entry.localPath}:`, error.message);
            }
            this.cache.delete(key);
        }

        logger.info('ssh-cache', `Cleared cache for connection: ${connectionId} (${keysToDelete.length} files)`);
    }

    /**
     * Clear all cached files
     */
    async clearAllCache() {
        if (!this.initialized) {
            throw new Error('SSH Media Cache not initialized');
        }

        try {
            const result = await this.api.invoke('ssh-media-cache-clear-all');
            if (!result.success) {
                throw new Error(result.error);
            }

            this.cache.clear();
            this.stats.totalSize = 0;
            this.stats.fileCount = 0;

            logger.info('ssh-cache', 'All cache cleared');
            eventBus.emit('ssh:mediaCacheCleared');

        } catch (error) {
            logger.error('ssh-cache', 'Failed to clear cache:', error.message);
            throw error;
        }
    }

    /**
     * Get cache statistics
     * @returns {Object} Cache statistics
     */
    getStats() {
        return {
            ...this.stats,
            maxSize: this.config.maxCacheSize,
            usagePercent: (this.stats.totalSize / this.config.maxCacheSize * 100).toFixed(2),
            totalSizeFormatted: this.formatBytes(this.stats.totalSize),
            maxSizeFormatted: this.formatBytes(this.config.maxCacheSize),
            largeSizeWarningThreshold: this.config.largeSizeWarningThreshold,
            largeSizeWarningThresholdFormatted: this.formatBytes(this.config.largeSizeWarningThreshold)
        };
    }

    /**
     * Get list of cached files
     * @returns {Array} List of cached files
     */
    getCachedFiles() {
        const files = [];
        for (const [key, entry] of this.cache.entries()) {
            files.push({
                connectionId: entry.connectionId,
                remotePath: entry.remotePath,
                localPath: entry.localPath,
                size: entry.size,
                sizeFormatted: this.formatBytes(entry.size),
                timestamp: entry.timestamp,
                lastAccess: entry.lastAccess,
                accessCount: entry.accessCount
            });
        }
        return files;
    }

    /**
     * Update cache configuration
     * @param {Object} config - Configuration options
     */
    updateConfig(config) {
        if (config.maxCacheSize !== undefined) {
            this.config.maxCacheSize = config.maxCacheSize;
        }
        if (config.autoCleanup !== undefined) {
            this.config.autoCleanup = config.autoCleanup;
        }
        if (config.maxFileAge !== undefined) {
            this.config.maxFileAge = config.maxFileAge;
        }
        if (config.largeSizeWarningThreshold !== undefined) {
            this.config.largeSizeWarningThreshold = config.largeSizeWarningThreshold;
        }

        logger.info('ssh-cache', 'Cache configuration updated', this.config);
    }

    /**
     * Clean up old files based on age
     */
    async cleanupOldFiles() {
        const now = Date.now();
        const keysToDelete = [];

        for (const [key, entry] of this.cache.entries()) {
            if (now - entry.lastAccess > this.config.maxFileAge) {
                keysToDelete.push(key);
            }
        }

        for (const key of keysToDelete) {
            const entry = this.cache.get(key);
            try {
                await this.api.invoke('ssh-media-cache-delete-file', entry.localPath);
                this.stats.totalSize -= entry.size;
                this.stats.fileCount--;
            } catch (error) {
                logger.error('ssh-cache', `Failed to delete old file ${entry.localPath}:`, error.message);
            }
            this.cache.delete(key);
        }

        if (keysToDelete.length > 0) {
            logger.info('ssh-cache', `Cleaned up ${keysToDelete.length} old files`);
        }
    }

    /**
     * Load cache metadata from storage
     */
    async loadCacheMetadata() {
        try {
            const result = await this.api.invoke('ssh-media-cache-load-metadata');
            if (result.success && result.metadata) {
                // Restore cache from metadata
                for (const [key, entry] of Object.entries(result.metadata.cache || {})) {
                    this.cache.set(key, entry);
                }

                if (result.metadata.stats) {
                    this.stats = { ...this.stats, ...result.metadata.stats };
                }

                logger.debug('ssh-cache', `Loaded cache metadata: ${this.cache.size} files`);
            }
        } catch (error) {
            logger.error('ssh-cache', 'Failed to load cache metadata:', error.message);
        }
    }

    /**
     * Save cache metadata to storage
     */
    async saveCacheMetadata() {
        try {
            const metadata = {
                cache: Object.fromEntries(this.cache),
                stats: this.stats,
                timestamp: Date.now()
            };

            await this.api.invoke('ssh-media-cache-save-metadata', metadata);
            logger.debug('ssh-cache', 'Cache metadata saved');

        } catch (error) {
            logger.error('ssh-cache', 'Failed to save cache metadata:', error.message);
        }
    }

    /**
     * Format bytes to human-readable string
     * @param {number} bytes - Number of bytes
     * @returns {string} Formatted string
     */
    formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';

        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));

        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    /**
     * Check if service is initialized
     * @returns {boolean} Initialization status
     */
    isInitialized() {
        return this.initialized;
    }
}

// Export singleton instance
const sshMediaCache = new SSHMediaCache();

module.exports = sshMediaCache;

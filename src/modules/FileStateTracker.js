/**
 * FileStateTracker - Hash-based file modification tracking
 *
 * Tracks file modification state by comparing content hashes instead of just
 * a dirty flag. This allows proper detection of when content returns to its
 * original state (e.g., after undo operations).
 *
 * Features:
 * - Fast hash computation using FNV-1a algorithm
 * - Tracks original content hash per file
 * - Detects true modification state (not just "has changed")
 * - Updates baseline hash on save
 * - Emits events when modification state changes
 *
 * Usage:
 *   fileStateTracker.trackFile(filePath, originalContent);
 *   fileStateTracker.updateContent(filePath, currentContent);
 *   const isModified = fileStateTracker.isModified(filePath);
 */

const eventBus = require('./EventBus');

class FileStateTracker {
    constructor() {
        // Map of filePath -> { originalHash, currentHash, isModified }
        this.files = new Map();
    }

    /**
     * Fast hash function using FNV-1a algorithm
     * This is much faster than MD5/SHA for our use case and sufficient for detecting changes
     * @param {string} str - String to hash
     * @returns {number} Hash value
     */
    fastHash(str) {
        let hash = 2166136261; // FNV offset basis

        for (let i = 0; i < str.length; i++) {
            hash ^= str.charCodeAt(i);
            hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
        }

        return hash >>> 0; // Convert to unsigned 32-bit integer
    }

    /**
     * Start tracking a file with its original content
     * @param {string} filePath - Path to the file
     * @param {string} originalContent - Original file content
     */
    trackFile(filePath, originalContent) {
        const hash = this.fastHash(originalContent);

        this.files.set(filePath, {
            originalHash: hash,
            currentHash: hash,
            isModified: false
        });

        console.log('[FileStateTracker] Started tracking:', filePath, 'hash:', hash);
    }

    /**
     * Update the current content for a file and check if it's modified
     * @param {string} filePath - Path to the file
     * @param {string} currentContent - Current file content
     * @returns {boolean} True if modification state changed
     */
    updateContent(filePath, currentContent) {
        if (!this.files.has(filePath)) {
            console.warn('[FileStateTracker] File not tracked:', filePath);
            // Start tracking it now with current content as baseline
            this.trackFile(filePath, currentContent);
            return false;
        }

        const fileState = this.files.get(filePath);
        const newHash = this.fastHash(currentContent);
        const previouslyModified = fileState.isModified;

        fileState.currentHash = newHash;
        fileState.isModified = (newHash !== fileState.originalHash);

        // Check if modification state changed
        const stateChanged = (previouslyModified !== fileState.isModified);

        if (stateChanged) {
            console.log('[FileStateTracker] Modification state changed for:', filePath, 'isModified:', fileState.isModified);

            // Emit event with modification state
            eventBus.emit('file:modification-state-changed', {
                path: filePath,
                isModified: fileState.isModified,
                originalHash: fileState.originalHash,
                currentHash: newHash
            });
        }

        return stateChanged;
    }

    /**
     * Check if a file is modified (current content differs from original)
     * @param {string} filePath - Path to the file
     * @returns {boolean} True if file is modified
     */
    isModified(filePath) {
        if (!this.files.has(filePath)) {
            return false;
        }

        return this.files.get(filePath).isModified;
    }

    /**
     * Update the baseline (original) hash when file is saved
     * This marks the current content as the new "original"
     * @param {string} filePath - Path to the file
     * @param {string} content - Saved content (optional, will use current hash if not provided)
     */
    updateBaseline(filePath, content = null) {
        if (!this.files.has(filePath)) {
            console.warn('[FileStateTracker] Cannot update baseline for untracked file:', filePath);
            return;
        }

        const fileState = this.files.get(filePath);

        if (content !== null) {
            // Compute hash from provided content
            const newHash = this.fastHash(content);
            fileState.originalHash = newHash;
            fileState.currentHash = newHash;
        } else {
            // Use current hash as new baseline
            fileState.originalHash = fileState.currentHash;
        }

        const previouslyModified = fileState.isModified;
        fileState.isModified = false;

        console.log('[FileStateTracker] Updated baseline for:', filePath, 'hash:', fileState.originalHash);

        // Emit event if state changed
        if (previouslyModified) {
            eventBus.emit('file:modification-state-changed', {
                path: filePath,
                isModified: false,
                originalHash: fileState.originalHash,
                currentHash: fileState.currentHash
            });
        }
    }

    /**
     * Stop tracking a file
     * @param {string} filePath - Path to the file
     */
    untrackFile(filePath) {
        if (this.files.has(filePath)) {
            this.files.delete(filePath);
            console.log('[FileStateTracker] Stopped tracking:', filePath);
        }
    }

    /**
     * Get all modified files
     * @returns {Array<string>} Array of file paths that are modified
     */
    getModifiedFiles() {
        const modified = [];

        for (const [filePath, state] of this.files.entries()) {
            if (state.isModified) {
                modified.push(filePath);
            }
        }

        return modified;
    }

    /**
     * Get tracking state for a file
     * @param {string} filePath - Path to the file
     * @returns {Object|null} File state or null if not tracked
     */
    getFileState(filePath) {
        if (!this.files.has(filePath)) {
            return null;
        }

        const state = this.files.get(filePath);
        return {
            isModified: state.isModified,
            originalHash: state.originalHash,
            currentHash: state.currentHash
        };
    }

    /**
     * Clear all tracked files
     */
    clear() {
        this.files.clear();
        console.log('[FileStateTracker] Cleared all tracked files');
    }
}

// Export singleton instance
const fileStateTracker = new FileStateTracker();
module.exports = fileStateTracker;

/**
 * FileStatus - Data structure for Git file status
 *
 * Represents the status of a file in the working tree and index.
 */

class FileStatus {
    /**
     * Create a file status object
     *
     * @param {Object} data - File status data
     * @param {string} data.path - File path
     * @param {string} data.oldPath - Old path (for renames)
     * @param {string} data.indexStatus - Index status character
     * @param {string} data.workingTreeStatus - Working tree status character
     * @param {boolean} data.isStaged - Is file staged
     * @param {boolean} data.isUntracked - Is file untracked
     * @param {boolean} data.isIgnored - Is file ignored
     * @param {boolean} data.isUnmerged - Is file unmerged
     * @param {boolean} data.isRenamed - Is file renamed
     * @param {boolean} data.isCopied - Is file copied
     * @param {number} data.similarity - Similarity score for renames/copies
     */
    constructor(data) {
        this.path = data.path;
        this.oldPath = data.oldPath || null;
        this.indexStatus = data.indexStatus || '.';
        this.workingTreeStatus = data.workingTreeStatus || '.';
        this.isStaged = data.isStaged || false;
        this.isUntracked = data.isUntracked || false;
        this.isIgnored = data.isIgnored || false;
        this.isUnmerged = data.isUnmerged || false;
        this.isRenamed = data.isRenamed || false;
        this.isCopied = data.isCopied || false;
        this.similarity = data.similarity || 0;
    }

    /**
     * Check if file has been modified
     * @returns {boolean}
     */
    isModified() {
        return (this.indexStatus === 'M' || this.workingTreeStatus === 'M') && !this.isUntracked;
    }

    /**
     * Check if file has been added
     * @returns {boolean}
     */
    isAdded() {
        return (this.indexStatus === 'A' || this.workingTreeStatus === 'A') && !this.isUntracked;
    }

    /**
     * Check if file has been deleted
     * @returns {boolean}
     */
    isDeleted() {
        return this.indexStatus === 'D' || this.workingTreeStatus === 'D';
    }

    /**
     * Check if file has changes in working tree (unstaged)
     * @returns {boolean}
     */
    hasUnstagedChanges() {
        return this.workingTreeStatus !== '.' && this.workingTreeStatus !== '?' && !this.isStaged;
    }

    /**
     * Check if file has changes in index (staged)
     * @returns {boolean}
     */
    hasStagedChanges() {
        return this.isStaged && this.indexStatus !== '.';
    }

    /**
     * Get change type
     * @returns {string} 'modified', 'added', 'deleted', 'renamed', 'copied', 'untracked', 'ignored', 'unmerged'
     */
    getChangeType() {
        if (this.isUnmerged) return 'unmerged';
        if (this.isIgnored) return 'ignored';
        if (this.isUntracked) return 'untracked';
        if (this.isRenamed) return 'renamed';
        if (this.isCopied) return 'copied';
        if (this.isDeleted()) return 'deleted';
        if (this.isAdded()) return 'added';
        if (this.isModified()) return 'modified';
        return 'unknown';
    }

    /**
     * Get status description
     * @returns {string}
     */
    getStatusDescription() {
        const type = this.getChangeType();

        switch (type) {
            case 'modified':
                if (this.isStaged && this.hasUnstagedChanges()) {
                    return 'Modified (staged and unstaged)';
                } else if (this.isStaged) {
                    return 'Modified (staged)';
                } else {
                    return 'Modified';
                }
            case 'added':
                return this.isStaged ? 'Added (staged)' : 'Added';
            case 'deleted':
                return this.isStaged ? 'Deleted (staged)' : 'Deleted';
            case 'renamed':
                return `Renamed from ${this.oldPath}`;
            case 'copied':
                return `Copied from ${this.oldPath}`;
            case 'untracked':
                return 'Untracked';
            case 'ignored':
                return 'Ignored';
            case 'unmerged':
                return 'Unmerged (conflict)';
            default:
                return 'Unknown';
        }
    }

    /**
     * Get short status (for UI display)
     * @returns {string}
     */
    getShortStatus() {
        if (this.isUnmerged) return 'U';
        if (this.isUntracked) return '?';
        if (this.isIgnored) return '!';

        // Two-character status (index + working tree)
        return this.indexStatus + this.workingTreeStatus;
    }

    /**
     * Get status icon/symbol for UI
     * @returns {string}
     */
    getStatusIcon() {
        switch (this.getChangeType()) {
            case 'modified':
                return '~';
            case 'added':
                return '+';
            case 'deleted':
                return '-';
            case 'renamed':
                return '→';
            case 'copied':
                return '⎘';
            case 'untracked':
                return '?';
            case 'ignored':
                return '!';
            case 'unmerged':
                return '✕';
            default:
                return '·';
        }
    }

    /**
     * Get status color for UI
     * @returns {string}
     */
    getStatusColor() {
        switch (this.getChangeType()) {
            case 'modified':
                return 'yellow';
            case 'added':
                return 'green';
            case 'deleted':
                return 'red';
            case 'renamed':
            case 'copied':
                return 'blue';
            case 'untracked':
                return 'gray';
            case 'ignored':
                return 'darkgray';
            case 'unmerged':
                return 'orange';
            default:
                return 'white';
        }
    }

    /**
     * Get the effective file path (new path for renames, otherwise path)
     * @returns {string}
     */
    getEffectivePath() {
        return this.path;
    }

    /**
     * Get display path (includes old path for renames)
     * @returns {string}
     */
    getDisplayPath() {
        if (this.isRenamed && this.oldPath) {
            return `${this.oldPath} → ${this.path}`;
        } else if (this.isCopied && this.oldPath) {
            return `${this.oldPath} ⎘ ${this.path}`;
        }
        return this.path;
    }

    /**
     * Can this file be staged?
     * @returns {boolean}
     */
    canStage() {
        return !this.isStaged && !this.isUntracked && !this.isIgnored;
    }

    /**
     * Can this file be unstaged?
     * @returns {boolean}
     */
    canUnstage() {
        return this.isStaged;
    }

    /**
     * Can this file be discarded?
     * @returns {boolean}
     */
    canDiscard() {
        return this.hasUnstagedChanges() && !this.isUntracked;
    }

    /**
     * Convert to string representation
     * @returns {string}
     */
    toString() {
        return `${this.getShortStatus()} ${this.getDisplayPath()}`;
    }

    /**
     * Convert to JSON representation
     * @returns {Object}
     */
    toJSON() {
        return {
            path: this.path,
            oldPath: this.oldPath,
            indexStatus: this.indexStatus,
            workingTreeStatus: this.workingTreeStatus,
            isStaged: this.isStaged,
            isUntracked: this.isUntracked,
            isIgnored: this.isIgnored,
            isUnmerged: this.isUnmerged,
            isRenamed: this.isRenamed,
            isCopied: this.isCopied,
            similarity: this.similarity
        };
    }
}

module.exports = { FileStatus };

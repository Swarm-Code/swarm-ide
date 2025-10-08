/**
 * Diff - Data structure for Git diffs
 *
 * Represents changes to a single file with hunks.
 */

class Diff {
    /**
     * Create a diff object
     *
     * @param {Object} data - Diff data
     * @param {string} data.oldPath - Old file path
     * @param {string} data.newPath - New file path
     * @param {string} data.changeType - Type of change (added, modified, deleted, renamed, copied)
     * @param {string} data.mode - File mode
     * @param {string} data.oldHash - Old file hash
     * @param {string} data.newHash - New file hash
     * @param {Array} data.hunks - Array of Hunk objects
     */
    constructor(data) {
        this.oldPath = data.oldPath;
        this.newPath = data.newPath;
        this.changeType = data.changeType || 'modified';
        this.mode = data.mode || null;
        this.oldHash = data.oldHash || null;
        this.newHash = data.newHash || null;
        this.hunks = data.hunks || [];
    }

    /**
     * Get the current file path
     * @returns {string}
     */
    get path() {
        return this.newPath || this.oldPath;
    }

    /**
     * Check if file was added
     * @returns {boolean}
     */
    isAdded() {
        return this.changeType === 'added';
    }

    /**
     * Check if file was deleted
     * @returns {boolean}
     */
    isDeleted() {
        return this.changeType === 'deleted';
    }

    /**
     * Check if file was modified
     * @returns {boolean}
     */
    isModified() {
        return this.changeType === 'modified';
    }

    /**
     * Check if file was renamed
     * @returns {boolean}
     */
    isRenamed() {
        return this.changeType === 'renamed';
    }

    /**
     * Check if file was copied
     * @returns {boolean}
     */
    isCopied() {
        return this.changeType === 'copied';
    }

    /**
     * Add a hunk to the diff
     *
     * @param {Hunk} hunk - Hunk object to add
     */
    addHunk(hunk) {
        this.hunks.push(hunk);
    }

    /**
     * Get total number of additions
     * @returns {number}
     */
    getTotalAdditions() {
        return this.hunks.reduce((total, hunk) => {
            return total + hunk.getAddedLines().length;
        }, 0);
    }

    /**
     * Get total number of deletions
     * @returns {number}
     */
    getTotalDeletions() {
        return this.hunks.reduce((total, hunk) => {
            return total + hunk.getRemovedLines().length;
        }, 0);
    }

    /**
     * Get total number of changes
     * @returns {number}
     */
    getTotalChanges() {
        return this.getTotalAdditions() + this.getTotalDeletions();
    }

    /**
     * Get diff statistics
     * @returns {Object} {additions, deletions, changes}
     */
    getStats() {
        return {
            additions: this.getTotalAdditions(),
            deletions: this.getTotalDeletions(),
            changes: this.getTotalChanges()
        };
    }

    /**
     * Find hunk containing a specific line number
     *
     * @param {number} lineNumber - Line number in new file
     * @returns {Hunk|null} Hunk containing the line, or null
     */
    findHunkForLine(lineNumber) {
        return this.hunks.find(hunk => hunk.containsLine(lineNumber)) || null;
    }

    /**
     * Get all changed line numbers
     *
     * @returns {Object} {added: number[], removed: number[]}
     */
    getChangedLines() {
        const added = [];
        const removed = [];

        for (const hunk of this.hunks) {
            let newLineNum = hunk.newStart;
            let oldLineNum = hunk.oldStart;

            for (const line of hunk.lines) {
                if (line.type === 'added') {
                    added.push(newLineNum);
                    newLineNum++;
                } else if (line.type === 'removed') {
                    removed.push(oldLineNum);
                    oldLineNum++;
                } else if (line.type === 'unchanged') {
                    newLineNum++;
                    oldLineNum++;
                }
            }
        }

        return { added, removed };
    }

    /**
     * Get change type icon/symbol for UI
     * @returns {string}
     */
    getChangeIcon() {
        switch (this.changeType) {
            case 'added':
                return '+';
            case 'deleted':
                return '-';
            case 'modified':
                return '~';
            case 'renamed':
                return '→';
            case 'copied':
                return '⎘';
            default:
                return '?';
        }
    }

    /**
     * Get change type color for UI
     * @returns {string}
     */
    getChangeColor() {
        switch (this.changeType) {
            case 'added':
                return 'green';
            case 'deleted':
                return 'red';
            case 'modified':
                return 'yellow';
            case 'renamed':
                return 'blue';
            case 'copied':
                return 'cyan';
            default:
                return 'gray';
        }
    }

    /**
     * Convert to unified diff format string
     * @returns {string}
     */
    toString() {
        const lines = [];

        // Diff header
        lines.push(`diff --git a/${this.oldPath} b/${this.newPath}`);

        // Change type indicators
        if (this.isAdded()) {
            lines.push(`new file mode ${this.mode || '100644'}`);
        } else if (this.isDeleted()) {
            lines.push(`deleted file mode ${this.mode || '100644'}`);
        } else if (this.isRenamed()) {
            lines.push(`rename from ${this.oldPath}`);
            lines.push(`rename to ${this.newPath}`);
        } else if (this.isCopied()) {
            lines.push(`copy from ${this.oldPath}`);
            lines.push(`copy to ${this.newPath}`);
        }

        // Index line
        if (this.oldHash && this.newHash) {
            lines.push(`index ${this.oldHash}..${this.newHash}${this.mode ? ' ' + this.mode : ''}`);
        }

        // File paths
        lines.push(`--- a/${this.oldPath}`);
        lines.push(`+++ b/${this.newPath}`);

        // Hunks
        for (const hunk of this.hunks) {
            lines.push(hunk.toString());
        }

        return lines.join('\n');
    }

    /**
     * Convert to JSON representation
     * @returns {Object}
     */
    toJSON() {
        return {
            oldPath: this.oldPath,
            newPath: this.newPath,
            changeType: this.changeType,
            mode: this.mode,
            oldHash: this.oldHash,
            newHash: this.newHash,
            hunks: this.hunks.map(h => h.toJSON())
        };
    }
}

module.exports = { Diff };

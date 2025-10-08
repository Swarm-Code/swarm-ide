/**
 * Hunk - Data structure for diff hunks
 *
 * Represents a contiguous block of changes in a diff.
 */

class Hunk {
    /**
     * Create a hunk object
     *
     * @param {Object} data - Hunk data
     * @param {number} data.oldStart - Starting line number in old file
     * @param {number} data.oldLines - Number of lines in old file
     * @param {number} data.newStart - Starting line number in new file
     * @param {number} data.newLines - Number of lines in new file
     * @param {string} data.header - Hunk header line (@@ -1,3 +1,4 @@)
     * @param {string} data.context - Optional context text after @@
     * @param {Array} data.lines - Array of line objects
     */
    constructor(data) {
        this.oldStart = data.oldStart;
        this.oldLines = data.oldLines;
        this.newStart = data.newStart;
        this.newLines = data.newLines;
        this.header = data.header;
        this.context = data.context || '';
        this.lines = data.lines || [];
    }

    /**
     * Add a line to the hunk
     *
     * @param {string} type - Line type: 'added', 'removed', 'unchanged', 'noeol'
     * @param {string} content - Line content
     */
    addLine(type, content) {
        this.lines.push({
            type,
            content
        });
    }

    /**
     * Get lines of a specific type
     *
     * @param {string} type - Line type to filter
     * @returns {Array} Filtered lines
     */
    getLinesByType(type) {
        return this.lines.filter(line => line.type === type);
    }

    /**
     * Get added lines
     * @returns {Array}
     */
    getAddedLines() {
        return this.getLinesByType('added');
    }

    /**
     * Get removed lines
     * @returns {Array}
     */
    getRemovedLines() {
        return this.getLinesByType('removed');
    }

    /**
     * Get unchanged (context) lines
     * @returns {Array}
     */
    getContextLines() {
        return this.getLinesByType('unchanged');
    }

    /**
     * Get old line range
     * @returns {Object} {start, end}
     */
    getOldRange() {
        return {
            start: this.oldStart,
            end: this.oldStart + this.oldLines - 1
        };
    }

    /**
     * Get new line range
     * @returns {Object} {start, end}
     */
    getNewRange() {
        return {
            start: this.newStart,
            end: this.newStart + this.newLines - 1
        };
    }

    /**
     * Check if a line number is within this hunk (new file)
     *
     * @param {number} lineNumber - Line number to check
     * @returns {boolean}
     */
    containsLine(lineNumber) {
        const range = this.getNewRange();
        return lineNumber >= range.start && lineNumber <= range.end;
    }

    /**
     * Get formatted hunk header
     * @returns {string}
     */
    getFormattedHeader() {
        let header = `@@ -${this.oldStart},${this.oldLines} +${this.newStart},${this.newLines} @@`;
        if (this.context) {
            header += ` ${this.context}`;
        }
        return header;
    }

    /**
     * Get statistics for this hunk
     * @returns {Object} {added, removed, unchanged}
     */
    getStats() {
        return {
            added: this.getAddedLines().length,
            removed: this.getRemovedLines().length,
            unchanged: this.getContextLines().length
        };
    }

    /**
     * Convert to unified diff format string
     * @returns {string}
     */
    toString() {
        const lines = [this.getFormattedHeader()];

        for (const line of this.lines) {
            let prefix;
            switch (line.type) {
                case 'added':
                    prefix = '+';
                    break;
                case 'removed':
                    prefix = '-';
                    break;
                case 'unchanged':
                    prefix = ' ';
                    break;
                case 'noeol':
                    prefix = '\\';
                    break;
                default:
                    prefix = ' ';
            }
            lines.push(prefix + line.content);
        }

        return lines.join('\n');
    }

    /**
     * Convert to JSON representation
     * @returns {Object}
     */
    toJSON() {
        return {
            oldStart: this.oldStart,
            oldLines: this.oldLines,
            newStart: this.newStart,
            newLines: this.newLines,
            header: this.header,
            context: this.context,
            lines: this.lines
        };
    }
}

module.exports = { Hunk };

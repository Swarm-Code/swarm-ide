/**
 * BlameEntry - Data structure for Git blame entries
 *
 * Represents blame information for a range of lines.
 */

class BlameEntry {
    /**
     * Create a blame entry
     *
     * @param {Object} data - Blame data
     * @param {string} data.sha - Commit SHA
     * @param {string} data.author - Author name
     * @param {string} data.authorMail - Author email
     * @param {number} data.authorTime - Author timestamp (Unix time)
     * @param {string} data.authorTz - Author timezone
     * @param {string} data.committer - Committer name
     * @param {string} data.committerMail - Committer email
     * @param {number} data.committerTime - Committer timestamp
     * @param {string} data.committerTz - Committer timezone
     * @param {string} data.summary - Commit summary
     * @param {string} data.previousSha - Previous commit SHA
     * @param {string} data.previousFilename - Previous filename
     * @param {string} data.filename - Current filename
     * @param {number} data.lineStart - First line number
     * @param {number} data.lineEnd - Last line number
     * @param {boolean} data.boundary - Is boundary commit
     */
    constructor(data) {
        this.sha = data.sha;
        this.shortSha = this.sha ? this.sha.substring(0, 7) : '';
        this.author = data.author;
        this.authorMail = data.authorMail;
        this.authorTime = data.authorTime;
        this.authorTz = data.authorTz;
        this.committer = data.committer;
        this.committerMail = data.committerMail;
        this.committerTime = data.committerTime;
        this.committerTz = data.committerTz;
        this.summary = data.summary;
        this.previousSha = data.previousSha;
        this.previousFilename = data.previousFilename;
        this.filename = data.filename;
        this.lineStart = data.lineStart;
        this.lineEnd = data.lineEnd;
        this.boundary = data.boundary || false;
    }

    /**
     * Get number of lines in this entry
     * @returns {number}
     */
    get lineCount() {
        return this.lineEnd - this.lineStart + 1;
    }

    /**
     * Get author date as Date object
     * @returns {Date}
     */
    get date() {
        return new Date(this.authorTime * 1000);
    }

    /**
     * Check if a line number is in this entry's range
     *
     * @param {number} lineNumber - Line number to check
     * @returns {boolean}
     */
    containsLine(lineNumber) {
        return lineNumber >= this.lineStart && lineNumber <= this.lineEnd;
    }

    /**
     * Get relative time string
     * @returns {string}
     */
    getRelativeTime() {
        const now = Date.now();
        const diff = now - (this.authorTime * 1000);
        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        const months = Math.floor(days / 30);
        const years = Math.floor(days / 365);

        if (years > 0) return `${years} year${years > 1 ? 's' : ''} ago`;
        if (months > 0) return `${months} month${months > 1 ? 's' : ''} ago`;
        if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
        if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
        if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
        return `${seconds} second${seconds !== 1 ? 's' : ''} ago`;
    }

    /**
     * Get formatted date string
     * @param {string} format - 'short', 'medium', 'long', 'relative'
     * @returns {string}
     */
    getFormattedDate(format = 'medium') {
        const date = this.date;

        switch (format) {
            case 'short':
                return date.toLocaleDateString();
            case 'long':
                return date.toLocaleString();
            case 'relative':
                return this.getRelativeTime();
            case 'medium':
            default:
                return date.toLocaleString(undefined, {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric'
                });
        }
    }

    /**
     * Get blame annotation text for display
     *
     * @param {Object} options - Format options
     * @param {boolean} options.showHash - Include commit hash
     * @param {boolean} options.showAuthor - Include author name
     * @param {boolean} options.showDate - Include date
     * @param {string} options.dateFormat - Date format
     * @returns {string}
     */
    getAnnotation(options = {}) {
        const parts = [];

        if (options.showHash !== false) {
            parts.push(this.shortSha);
        }

        if (options.showAuthor !== false) {
            parts.push(this.author);
        }

        if (options.showDate !== false) {
            const dateFormat = options.dateFormat || 'relative';
            parts.push(this.getFormattedDate(dateFormat));
        }

        return parts.join(' • ');
    }

    /**
     * Get detailed blame information for tooltip
     * @returns {string}
     */
    getTooltip() {
        return [
            `Commit: ${this.sha}`,
            `Author: ${this.author} <${this.authorMail}>`,
            `Date: ${this.getFormattedDate('long')}`,
            ``,
            this.summary
        ].join('\n');
    }

    /**
     * Get gutter decoration text
     * @returns {string}
     */
    getGutterText() {
        return `${this.shortSha} ${this.author}`;
    }

    /**
     * Convert to string representation
     * @returns {string}
     */
    toString() {
        return `${this.shortSha} (${this.author} ${this.getFormattedDate('relative')}) ${this.summary}`;
    }

    /**
     * Convert to JSON representation
     * @returns {Object}
     */
    toJSON() {
        return {
            sha: this.sha,
            shortSha: this.shortSha,
            author: this.author,
            authorMail: this.authorMail,
            authorTime: this.authorTime,
            authorTz: this.authorTz,
            committer: this.committer,
            committerMail: this.committerMail,
            committerTime: this.committerTime,
            committerTz: this.committerTz,
            summary: this.summary,
            previousSha: this.previousSha,
            previousFilename: this.previousFilename,
            filename: this.filename,
            lineStart: this.lineStart,
            lineEnd: this.lineEnd,
            boundary: this.boundary
        };
    }
}

module.exports = { BlameEntry };

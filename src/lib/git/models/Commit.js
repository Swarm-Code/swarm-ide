/**
 * Commit - Data structure for Git commits
 *
 * Represents a single commit with metadata and file changes.
 */

class Commit {
    /**
     * Create a commit object
     *
     * @param {Object} data - Commit data
     * @param {string} data.sha - Full SHA-1 hash
     * @param {string[]} data.parents - Array of parent commit SHAs
     * @param {string} data.author - Author name
     * @param {string} data.authorEmail - Author email
     * @param {number} data.authorTime - Author timestamp (Unix time)
     * @param {string} data.committer - Committer name (optional)
     * @param {string} data.committerEmail - Committer email (optional)
     * @param {number} data.committerTime - Committer timestamp (optional)
     * @param {string} data.subject - Commit subject (first line of message)
     * @param {string} data.body - Commit body (rest of message)
     * @param {Array} data.refs - Array of refs pointing to this commit
     * @param {Array} data.files - Array of file changes
     */
    constructor(data) {
        this.sha = data.sha;
        this.shortSha = this.sha ? this.sha.substring(0, 7) : '';
        this.parents = data.parents || [];
        this.author = data.author;
        this.authorEmail = data.authorEmail;
        this.authorTime = data.authorTime;
        this.committer = data.committer || data.author;
        this.committerEmail = data.committerEmail || data.authorEmail;
        this.committerTime = data.committerTime || data.authorTime;
        this.subject = data.subject;
        this.body = data.body || '';
        this.refs = data.refs || [];
        this.files = data.files || [];
    }

    /**
     * Get full commit message (subject + body)
     * @returns {string}
     */
    get message() {
        return this.body ? `${this.subject}\n\n${this.body}` : this.subject;
    }

    /**
     * Get commit date as Date object
     * @returns {Date}
     */
    get date() {
        return new Date(this.authorTime * 1000);
    }

    /**
     * Get committer date as Date object
     * @returns {Date}
     */
    get commitDate() {
        return new Date(this.committerTime * 1000);
    }

    /**
     * Check if commit is a merge commit
     * @returns {boolean}
     */
    get isMerge() {
        return this.parents.length > 1;
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
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });
        }
    }

    /**
     * Get relative time string (e.g., "2 hours ago")
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
     * Get branch names from refs
     * @returns {string[]}
     */
    getBranches() {
        return this.refs
            .filter(ref => ref.type === 'branch' || ref.type === 'head')
            .map(ref => ref.name);
    }

    /**
     * Get tag names from refs
     * @returns {string[]}
     */
    getTags() {
        return this.refs
            .filter(ref => ref.type === 'tag')
            .map(ref => ref.name);
    }

    /**
     * Get remote branch names from refs
     * @returns {string[]}
     */
    getRemoteBranches() {
        return this.refs
            .filter(ref => ref.type === 'remote')
            .map(ref => ref.name);
    }

    /**
     * Check if this commit is HEAD
     * @returns {boolean}
     */
    isHead() {
        return this.refs.some(ref => ref.type === 'head');
    }

    /**
     * Convert to string representation (oneline format)
     * @returns {string}
     */
    toString() {
        return `${this.shortSha} ${this.subject}`;
    }

    /**
     * Convert to JSON representation
     * @returns {Object}
     */
    toJSON() {
        return {
            sha: this.sha,
            shortSha: this.shortSha,
            parents: this.parents,
            author: this.author,
            authorEmail: this.authorEmail,
            authorTime: this.authorTime,
            committer: this.committer,
            committerEmail: this.committerEmail,
            committerTime: this.committerTime,
            subject: this.subject,
            body: this.body,
            refs: this.refs,
            files: this.files
        };
    }
}

module.exports = { Commit };

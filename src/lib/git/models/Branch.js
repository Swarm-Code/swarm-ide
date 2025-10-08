/**
 * Branch - Data structure for Git branches
 *
 * Represents a branch with tracking information.
 */

class Branch {
    /**
     * Create a branch object
     *
     * @param {Object} data - Branch data
     * @param {string} data.name - Branch name
     * @param {string} data.fullRef - Full ref name (e.g., refs/heads/main)
     * @param {string} data.upstream - Upstream branch name
     * @param {number} data.ahead - Commits ahead of upstream
     * @param {number} data.behind - Commits behind upstream
     * @param {boolean} data.isCurrent - Is this the current branch
     * @param {boolean} data.isRemote - Is this a remote branch
     * @param {boolean} data.isTag - Is this a tag
     * @param {boolean} data.gone - Has upstream been deleted
     * @param {string} data.sha - Commit SHA
     * @param {string} data.date - Commit date
     * @param {string} data.author - Commit author
     * @param {string} data.message - Commit message
     */
    constructor(data) {
        this.name = data.name;
        this.fullRef = data.fullRef || null;
        this.upstream = data.upstream || null;
        this.ahead = data.ahead || 0;
        this.behind = data.behind || 0;
        this.isCurrent = data.isCurrent || false;
        this.isRemote = data.isRemote || false;
        this.isTag = data.isTag || false;
        this.gone = data.gone || false;
        this.sha = data.sha || null;
        this.shortSha = this.sha ? this.sha.substring(0, 7) : '';
        this.date = data.date || null;
        this.author = data.author || null;
        this.message = data.message || null;
    }

    /**
     * Check if branch has upstream
     * @returns {boolean}
     */
    hasUpstream() {
        return !!this.upstream && !this.gone;
    }

    /**
     * Check if branch is ahead of upstream
     * @returns {boolean}
     */
    isAhead() {
        return this.ahead > 0;
    }

    /**
     * Check if branch is behind upstream
     * @returns {boolean}
     */
    isBehind() {
        return this.behind > 0;
    }

    /**
     * Check if branch is in sync with upstream
     * @returns {boolean}
     */
    isInSync() {
        return this.hasUpstream() && this.ahead === 0 && this.behind === 0;
    }

    /**
     * Check if branch has diverged from upstream
     * @returns {boolean}
     */
    hasDiverged() {
        return this.ahead > 0 && this.behind > 0;
    }

    /**
     * Get tracking status string
     * @returns {string}
     */
    getTrackingStatus() {
        if (this.gone) {
            return 'gone';
        }

        if (!this.hasUpstream()) {
            return 'no upstream';
        }

        if (this.isInSync()) {
            return 'up to date';
        }

        const parts = [];
        if (this.ahead > 0) {
            parts.push(`ahead ${this.ahead}`);
        }
        if (this.behind > 0) {
            parts.push(`behind ${this.behind}`);
        }

        return parts.join(', ');
    }

    /**
     * Get short tracking status (for UI display)
     * @returns {string}
     */
    getShortTrackingStatus() {
        if (!this.hasUpstream()) {
            return '';
        }

        if (this.isInSync()) {
            return '✓';
        }

        const parts = [];
        if (this.ahead > 0) {
            parts.push(`↑${this.ahead}`);
        }
        if (this.behind > 0) {
            parts.push(`↓${this.behind}`);
        }

        return parts.join(' ');
    }

    /**
     * Get remote name from upstream
     * @returns {string|null}
     */
    getRemoteName() {
        if (!this.upstream) return null;

        const parts = this.upstream.split('/');
        return parts.length > 0 ? parts[0] : null;
    }

    /**
     * Get upstream branch name (without remote)
     * @returns {string|null}
     */
    getUpstreamBranchName() {
        if (!this.upstream) return null;

        const parts = this.upstream.split('/');
        return parts.length > 1 ? parts.slice(1).join('/') : this.upstream;
    }

    /**
     * Check if this is a local branch
     * @returns {boolean}
     */
    isLocal() {
        return !this.isRemote && !this.isTag;
    }

    /**
     * Get display name with current indicator
     * @returns {string}
     */
    getDisplayName() {
        return this.isCurrent ? `* ${this.name}` : `  ${this.name}`;
    }

    /**
     * Convert to string representation
     * @returns {string}
     */
    toString() {
        let str = this.getDisplayName();

        if (this.upstream) {
            str += ` [${this.upstream}`;
            if (this.ahead > 0 || this.behind > 0) {
                str += `: ${this.getTrackingStatus()}`;
            }
            str += ']';
        }

        return str;
    }

    /**
     * Convert to JSON representation
     * @returns {Object}
     */
    toJSON() {
        return {
            name: this.name,
            fullRef: this.fullRef,
            upstream: this.upstream,
            ahead: this.ahead,
            behind: this.behind,
            isCurrent: this.isCurrent,
            isRemote: this.isRemote,
            isTag: this.isTag,
            gone: this.gone,
            sha: this.sha,
            shortSha: this.shortSha,
            date: this.date,
            author: this.author,
            message: this.message
        };
    }
}

module.exports = { Branch };

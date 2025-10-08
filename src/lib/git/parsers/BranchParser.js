/**
 * BranchParser - Parser for git branch and git for-each-ref output
 *
 * Parses branch information including current branch, upstream tracking,
 * ahead/behind counts, and remote relationships.
 *
 * git branch formats:
 * --format='%(refname:short)|%(upstream:short)|%(upstream:track)'
 * Output: main|origin/main|[ahead 2, behind 1]
 *
 * git for-each-ref formats:
 * --format='%(refname:short)|%(upstream:short)|%(upstream:track)|%(objectname)|%(authordate:iso8601)'
 */

const { Branch } = require('../models/Branch');

class BranchParser {
    /**
     * Standard format string for git branch
     */
    static get BRANCH_FORMAT() {
        return '%(refname:short)|%(upstream:short)|%(upstream:track)|%(objectname:short)|%(committerdate:iso8601)';
    }

    /**
     * Format string for git for-each-ref
     */
    static get REF_FORMAT() {
        return '%(refname:short)|%(upstream:short)|%(upstream:track)|%(objectname)|%(authordate:iso8601)|%(authornname)|%(subject)';
    }

    /**
     * Parse git branch output with custom format
     *
     * @param {string} output - Raw output from git branch --format=...
     * @param {string} currentBranch - Name of current branch (from git branch --show-current)
     * @returns {Branch[]} Array of branch objects
     */
    static parse(output, currentBranch = null) {
        if (!output || !output.trim()) {
            return [];
        }

        const lines = output.trim().split('\n');
        const branches = [];

        for (const line of lines) {
            const parts = line.split('|');
            if (parts.length < 3) continue;

            const name = parts[0];
            const upstream = parts[1] || null;
            const track = parts[2] || null;
            const sha = parts[3] || null;
            const date = parts[4] || null;

            // Parse tracking info
            let ahead = 0;
            let behind = 0;

            if (track) {
                const aheadMatch = track.match(/ahead (\d+)/);
                const behindMatch = track.match(/behind (\d+)/);

                if (aheadMatch) {
                    ahead = parseInt(aheadMatch[1]);
                }
                if (behindMatch) {
                    behind = parseInt(behindMatch[1]);
                }
            }

            branches.push(new Branch({
                name,
                upstream,
                ahead,
                behind,
                isCurrent: name === currentBranch,
                sha,
                date
            }));
        }

        console.log(`[BranchParser] Parsed ${branches.length} branches, current: ${currentBranch}`);

        return branches;
    }

    /**
     * Parse simple git branch output (without format)
     *
     * Format:
     * * main
     *   develop
     *   feature/xyz
     *
     * @param {string} output - Raw output from git branch
     * @returns {Branch[]} Array of branch objects
     */
    static parseSimple(output) {
        if (!output || !output.trim()) {
            return [];
        }

        const lines = output.trim().split('\n');
        const branches = [];
        let currentBranch = null;

        for (const line of lines) {
            const isCurrent = line.startsWith('*');
            const name = line.substring(2).trim();

            if (isCurrent) {
                currentBranch = name;
            }

            branches.push(new Branch({
                name,
                isCurrent
            }));
        }

        return branches;
    }

    /**
     * Parse git branch -v (verbose) output
     *
     * Format:
     * * main    abc1234 Commit message
     *   develop def5678 Another commit
     *
     * @param {string} output - Raw output from git branch -v
     * @returns {Branch[]} Array of branch objects with commit info
     */
    static parseVerbose(output) {
        if (!output || !output.trim()) {
            return [];
        }

        const lines = output.trim().split('\n');
        const branches = [];

        for (const line of lines) {
            const isCurrent = line.startsWith('*');
            const content = line.substring(2).trim();

            // Parse: "name sha message"
            const match = content.match(/^(\S+)\s+([0-9a-f]+)\s+(.+)$/);
            if (match) {
                const name = match[1];
                const sha = match[2];
                const message = match[3];

                branches.push(new Branch({
                    name,
                    sha,
                    message,
                    isCurrent
                }));
            }
        }

        return branches;
    }

    /**
     * Parse git branch -vv (very verbose) output with upstream info
     *
     * Format:
     * * main    abc1234 [origin/main: ahead 2, behind 1] Commit message
     *   develop def5678 [origin/develop] Another commit
     *   feature ghi9012 No upstream
     *
     * @param {string} output - Raw output from git branch -vv
     * @returns {Branch[]} Array of branch objects with upstream info
     */
    static parseVeryVerbose(output) {
        if (!output || !output.trim()) {
            return [];
        }

        const lines = output.trim().split('\n');
        const branches = [];

        for (const line of lines) {
            const isCurrent = line.startsWith('*');
            const content = line.substring(2).trim();

            // Parse: "name sha [upstream: tracking] message" or "name sha message"
            const withUpstream = content.match(/^(\S+)\s+([0-9a-f]+)\s+\[([^\]]+)\]\s+(.+)$/);
            const withoutUpstream = content.match(/^(\S+)\s+([0-9a-f]+)\s+(.+)$/);

            if (withUpstream) {
                const name = withUpstream[1];
                const sha = withUpstream[2];
                const upstreamInfo = withUpstream[3];
                const message = withUpstream[4];

                // Parse upstream info: "origin/main: ahead 2, behind 1" or just "origin/main"
                const upstreamMatch = upstreamInfo.match(/^([^:]+)(?::\s*(.+))?$/);
                let upstream = null;
                let ahead = 0;
                let behind = 0;
                let gone = false;

                if (upstreamMatch) {
                    upstream = upstreamMatch[1];
                    const tracking = upstreamMatch[2];

                    if (tracking) {
                        if (tracking.includes('gone')) {
                            gone = true;
                        } else {
                            const aheadMatch = tracking.match(/ahead (\d+)/);
                            const behindMatch = tracking.match(/behind (\d+)/);

                            if (aheadMatch) {
                                ahead = parseInt(aheadMatch[1]);
                            }
                            if (behindMatch) {
                                behind = parseInt(behindMatch[1]);
                            }
                        }
                    }
                }

                branches.push(new Branch({
                    name,
                    sha,
                    message,
                    upstream,
                    ahead,
                    behind,
                    gone,
                    isCurrent
                }));
            } else if (withoutUpstream) {
                const name = withoutUpstream[1];
                const sha = withoutUpstream[2];
                const message = withoutUpstream[3];

                branches.push(new Branch({
                    name,
                    sha,
                    message,
                    isCurrent
                }));
            }
        }

        return branches;
    }

    /**
     * Parse git for-each-ref output
     *
     * @param {string} output - Raw output from git for-each-ref
     * @param {string} filter - Filter refs (e.g., 'refs/heads/' for local branches)
     * @returns {Branch[]} Array of branch/ref objects
     */
    static parseRefs(output, filter = 'refs/heads/') {
        if (!output || !output.trim()) {
            return [];
        }

        const lines = output.trim().split('\n');
        const branches = [];

        for (const line of lines) {
            const parts = line.split('|');
            if (parts.length < 3) continue;

            const fullRef = parts[0];
            const upstream = parts[1] || null;
            const track = parts[2] || null;
            const sha = parts[3] || null;
            const date = parts[4] || null;
            const author = parts[5] || null;
            const subject = parts[6] || null;

            // Extract short ref name
            const name = fullRef.startsWith(filter) ? fullRef.substring(filter.length) : fullRef;

            // Parse tracking
            let ahead = 0;
            let behind = 0;

            if (track) {
                const aheadMatch = track.match(/ahead (\d+)/);
                const behindMatch = track.match(/behind (\d+)/);

                if (aheadMatch) {
                    ahead = parseInt(aheadMatch[1]);
                }
                if (behindMatch) {
                    behind = parseInt(behindMatch[1]);
                }
            }

            // Determine if remote
            const isRemote = fullRef.startsWith('refs/remotes/');
            const isTag = fullRef.startsWith('refs/tags/');

            branches.push(new Branch({
                name,
                fullRef,
                upstream,
                ahead,
                behind,
                sha,
                date,
                author,
                message: subject,
                isRemote,
                isTag,
                isCurrent: false // Will be set separately
            }));
        }

        return branches;
    }

    /**
     * Extract tracking information from tracking string
     *
     * @param {string} track - Tracking string like "[ahead 2, behind 1]" or "gone"
     * @returns {Object} Tracking info object
     */
    static parseTracking(track) {
        const result = {
            ahead: 0,
            behind: 0,
            gone: false
        };

        if (!track) return result;

        if (track.includes('gone')) {
            result.gone = true;
            return result;
        }

        const aheadMatch = track.match(/ahead (\d+)/);
        const behindMatch = track.match(/behind (\d+)/);

        if (aheadMatch) {
            result.ahead = parseInt(aheadMatch[1]);
        }
        if (behindMatch) {
            result.behind = parseInt(behindMatch[1]);
        }

        return result;
    }

    /**
     * Filter branches by type
     *
     * @param {Branch[]} branches - Array of branches
     * @param {Object} filter - Filter criteria
     * @param {boolean} filter.local - Include local branches
     * @param {boolean} filter.remote - Include remote branches
     * @param {boolean} filter.current - Include only current branch
     * @returns {Branch[]} Filtered branches
     */
    static filterBranches(branches, filter) {
        return branches.filter(branch => {
            if (filter.current && !branch.isCurrent) return false;
            if (filter.local && branch.isRemote) return false;
            if (filter.remote && !branch.isRemote) return false;
            return true;
        });
    }

    /**
     * Get current branch from simple git branch output
     *
     * @param {string} output - Raw output from git branch
     * @returns {string|null} Current branch name
     */
    static getCurrentBranch(output) {
        if (!output || !output.trim()) {
            return null;
        }

        const lines = output.trim().split('\n');
        for (const line of lines) {
            if (line.startsWith('*')) {
                return line.substring(2).trim();
            }
        }

        return null;
    }
}

module.exports = { BranchParser };

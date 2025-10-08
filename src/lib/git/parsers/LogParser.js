/**
 * LogParser - Parser for git log output
 *
 * Parses git log with custom format strings to extract commit information.
 * Supports various log formats for different use cases.
 *
 * Common format placeholders:
 * %H - commit hash
 * %h - abbreviated commit hash
 * %P - parent hashes
 * %an - author name
 * %ae - author email
 * %ad - author date
 * %at - author date, UNIX timestamp
 * %cn - committer name
 * %ce - committer email
 * %cd - committer date
 * %ct - committer date, UNIX timestamp
 * %s - subject (commit message first line)
 * %b - body (commit message body)
 * %d - ref names (branches, tags)
 */

const { Commit } = require('../models/Commit');

class LogParser {
    /**
     * Standard format string for full commit information
     * Format: <hash>|<parents>|<author>|<email>|<timestamp>|<subject>|<body>
     */
    static get STANDARD_FORMAT() {
        return '%H|%P|%an|%ae|%at|%s|%b';
    }

    /**
     * Format string with ref names (branches/tags)
     * Format: <hash>|<parents>|<author>|<email>|<timestamp>|<refs>|<subject>|<body>
     */
    static get DECORATED_FORMAT() {
        return '%H|%P|%an|%ae|%at|%d|%s|%b';
    }

    /**
     * Delimiter for commit separation
     */
    static get COMMIT_DELIMITER() {
        return '---COMMIT---';
    }

    /**
     * Delimiter for message separation (between subject and body)
     */
    static get MESSAGE_DELIMITER() {
        return '---MESSAGE---';
    }

    /**
     * Parse git log output with standard format
     *
     * @param {string} output - Raw output from git log --format=...
     * @param {Object} options - Parse options
     * @param {boolean} options.includeRefs - Whether output includes ref names
     * @returns {Commit[]} Array of commit objects
     */
    static parse(output, options = {}) {
        if (!output || !output.trim()) {
            return [];
        }

        const commits = [];
        const commitSections = output.split(this.COMMIT_DELIMITER).filter(s => s.trim());

        for (const section of commitSections) {
            const lines = section.trim().split('\n');
            if (lines.length === 0) continue;

            const parts = lines[0].split('|');

            if (parts.length < 7) {
                console.warn('[LogParser] Invalid commit format:', lines[0]);
                continue;
            }

            let index = 0;
            const sha = parts[index++];
            const parents = parts[index++].split(' ').filter(p => p.trim());
            const author = parts[index++];
            const authorEmail = parts[index++];
            const authorTime = parseInt(parts[index++]);

            let refs = [];
            if (options.includeRefs) {
                // Parse refs like " (HEAD -> main, origin/main, tag: v1.0)"
                const refsString = parts[index++];
                if (refsString && refsString.trim()) {
                    refs = this.parseRefs(refsString);
                }
            }

            const subject = parts[index++];
            const bodyParts = parts.slice(index);
            const body = bodyParts.join('|').trim(); // Rejoin in case body contains |

            commits.push(new Commit({
                sha,
                parents,
                author,
                authorEmail,
                authorTime,
                subject,
                body,
                refs
            }));
        }

        console.log(`[LogParser] Parsed ${commits.length} commits`);

        return commits;
    }

    /**
     * Parse ref names from decorated format
     *
     * @param {string} refsString - Ref string like " (HEAD -> main, origin/main, tag: v1.0)"
     * @returns {Array<Object>} Array of ref objects
     */
    static parseRefs(refsString) {
        const refs = [];
        const cleaned = refsString.replace(/^\s*\(|\)\s*$/g, ''); // Remove outer parentheses

        if (!cleaned) return refs;

        const refParts = cleaned.split(',').map(r => r.trim());

        for (const refPart of refParts) {
            if (refPart.startsWith('HEAD -> ')) {
                // Current branch
                const branchName = refPart.substring(8);
                refs.push({ type: 'head', name: branchName });
                refs.push({ type: 'branch', name: branchName });
            } else if (refPart.startsWith('tag: ')) {
                // Tag
                const tagName = refPart.substring(5);
                refs.push({ type: 'tag', name: tagName });
            } else if (refPart.includes('/')) {
                // Remote branch
                refs.push({ type: 'remote', name: refPart });
            } else {
                // Local branch
                refs.push({ type: 'branch', name: refPart });
            }
        }

        return refs;
    }

    /**
     * Parse oneline format (abbreviated)
     *
     * Format: <short-hash> <subject>
     *
     * @param {string} output - Raw output from git log --oneline
     * @returns {Array<Object>} Array of simple commit objects
     */
    static parseOneline(output) {
        if (!output || !output.trim()) {
            return [];
        }

        const commits = [];
        const lines = output.trim().split('\n');

        for (const line of lines) {
            const match = line.match(/^([0-9a-f]+)\s+(.+)$/);
            if (match) {
                commits.push({
                    sha: match[1],
                    subject: match[2]
                });
            }
        }

        return commits;
    }

    /**
     * Parse graph format output
     *
     * This format includes graph characters for visualizing branches.
     *
     * @param {string} output - Raw output from git log --graph --oneline
     * @returns {Array<Object>} Array of commit objects with graph data
     */
    static parseGraph(output) {
        if (!output || !output.trim()) {
            return [];
        }

        const commits = [];
        const lines = output.trim().split('\n');

        for (const line of lines) {
            // Extract graph characters and commit info
            // Graph chars: |, *, /, \, etc.
            const graphMatch = line.match(/^([|\*\/\\\s-]+?)([0-9a-f]+)\s+(.+)$/);
            if (graphMatch) {
                commits.push({
                    graph: graphMatch[1],
                    sha: graphMatch[2],
                    subject: graphMatch[3]
                });
            }
        }

        return commits;
    }

    /**
     * Get the format string to use with git log
     *
     * @param {Object} options - Format options
     * @param {boolean} options.includeRefs - Include ref names
     * @param {boolean} options.includeFiles - Include file statistics
     * @returns {string} Format string for git log --format
     */
    static getFormatString(options = {}) {
        let format = this.COMMIT_DELIMITER + '\n';

        if (options.includeRefs) {
            format += this.DECORATED_FORMAT;
        } else {
            format += this.STANDARD_FORMAT;
        }

        return format;
    }

    /**
     * Parse git log with --stat (file statistics)
     *
     * @param {string} output - Raw output from git log --stat
     * @returns {Array<Object>} Array of commits with file stats
     */
    static parseWithStats(output) {
        // This is more complex as it combines commit info with file stats
        // For now, return basic structure
        // TODO: Implement full stat parsing if needed
        return this.parse(output);
    }

    /**
     * Parse file changes from log output with --name-status
     *
     * @param {string} output - Raw output from git log --name-status
     * @returns {Commit[]} Commits with file changes
     */
    static parseWithFileChanges(output) {
        if (!output || !output.trim()) {
            return [];
        }

        const commits = [];
        const sections = output.split(this.COMMIT_DELIMITER).filter(s => s.trim());

        for (const section of sections) {
            const lines = section.trim().split('\n');
            if (lines.length === 0) continue;

            // First line is commit info
            const parts = lines[0].split('|');
            if (parts.length < 7) continue;

            const sha = parts[0];
            const parents = parts[1].split(' ').filter(p => p.trim());
            const author = parts[2];
            const authorEmail = parts[3];
            const authorTime = parseInt(parts[4]);
            const subject = parts[5];
            const body = parts.slice(6).join('|').trim();

            // Remaining lines are file changes
            const files = [];
            for (let i = 1; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue;

                // Format: M\tpath/to/file or R100\told/path\tnew/path
                const fileParts = line.split('\t');
                if (fileParts.length >= 2) {
                    const status = fileParts[0];
                    const statusChar = status[0];

                    let changeType, path, oldPath;

                    switch (statusChar) {
                        case 'A':
                            changeType = 'added';
                            path = fileParts[1];
                            break;
                        case 'M':
                            changeType = 'modified';
                            path = fileParts[1];
                            break;
                        case 'D':
                            changeType = 'deleted';
                            path = fileParts[1];
                            break;
                        case 'R':
                            changeType = 'renamed';
                            oldPath = fileParts[1];
                            path = fileParts[2];
                            break;
                        case 'C':
                            changeType = 'copied';
                            oldPath = fileParts[1];
                            path = fileParts[2];
                            break;
                        default:
                            changeType = 'unknown';
                            path = fileParts[1];
                    }

                    files.push({
                        changeType,
                        path,
                        oldPath,
                        status
                    });
                }
            }

            commits.push(new Commit({
                sha,
                parents,
                author,
                authorEmail,
                authorTime,
                subject,
                body,
                files
            }));
        }

        return commits;
    }

    /**
     * Extract commit SHAs from log output
     *
     * @param {string} output - Any git log output
     * @returns {string[]} Array of commit SHAs
     */
    static extractShas(output) {
        const shas = [];
        const shaRegex = /\b[0-9a-f]{40}\b/g;
        let match;

        while ((match = shaRegex.exec(output)) !== null) {
            if (!shas.includes(match[0])) {
                shas.push(match[0]);
            }
        }

        return shas;
    }

    /**
     * Count total commits in log output
     *
     * @param {string} output - Git log output with delimiter
     * @returns {number} Number of commits
     */
    static countCommits(output) {
        if (!output || !output.trim()) {
            return 0;
        }

        return output.split(this.COMMIT_DELIMITER).filter(s => s.trim()).length;
    }
}

module.exports = { LogParser };

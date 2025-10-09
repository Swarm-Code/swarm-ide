/**
 * StatusParser - Parser for git status output
 *
 * Parses git status --porcelain=v2 output which provides detailed file status information.
 * Also supports v1 porcelain format for compatibility.
 *
 * Porcelain v2 format:
 * # branch.oid <commit>
 * # branch.head <branch>
 * # branch.upstream <upstream>
 * # branch.ab +<ahead> -<behind>
 * 1 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <path>
 * 2 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <X><score> <path><sep><origPath>
 * u <XY> <sub> <m1> <m2> <m3> <mW> <h1> <h2> <h3> <path>
 * ? <path>
 * ! <path>
 *
 * XY status codes:
 * . = unmodified
 * M = modified
 * T = file type changed
 * A = added
 * D = deleted
 * R = renamed
 * C = copied
 * U = updated but unmerged
 */

const { FileStatus } = require('../models/FileStatus');
const logger = require('../../../utils/Logger');

class StatusParser {
    /**
     * Parse git status --porcelain=v2 output
     *
     * @param {string} output - Raw output from git status --porcelain=v2
     * @returns {Object} Status object with branch info and file statuses
     */
    static parseV2(output) {
        if (!output || !output.trim()) {
            return {
                branch: null,
                upstream: null,
                ahead: 0,
                behind: 0,
                files: []
            };
        }

        const lines = output.trim().split('\n');
        const result = {
            branch: null,
            upstream: null,
            ahead: 0,
            behind: 0,
            oid: null,
            files: []
        };

        for (const line of lines) {
            // Branch information
            if (line.startsWith('# branch.oid ')) {
                result.oid = line.substring(13);
            } else if (line.startsWith('# branch.head ')) {
                result.branch = line.substring(14);
            } else if (line.startsWith('# branch.upstream ')) {
                result.upstream = line.substring(18);
            } else if (line.startsWith('# branch.ab ')) {
                const ab = line.substring(12);
                const match = ab.match(/\+(\d+) -(\d+)/);
                if (match) {
                    result.ahead = parseInt(match[1]);
                    result.behind = parseInt(match[2]);
                }
            }
            // Ordinary changed entries
            else if (line.startsWith('1 ')) {
                const parts = line.split(' ');
                if (parts.length >= 9) {
                    const xy = parts[1];
                    const path = parts.slice(8).join(' ');

                    result.files.push(new FileStatus({
                        path,
                        indexStatus: xy[0],
                        workingTreeStatus: xy[1],
                        isStaged: xy[0] !== '.',
                        isUntracked: false
                    }));
                }
            }
            // Renamed or copied entries
            else if (line.startsWith('2 ')) {
                const parts = line.split(' ');
                if (parts.length >= 10) {
                    const xy = parts[1];
                    const score = parts[8];
                    const paths = parts.slice(9).join(' ').split('\t');
                    const path = paths[0];
                    const origPath = paths[1] || path;

                    result.files.push(new FileStatus({
                        path,
                        oldPath: origPath,
                        indexStatus: xy[0],
                        workingTreeStatus: xy[1],
                        isStaged: xy[0] !== '.',
                        isRenamed: xy[0] === 'R' || xy[1] === 'R',
                        isCopied: xy[0] === 'C' || xy[1] === 'C',
                        similarity: parseInt(score.substring(1))
                    }));
                }
            }
            // Unmerged entries
            else if (line.startsWith('u ')) {
                const parts = line.split(' ');
                if (parts.length >= 11) {
                    const xy = parts[1];
                    const path = parts.slice(10).join(' ');

                    result.files.push(new FileStatus({
                        path,
                        indexStatus: xy[0],
                        workingTreeStatus: xy[1],
                        isUnmerged: true,
                        isStaged: false
                    }));
                }
            }
            // Untracked files
            else if (line.startsWith('? ')) {
                const path = line.substring(2);
                result.files.push(new FileStatus({
                    path,
                    indexStatus: '?',
                    workingTreeStatus: '?',
                    isUntracked: true,
                    isStaged: false
                }));
            }
            // Ignored files
            else if (line.startsWith('! ')) {
                const path = line.substring(2);
                result.files.push(new FileStatus({
                    path,
                    indexStatus: '!',
                    workingTreeStatus: '!',
                    isIgnored: true,
                    isStaged: false
                }));
            }
        }

        logger.debug('gitStatus', `Parsed v2: ${result.files.length} files, branch: ${result.branch}`);

        return result;
    }

    /**
     * Parse git status --porcelain (v1) output
     *
     * Format: XY path
     * Where X is index status and Y is working tree status
     *
     * @param {string} output - Raw output from git status --porcelain
     * @returns {Object} Status object with file statuses
     */
    static parseV1(output) {
        if (!output || !output.trim()) {
            return {
                files: []
            };
        }

        const lines = output.trim().split('\n');
        const files = [];

        for (const line of lines) {
            if (line.length < 4) continue;

            const indexStatus = line[0];
            const workingTreeStatus = line[1];
            let path = line.substring(3);

            // Handle renames: "R  old -> new" or "R  old\0new"
            let oldPath = null;
            if (indexStatus === 'R' || workingTreeStatus === 'R') {
                const renameMatch = path.match(/(.+?)\s+->\s+(.+)/);
                if (renameMatch) {
                    oldPath = renameMatch[1];
                    path = renameMatch[2];
                }
            }

            files.push(new FileStatus({
                path,
                oldPath,
                indexStatus,
                workingTreeStatus,
                isStaged: indexStatus !== ' ' && indexStatus !== '?',
                isUntracked: indexStatus === '?' && workingTreeStatus === '?',
                isRenamed: indexStatus === 'R' || workingTreeStatus === 'R',
                isCopied: indexStatus === 'C' || workingTreeStatus === 'C',
                isUnmerged: ['D', 'A', 'U'].includes(indexStatus) && ['D', 'A', 'U'].includes(workingTreeStatus)
            }));
        }

        logger.debug('gitStatus', `Parsed v1: ${files.length} files`);

        return { files };
    }

    /**
     * Parse short status output
     *
     * @param {string} output - Raw output from git status --short
     * @returns {Object} Status object with file statuses
     */
    static parseShort(output) {
        // Short format is same as porcelain v1
        return this.parseV1(output);
    }

    /**
     * Get human-readable status description
     *
     * @param {string} indexStatus - Index status character
     * @param {string} workingTreeStatus - Working tree status character
     * @returns {string} Human-readable description
     */
    static getStatusDescription(indexStatus, workingTreeStatus) {
        // Untracked
        if (indexStatus === '?' && workingTreeStatus === '?') {
            return 'Untracked';
        }

        // Ignored
        if (indexStatus === '!' && workingTreeStatus === '!') {
            return 'Ignored';
        }

        const descriptions = [];

        // Index status
        switch (indexStatus) {
            case 'M':
                descriptions.push('Staged modification');
                break;
            case 'A':
                descriptions.push('Staged addition');
                break;
            case 'D':
                descriptions.push('Staged deletion');
                break;
            case 'R':
                descriptions.push('Staged rename');
                break;
            case 'C':
                descriptions.push('Staged copy');
                break;
            case 'U':
                descriptions.push('Unmerged');
                break;
        }

        // Working tree status
        switch (workingTreeStatus) {
            case 'M':
                descriptions.push('Modified');
                break;
            case 'D':
                descriptions.push('Deleted');
                break;
            case 'A':
                descriptions.push('Added');
                break;
            case 'R':
                descriptions.push('Renamed');
                break;
            case 'C':
                descriptions.push('Copied');
                break;
            case 'U':
                descriptions.push('Unmerged');
                break;
        }

        return descriptions.length > 0 ? descriptions.join(', ') : 'Unmodified';
    }

    /**
     * Filter files by status
     *
     * @param {FileStatus[]} files - Array of file statuses
     * @param {Object} filter - Filter criteria
     * @param {boolean} filter.staged - Include staged files
     * @param {boolean} filter.unstaged - Include unstaged files
     * @param {boolean} filter.untracked - Include untracked files
     * @param {boolean} filter.ignored - Include ignored files
     * @returns {FileStatus[]} Filtered files
     */
    static filterFiles(files, filter) {
        return files.filter(file => {
            if (filter.staged && file.isStaged) return true;
            if (filter.unstaged && !file.isStaged && !file.isUntracked) return true;
            if (filter.untracked && file.isUntracked) return true;
            if (filter.ignored && file.isIgnored) return true;
            return false;
        });
    }

    /**
     * Group files by status
     *
     * @param {FileStatus[]} files - Array of file statuses
     * @returns {Object} Files grouped by category
     */
    static groupByStatus(files) {
        const groups = {
            staged: [],
            unstaged: [],
            untracked: [],
            unmerged: [],
            ignored: []
        };

        for (const file of files) {
            if (file.isUnmerged) {
                groups.unmerged.push(file);
            } else if (file.isStaged) {
                groups.staged.push(file);
            } else if (file.isUntracked) {
                groups.untracked.push(file);
            } else if (file.isIgnored) {
                groups.ignored.push(file);
            } else {
                groups.unstaged.push(file);
            }
        }

        return groups;
    }
}

module.exports = { StatusParser };

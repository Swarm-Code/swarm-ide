/**
 * DiffParser - Parser for git diff output
 *
 * Parses unified diff format which is the standard output from git diff.
 * Extracts file paths, change types, and diff hunks with line-level changes.
 *
 * Unified diff format structure:
 * diff --git a/file.txt b/file.txt
 * index abc123..def456 100644
 * --- a/file.txt
 * +++ b/file.txt
 * @@ -1,3 +1,4 @@ optional context
 * -removed line
 * +added line
 *  unchanged line
 * \ No newline at end of file
 *
 * Change types:
 * - new file mode 100644 (file added)
 * - deleted file mode 100644 (file deleted)
 * - rename from/to (file renamed)
 * - (default: modified)
 */

const { Diff } = require('../models/Diff');
const { Hunk } = require('../models/Hunk');

class DiffParser {
    /**
     * Parse git diff output into Diff objects
     *
     * @param {string} output - Raw output from git diff
     * @returns {Diff[]} Array of diff objects, one per file
     */
    static parse(output) {
        if (!output || !output.trim()) {
            return [];
        }

        const lines = output.split('\n');
        const diffs = [];
        let currentDiff = null;
        let currentHunk = null;
        let lineIndex = 0;

        while (lineIndex < lines.length) {
            const line = lines[lineIndex];

            // New diff starts with "diff --git"
            if (line.startsWith('diff --git ')) {
                // Save previous diff if any
                if (currentDiff) {
                    if (currentHunk) {
                        currentDiff.addHunk(currentHunk);
                        currentHunk = null;
                    }
                    diffs.push(currentDiff);
                }

                // Parse file paths from "diff --git a/path b/path"
                const match = line.match(/^diff --git a\/(.+?) b\/(.+?)$/);
                if (match) {
                    const oldPath = match[1];
                    const newPath = match[2];

                    currentDiff = new Diff({
                        oldPath,
                        newPath,
                        changeType: 'modified', // Default, will be updated if we see other indicators
                        hunks: []
                    });
                }

                lineIndex++;
                continue;
            }

            if (!currentDiff) {
                lineIndex++;
                continue;
            }

            // Change type indicators
            if (line.startsWith('new file mode ')) {
                currentDiff.changeType = 'added';
                currentDiff.mode = line.substring(14);
                lineIndex++;
                continue;
            }

            if (line.startsWith('deleted file mode ')) {
                currentDiff.changeType = 'deleted';
                currentDiff.mode = line.substring(18);
                lineIndex++;
                continue;
            }

            if (line.startsWith('rename from ')) {
                currentDiff.changeType = 'renamed';
                currentDiff.oldPath = line.substring(12);
                lineIndex++;
                continue;
            }

            if (line.startsWith('rename to ')) {
                currentDiff.newPath = line.substring(10);
                lineIndex++;
                continue;
            }

            if (line.startsWith('copy from ')) {
                currentDiff.changeType = 'copied';
                currentDiff.oldPath = line.substring(10);
                lineIndex++;
                continue;
            }

            if (line.startsWith('copy to ')) {
                currentDiff.newPath = line.substring(8);
                lineIndex++;
                continue;
            }

            // Index line (contains file hashes)
            if (line.startsWith('index ')) {
                const indexMatch = line.match(/^index ([0-9a-f]+)\.\.([0-9a-f]+)( (\d+))?$/);
                if (indexMatch) {
                    currentDiff.oldHash = indexMatch[1];
                    currentDiff.newHash = indexMatch[2];
                    currentDiff.mode = indexMatch[4];
                }
                lineIndex++;
                continue;
            }

            // File path lines (--- and +++)
            if (line.startsWith('--- ')) {
                // Skip, we already have the path
                lineIndex++;
                continue;
            }

            if (line.startsWith('+++ ')) {
                // Skip, we already have the path
                lineIndex++;
                continue;
            }

            // Hunk header: @@ -oldStart,oldLines +newStart,newLines @@ optional context
            if (line.startsWith('@@')) {
                // Save previous hunk if any
                if (currentHunk) {
                    currentDiff.addHunk(currentHunk);
                }

                const hunkMatch = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/);
                if (hunkMatch) {
                    const oldStart = parseInt(hunkMatch[1]);
                    const oldLines = hunkMatch[2] ? parseInt(hunkMatch[2]) : 1;
                    const newStart = parseInt(hunkMatch[3]);
                    const newLines = hunkMatch[4] ? parseInt(hunkMatch[4]) : 1;
                    const context = hunkMatch[5].trim();

                    currentHunk = new Hunk({
                        oldStart,
                        oldLines,
                        newStart,
                        newLines,
                        header: line,
                        context,
                        lines: []
                    });
                }

                lineIndex++;
                continue;
            }

            // Hunk content lines
            if (currentHunk) {
                if (line.startsWith('+')) {
                    currentHunk.addLine('added', line.substring(1));
                } else if (line.startsWith('-')) {
                    currentHunk.addLine('removed', line.substring(1));
                } else if (line.startsWith(' ')) {
                    currentHunk.addLine('unchanged', line.substring(1));
                } else if (line.startsWith('\\')) {
                    // "\ No newline at end of file" marker
                    currentHunk.addLine('noeol', line.substring(1).trim());
                } else {
                    // Unknown line type, treat as context
                    if (line.trim()) {
                        currentHunk.addLine('unchanged', line);
                    }
                }
            }

            lineIndex++;
        }

        // Save last diff
        if (currentDiff) {
            if (currentHunk) {
                currentDiff.addHunk(currentHunk);
            }
            diffs.push(currentDiff);
        }

        console.log(`[DiffParser] Parsed ${diffs.length} diffs with ${diffs.reduce((sum, d) => sum + d.hunks.length, 0)} total hunks`);

        return diffs;
    }

    /**
     * Parse git diff --stat output for file statistics
     *
     * Format:
     * path/to/file.txt | 10 +++++-----
     * 1 file changed, 5 insertions(+), 5 deletions(-)
     *
     * @param {string} output - Raw output from git diff --stat
     * @returns {Array<Object>} Array of file statistics
     */
    static parseStats(output) {
        const lines = output.trim().split('\n');
        const stats = [];

        for (let i = 0; i < lines.length - 1; i++) { // Skip last summary line
            const line = lines[i];
            const match = line.match(/^\s*(.+?)\s*\|\s*(\d+)\s*([\+\-]+)?$/);

            if (match) {
                const path = match[1].trim();
                const changes = parseInt(match[2]);
                const visual = match[3] || '';
                const additions = (visual.match(/\+/g) || []).length;
                const deletions = (visual.match(/-/g) || []).length;

                stats.push({
                    path,
                    changes,
                    additions,
                    deletions
                });
            }
        }

        return stats;
    }

    /**
     * Parse git diff --numstat output for numeric statistics
     *
     * Format:
     * 5\t5\tpath/to/file.txt
     * -\t-\tbinary-file.png
     *
     * @param {string} output - Raw output from git diff --numstat
     * @returns {Array<Object>} Array of file statistics
     */
    static parseNumstat(output) {
        const lines = output.trim().split('\n');
        const stats = [];

        for (const line of lines) {
            if (!line.trim()) continue;

            const parts = line.split('\t');
            if (parts.length >= 3) {
                const additions = parts[0] === '-' ? null : parseInt(parts[0]);
                const deletions = parts[1] === '-' ? null : parseInt(parts[1]);
                const path = parts.slice(2).join('\t'); // Handle paths with tabs

                stats.push({
                    path,
                    additions,
                    deletions,
                    binary: additions === null && deletions === null
                });
            }
        }

        return stats;
    }

    /**
     * Parse git diff --name-status output
     *
     * Format:
     * A\tpath/to/added.txt
     * M\tpath/to/modified.txt
     * D\tpath/to/deleted.txt
     * R100\told/path.txt\tnew/path.txt
     *
     * @param {string} output - Raw output from git diff --name-status
     * @returns {Array<Object>} Array of file status objects
     */
    static parseNameStatus(output) {
        const lines = output.trim().split('\n');
        const statuses = [];

        for (const line of lines) {
            if (!line.trim()) continue;

            const parts = line.split('\t');
            const status = parts[0];
            const statusChar = status[0];

            let changeType, oldPath, newPath;

            switch (statusChar) {
                case 'A':
                    changeType = 'added';
                    newPath = parts[1];
                    oldPath = null;
                    break;
                case 'M':
                    changeType = 'modified';
                    newPath = parts[1];
                    oldPath = parts[1];
                    break;
                case 'D':
                    changeType = 'deleted';
                    oldPath = parts[1];
                    newPath = null;
                    break;
                case 'R':
                    changeType = 'renamed';
                    oldPath = parts[1];
                    newPath = parts[2];
                    break;
                case 'C':
                    changeType = 'copied';
                    oldPath = parts[1];
                    newPath = parts[2];
                    break;
                case 'T':
                    changeType = 'typechange';
                    newPath = parts[1];
                    oldPath = parts[1];
                    break;
                default:
                    changeType = 'unknown';
                    newPath = parts[1];
                    oldPath = parts[1];
            }

            statuses.push({
                changeType,
                oldPath,
                newPath,
                status
            });
        }

        return statuses;
    }

    /**
     * Extract changed line numbers from a diff
     *
     * @param {Diff} diff - Diff object to analyze
     * @returns {Object} Object with added and removed line numbers
     */
    static getChangedLines(diff) {
        const added = new Set();
        const removed = new Set();
        const modified = new Set();

        for (const hunk of diff.hunks) {
            let newLineNum = hunk.newStart;
            let oldLineNum = hunk.oldStart;

            for (const line of hunk.lines) {
                if (line.type === 'added') {
                    added.add(newLineNum);
                    modified.add(newLineNum);
                    newLineNum++;
                } else if (line.type === 'removed') {
                    removed.add(oldLineNum);
                    oldLineNum++;
                } else if (line.type === 'unchanged') {
                    newLineNum++;
                    oldLineNum++;
                }
            }
        }

        return {
            added: Array.from(added).sort((a, b) => a - b),
            removed: Array.from(removed).sort((a, b) => a - b),
            modified: Array.from(modified).sort((a, b) => a - b)
        };
    }

    /**
     * Create a line-to-hunk map for quick lookup
     *
     * @param {Diff} diff - Diff object to analyze
     * @returns {Map<number, Hunk>} Map of new file line number to hunk
     */
    static createLineToHunkMap(diff) {
        const lineMap = new Map();

        for (const hunk of diff.hunks) {
            let lineNum = hunk.newStart;

            for (const line of hunk.lines) {
                if (line.type === 'added' || line.type === 'unchanged') {
                    lineMap.set(lineNum, hunk);
                    lineNum++;
                }
            }
        }

        return lineMap;
    }
}

module.exports = { DiffParser };

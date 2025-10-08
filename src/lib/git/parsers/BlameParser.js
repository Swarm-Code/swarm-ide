/**
 * BlameParser - Parser for git blame --incremental output
 *
 * Parses the incremental blame format which provides progressive blame information.
 * This format is optimal for streaming large files as it provides data line-by-line.
 *
 * Incremental format structure:
 * <sha> <sourceline> <resultline> <num_lines>
 * author <author name>
 * author-mail <<email>>
 * author-time <unix-timestamp>
 * author-tz <timezone>
 * committer <committer name>
 * committer-mail <<email>>
 * committer-time <unix-timestamp>
 * committer-tz <timezone>
 * summary <commit summary>
 * previous <previous-sha> <previous-filename>
 * filename <filename>
 *     <actual line content with tab prefix>
 *
 * For lines already seen in the same commit, only the header line appears:
 * <sha> <sourceline> <resultline> <num_lines>
 *     <actual line content>
 */

const { BlameEntry } = require('../models/BlameEntry');

class BlameParser {
    /**
     * Parse git blame --incremental output into BlameEntry objects
     *
     * @param {string} output - Raw output from git blame --incremental
     * @returns {BlameEntry[]} Array of blame entries sorted by line start
     */
    static parse(output) {
        const lines = output.split('\n');
        const entries = [];
        const commitCache = new Map(); // Cache commit metadata by SHA

        let currentEntry = null;
        let lineIndex = 0;

        while (lineIndex < lines.length) {
            const line = lines[lineIndex];

            // Skip empty lines
            if (!line.trim()) {
                lineIndex++;
                continue;
            }

            // Check if this is a header line (SHA sourceline resultline num_lines)
            const headerMatch = line.match(/^([0-9a-f]{40}) (\d+) (\d+) (\d+)$/);
            if (headerMatch) {
                const [, sha, sourceLine, resultLine, numLines] = headerMatch;
                const lineStart = parseInt(resultLine);
                const lineEnd = lineStart + parseInt(numLines) - 1;

                // Check if we've seen this commit before
                const cachedCommit = commitCache.get(sha);

                if (cachedCommit) {
                    // We've seen this commit, create entry from cache
                    currentEntry = new BlameEntry({
                        sha,
                        lineStart,
                        lineEnd,
                        ...cachedCommit
                    });
                    entries.push(currentEntry);

                    // Skip to next header (the actual line content follows)
                    lineIndex++;
                    // Skip the line content if present
                    if (lineIndex < lines.length && lines[lineIndex].startsWith('\t')) {
                        lineIndex++;
                    }
                } else {
                    // New commit, parse metadata
                    const metadata = {
                        sha,
                        lineStart,
                        lineEnd
                    };

                    lineIndex++;

                    // Parse metadata lines
                    while (lineIndex < lines.length) {
                        const metaLine = lines[lineIndex];

                        // If we hit a tab-prefixed line, it's the actual content
                        if (metaLine.startsWith('\t')) {
                            lineIndex++; // Skip the content line
                            break;
                        }

                        // Parse metadata fields
                        if (metaLine.startsWith('author ')) {
                            metadata.author = metaLine.substring(7);
                        } else if (metaLine.startsWith('author-mail ')) {
                            // Email is in format <email@example.com>, remove brackets
                            metadata.authorMail = metaLine.substring(12).replace(/^<|>$/g, '');
                        } else if (metaLine.startsWith('author-time ')) {
                            metadata.authorTime = parseInt(metaLine.substring(12));
                        } else if (metaLine.startsWith('author-tz ')) {
                            metadata.authorTz = metaLine.substring(10);
                        } else if (metaLine.startsWith('committer ')) {
                            metadata.committer = metaLine.substring(10);
                        } else if (metaLine.startsWith('committer-mail ')) {
                            metadata.committerMail = metaLine.substring(15).replace(/^<|>$/g, '');
                        } else if (metaLine.startsWith('committer-time ')) {
                            metadata.committerTime = parseInt(metaLine.substring(15));
                        } else if (metaLine.startsWith('committer-tz ')) {
                            metadata.committerTz = metaLine.substring(13);
                        } else if (metaLine.startsWith('summary ')) {
                            metadata.summary = metaLine.substring(8);
                        } else if (metaLine.startsWith('previous ')) {
                            const prevParts = metaLine.substring(9).split(' ');
                            metadata.previousSha = prevParts[0];
                            metadata.previousFilename = prevParts.slice(1).join(' ');
                        } else if (metaLine.startsWith('filename ')) {
                            metadata.filename = metaLine.substring(9);
                        } else if (metaLine.startsWith('boundary')) {
                            metadata.boundary = true;
                        }

                        lineIndex++;
                    }

                    // Cache this commit's metadata
                    commitCache.set(sha, {
                        author: metadata.author,
                        authorMail: metadata.authorMail,
                        authorTime: metadata.authorTime,
                        authorTz: metadata.authorTz,
                        committer: metadata.committer,
                        committerMail: metadata.committerMail,
                        committerTime: metadata.committerTime,
                        committerTz: metadata.committerTz,
                        summary: metadata.summary,
                        previousSha: metadata.previousSha,
                        previousFilename: metadata.previousFilename,
                        filename: metadata.filename,
                        boundary: metadata.boundary
                    });

                    // Create the entry
                    currentEntry = new BlameEntry(metadata);
                    entries.push(currentEntry);
                }
            } else {
                // Unexpected format, skip this line
                console.warn(`[BlameParser] Unexpected line format: ${line}`);
                lineIndex++;
            }
        }

        console.log(`[BlameParser] Parsed ${entries.length} blame entries from ${commitCache.size} unique commits`);

        return entries;
    }

    /**
     * Parse git blame --incremental output incrementally (streaming)
     *
     * This is useful for large files where you want to process blame data as it arrives.
     *
     * @param {Function} onEntry - Callback for each parsed entry: (BlameEntry) => void
     * @returns {Object} Parser state with addLine(line) method
     */
    static createStreamParser(onEntry) {
        const commitCache = new Map();
        let buffer = '';
        let currentMetadata = null;
        let parsingMetadata = false;

        return {
            /**
             * Add a line of output to the parser
             * @param {string} line - Single line of git blame output
             */
            addLine(line) {
                // Check if this is a header line
                const headerMatch = line.match(/^([0-9a-f]{40}) (\d+) (\d+) (\d+)$/);

                if (headerMatch) {
                    const [, sha, sourceLine, resultLine, numLines] = headerMatch;
                    const lineStart = parseInt(resultLine);
                    const lineEnd = lineStart + parseInt(numLines) - 1;

                    const cachedCommit = commitCache.get(sha);

                    if (cachedCommit) {
                        // Create entry from cache
                        const entry = new BlameEntry({
                            sha,
                            lineStart,
                            lineEnd,
                            ...cachedCommit
                        });
                        onEntry(entry);
                        parsingMetadata = false;
                    } else {
                        // Start parsing new commit metadata
                        currentMetadata = {
                            sha,
                            lineStart,
                            lineEnd
                        };
                        parsingMetadata = true;
                    }
                } else if (parsingMetadata) {
                    // Parse metadata field
                    if (line.startsWith('\t')) {
                        // End of metadata, emit entry
                        commitCache.set(currentMetadata.sha, {
                            author: currentMetadata.author,
                            authorMail: currentMetadata.authorMail,
                            authorTime: currentMetadata.authorTime,
                            authorTz: currentMetadata.authorTz,
                            committer: currentMetadata.committer,
                            committerMail: currentMetadata.committerMail,
                            committerTime: currentMetadata.committerTime,
                            committerTz: currentMetadata.committerTz,
                            summary: currentMetadata.summary,
                            previousSha: currentMetadata.previousSha,
                            previousFilename: currentMetadata.previousFilename,
                            filename: currentMetadata.filename,
                            boundary: currentMetadata.boundary
                        });

                        const entry = new BlameEntry(currentMetadata);
                        onEntry(entry);

                        parsingMetadata = false;
                        currentMetadata = null;
                    } else {
                        // Parse metadata field
                        if (line.startsWith('author ')) {
                            currentMetadata.author = line.substring(7);
                        } else if (line.startsWith('author-mail ')) {
                            currentMetadata.authorMail = line.substring(12).replace(/^<|>$/g, '');
                        } else if (line.startsWith('author-time ')) {
                            currentMetadata.authorTime = parseInt(line.substring(12));
                        } else if (line.startsWith('author-tz ')) {
                            currentMetadata.authorTz = line.substring(10);
                        } else if (line.startsWith('committer ')) {
                            currentMetadata.committer = line.substring(10);
                        } else if (line.startsWith('committer-mail ')) {
                            currentMetadata.committerMail = line.substring(15).replace(/^<|>$/g, '');
                        } else if (line.startsWith('committer-time ')) {
                            currentMetadata.committerTime = parseInt(line.substring(15));
                        } else if (line.startsWith('committer-tz ')) {
                            currentMetadata.committerTz = line.substring(13);
                        } else if (line.startsWith('summary ')) {
                            currentMetadata.summary = line.substring(8);
                        } else if (line.startsWith('previous ')) {
                            const prevParts = line.substring(9).split(' ');
                            currentMetadata.previousSha = prevParts[0];
                            currentMetadata.previousFilename = prevParts.slice(1).join(' ');
                        } else if (line.startsWith('filename ')) {
                            currentMetadata.filename = line.substring(9);
                        } else if (line.startsWith('boundary')) {
                            currentMetadata.boundary = true;
                        }
                    }
                }
            },

            /**
             * Get cache statistics
             * @returns {Object} Statistics about the parser state
             */
            getStats() {
                return {
                    uniqueCommits: commitCache.size,
                    parsingMetadata: parsingMetadata
                };
            }
        };
    }

    /**
     * Parse porcelain format blame output (git blame --porcelain)
     *
     * Porcelain format is more structured than incremental but less efficient for streaming.
     *
     * @param {string} output - Raw output from git blame --porcelain
     * @returns {BlameEntry[]} Array of blame entries
     */
    static parsePorcelain(output) {
        // Similar to incremental but with slightly different format
        // For now, we'll use the incremental parser as they're compatible
        return this.parse(output);
    }

    /**
     * Convert blame entries into a line-indexed map
     *
     * @param {BlameEntry[]} entries - Array of blame entries
     * @returns {Map<number, BlameEntry>} Map of line number to blame entry
     */
    static createLineMap(entries) {
        const lineMap = new Map();

        for (const entry of entries) {
            for (let line = entry.lineStart; line <= entry.lineEnd; line++) {
                lineMap.set(line, entry);
            }
        }

        return lineMap;
    }

    /**
     * Group blame entries by commit
     *
     * @param {BlameEntry[]} entries - Array of blame entries
     * @returns {Map<string, BlameEntry[]>} Map of commit SHA to array of entries
     */
    static groupByCommit(entries) {
        const commitMap = new Map();

        for (const entry of entries) {
            if (!commitMap.has(entry.sha)) {
                commitMap.set(entry.sha, []);
            }
            commitMap.get(entry.sha).push(entry);
        }

        return commitMap;
    }

    /**
     * Get unique commits from blame entries
     *
     * @param {BlameEntry[]} entries - Array of blame entries
     * @returns {Array<Object>} Array of unique commit metadata objects
     */
    static getUniqueCommits(entries) {
        const commits = new Map();

        for (const entry of entries) {
            if (!commits.has(entry.sha)) {
                commits.set(entry.sha, {
                    sha: entry.sha,
                    author: entry.author,
                    authorMail: entry.authorMail,
                    authorTime: entry.authorTime,
                    authorTz: entry.authorTz,
                    summary: entry.summary
                });
            }
        }

        return Array.from(commits.values());
    }
}

module.exports = { BlameParser };

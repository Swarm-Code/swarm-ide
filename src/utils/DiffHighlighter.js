/**
 * DiffHighlighter - Character-level diff calculation and highlighting
 * Inspired by git-diff-view's change-range.ts
 *
 * This utility calculates exact character changes within modified lines
 * using prefix/suffix trimming algorithm.
 */

class DiffHighlighter {
    /**
     * Calculate common prefix length between two strings
     * @param {string} str1 - First string
     * @param {string} str2 - Second string
     * @returns {number} Length of common prefix
     */
    static commonPrefixLength(str1, str2) {
        const maxLength = Math.min(str1.length, str2.length);
        for (let i = 0; i < maxLength; i++) {
            if (str1[i] !== str2[i]) {
                return i;
            }
        }
        return maxLength;
    }

    /**
     * Calculate common suffix length between two strings
     * @param {string} str1 - First string
     * @param {string} str2 - Second string
     * @param {number} prefixLength - Length of common prefix (to avoid counting same chars twice)
     * @returns {number} Length of common suffix
     */
    static commonSuffixLength(str1, str2, prefixLength = 0) {
        const maxLength = Math.min(str1.length - prefixLength, str2.length - prefixLength);
        for (let i = 0; i < maxLength; i++) {
            if (str1[str1.length - 1 - i] !== str2[str2.length - 1 - i]) {
                return i;
            }
        }
        return maxLength;
    }

    /**
     * Calculate character-level changes between two lines
     * Returns the exact range of characters that changed
     *
     * Algorithm (inspired by git-diff-view):
     * 1. Find common prefix
     * 2. Find common suffix
     * 3. The middle part is what changed
     *
     * @param {string} oldLine - Original line content
     * @param {string} newLine - New line content
     * @returns {Object} { oldRange: {start, length}, newRange: {start, length}, hasChanges: boolean }
     */
    static calculateCharChanges(oldLine, newLine) {
        // Handle edge cases
        if (!oldLine || !newLine) {
            return {
                oldRange: { start: 0, length: oldLine ? oldLine.length : 0 },
                newRange: { start: 0, length: newLine ? newLine.length : 0 },
                hasChanges: true
            };
        }

        // Trim whitespace for comparison (but keep original indices)
        const oldTrimmed = oldLine.trim();
        const newTrimmed = newLine.trim();

        if (oldTrimmed === newTrimmed) {
            // Only whitespace changed
            return {
                oldRange: { start: 0, length: 0 },
                newRange: { start: 0, length: 0 },
                hasChanges: false
            };
        }

        // Find common prefix
        const prefixLength = this.commonPrefixLength(oldLine, newLine);

        // Find common suffix (excluding prefix)
        const suffixLength = this.commonSuffixLength(oldLine, newLine, prefixLength);

        // Calculate changed ranges
        const oldStart = prefixLength;
        const oldLength = oldLine.length - prefixLength - suffixLength;
        const newStart = prefixLength;
        const newLength = newLine.length - prefixLength - suffixLength;

        return {
            oldRange: { start: oldStart, length: oldLength },
            newRange: { start: newStart, length: newLength },
            hasChanges: oldLength > 0 || newLength > 0
        };
    }

    /**
     * Create text marker elements for character-level highlighting in CodeMirror
     * @param {Object} editor - CodeMirror editor instance
     * @param {number} lineNum - Line number (0-based)
     * @param {number} start - Character start position
     * @param {number} length - Length of highlighted range
     * @param {string} className - CSS class for highlighting
     * @returns {Object} CodeMirror TextMarker
     */
    static addCharHighlight(editor, lineNum, start, length, className) {
        if (!editor || length <= 0) return null;

        try {
            const from = { line: lineNum, ch: start };
            const to = { line: lineNum, ch: start + length };

            return editor.markText(from, to, {
                className: className,
                clearWhenEmpty: true
            });
        } catch (error) {
            console.error('[DiffHighlighter] Failed to add char highlight:', error);
            return null;
        }
    }

    /**
     * Find matching removed line for an added line
     * Used to pair up changed lines for character-level diff
     *
     * @param {Array} hunkLines - Array of hunk lines
     * @param {number} addedIndex - Index of added line
     * @returns {Object|null} Matching removed line or null
     */
    static findMatchingRemovedLine(hunkLines, addedIndex) {
        // Look backwards for a removed line within a small window
        const searchWindow = 3;
        for (let i = Math.max(0, addedIndex - searchWindow); i < addedIndex; i++) {
            const line = hunkLines[i];
            if (line && line.type === 'removed') {
                return { line, index: i };
            }
        }
        return null;
    }

    /**
     * Create HTML string with character-level highlighting
     * Useful for line widgets or tooltips
     *
     * @param {string} content - Line content
     * @param {number} start - Highlight start position
     * @param {number} length - Highlight length
     * @param {string} color - Highlight color
     * @returns {string} HTML string
     */
    static createHighlightedHTML(content, start, length, color) {
        if (!content || length <= 0) {
            return this.escapeHtml(content || '');
        }

        const before = content.substring(0, start);
        const highlighted = content.substring(start, start + length);
        const after = content.substring(start + length);

        return `${this.escapeHtml(before)}<span style="background-color: ${color}; border-radius: 2px; padding: 0 2px;">${this.escapeHtml(highlighted)}</span>${this.escapeHtml(after)}`;
    }

    /**
     * Escape HTML special characters
     * @param {string} text - Text to escape
     * @returns {string} Escaped text
     */
    static escapeHtml(text) {
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, m => map[m]);
    }

    /**
     * Calculate similarity ratio between two strings
     * Used to determine if lines should be paired for char-level diff
     *
     * @param {string} str1 - First string
     * @param {string} str2 - Second string
     * @returns {number} Similarity ratio (0-1)
     */
    static calculateSimilarity(str1, str2) {
        if (!str1 || !str2) return 0;

        const prefixLen = this.commonPrefixLength(str1, str2);
        const suffixLen = this.commonSuffixLength(str1, str2, prefixLen);
        const commonChars = prefixLen + suffixLen;
        const maxLength = Math.max(str1.length, str2.length);

        return maxLength > 0 ? commonChars / maxLength : 0;
    }
}

module.exports = DiffHighlighter;

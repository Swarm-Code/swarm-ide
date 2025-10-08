/**
 * SyntaxHighlighter - Utility for syntax highlighting code
 *
 * Wraps highlight.js library to provide syntax highlighting with auto-detection
 * and manual language specification.
 *
 * Usage:
 *   const highlighted = syntaxHighlighter.highlight(code, 'javascript');
 *   const autoDetected = syntaxHighlighter.highlightAuto(code);
 */

const hljs = require('highlight.js');

class SyntaxHighlighter {
    constructor() {
        // Configure highlight.js
        hljs.configure({
            ignoreUnescapedHTML: true,
            languages: [
                'javascript', 'typescript', 'python', 'java', 'c', 'cpp', 'csharp',
                'go', 'rust', 'php', 'ruby', 'swift', 'kotlin', 'html', 'css',
                'scss', 'json', 'xml', 'yaml', 'markdown', 'bash', 'sql', 'dockerfile'
            ]
        });
    }

    /**
     * Highlight code with specified language
     * @param {string} code - Code to highlight
     * @param {string} language - Language identifier
     * @returns {Object} Highlighted result with HTML and language
     */
    highlight(code, language) {
        try {
            if (!code) {
                return { value: '', language: 'plaintext' };
            }

            // Normalize language name
            const normalizedLang = this.normalizeLanguage(language);

            if (normalizedLang && hljs.getLanguage(normalizedLang)) {
                const result = hljs.highlight(code, {
                    language: normalizedLang,
                    ignoreIllegals: true
                });

                return {
                    value: result.value,
                    language: normalizedLang,
                    relevance: result.relevance
                };
            } else {
                // Fallback to auto-detection
                return this.highlightAuto(code);
            }
        } catch (error) {
            console.error('[SyntaxHighlighter] Error highlighting code:', error);
            return { value: this.escapeHtml(code), language: 'plaintext' };
        }
    }

    /**
     * Auto-detect language and highlight
     * @param {string} code - Code to highlight
     * @returns {Object} Highlighted result
     */
    highlightAuto(code) {
        try {
            if (!code) {
                return { value: '', language: 'plaintext' };
            }

            const result = hljs.highlightAuto(code);

            return {
                value: result.value,
                language: result.language || 'plaintext',
                relevance: result.relevance,
                secondBest: result.secondBest
            };
        } catch (error) {
            console.error('[SyntaxHighlighter] Error auto-detecting language:', error);
            return { value: this.escapeHtml(code), language: 'plaintext' };
        }
    }

    /**
     * Normalize language name to match highlight.js language identifiers
     * @param {string} language - Language name
     * @returns {string} Normalized language name
     */
    normalizeLanguage(language) {
        if (!language) return null;

        const langMap = {
            'js': 'javascript',
            'jsx': 'javascript',
            'ts': 'typescript',
            'tsx': 'typescript',
            'py': 'python',
            'rb': 'ruby',
            'sh': 'bash',
            'shell': 'bash',
            'yml': 'yaml',
            'c++': 'cpp',
            'c#': 'csharp',
            'cs': 'csharp',
            'rs': 'rust',
            'kt': 'kotlin',
            'md': 'markdown',
            'dockerfile': 'dockerfile'
        };

        const normalized = language.toLowerCase().trim();
        return langMap[normalized] || normalized;
    }

    /**
     * Get list of supported languages
     * @returns {Array<string>} List of language identifiers
     */
    getSupportedLanguages() {
        return hljs.listLanguages();
    }

    /**
     * Check if a language is supported
     * @param {string} language - Language identifier
     * @returns {boolean} True if supported
     */
    isLanguageSupported(language) {
        const normalized = this.normalizeLanguage(language);
        return normalized && hljs.getLanguage(normalized) !== undefined;
    }

    /**
     * Escape HTML to prevent XSS
     * @param {string} text - Text to escape
     * @returns {string} Escaped text
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Add line numbers to highlighted code
     * @param {string} highlightedHtml - Highlighted HTML code
     * @returns {string} HTML with line numbers
     */
    addLineNumbers(highlightedHtml) {
        const lines = highlightedHtml.split('\n');
        const numberedLines = lines.map((line, index) => {
            const lineNum = index + 1;
            return `<span class="line-number">${lineNum}</span><span class="line-content">${line}</span>`;
        });

        return numberedLines.join('\n');
    }
}

// Export singleton instance
const syntaxHighlighter = new SyntaxHighlighter();
module.exports = syntaxHighlighter;

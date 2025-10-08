/**
 * FileTypes - Utility for file type detection and metadata
 *
 * Provides helpers for detecting file types, getting appropriate icons,
 * and determining file categories.
 */

class FileTypes {
    constructor() {
        // Base path for Material Icons
        this.iconBasePath = 'assets/icons/';

        this.extensions = {
            // Programming languages
            js: { icon: 'javascript', category: 'code', language: 'javascript' },
            jsx: { icon: 'react', category: 'code', language: 'javascript' },
            ts: { icon: 'typescript', category: 'code', language: 'typescript' },
            tsx: { icon: 'react_ts', category: 'code', language: 'typescript' },
            py: { icon: 'python', category: 'code', language: 'python' },
            java: { icon: 'java', category: 'code', language: 'java' },
            c: { icon: 'c', category: 'code', language: 'c' },
            cpp: { icon: 'cpp', category: 'code', language: 'cpp' },
            cc: { icon: 'cpp', category: 'code', language: 'cpp' },
            cxx: { icon: 'cpp', category: 'code', language: 'cpp' },
            cs: { icon: 'csharp', category: 'code', language: 'csharp' },
            go: { icon: 'go', category: 'code', language: 'go' },
            rs: { icon: 'rust', category: 'code', language: 'rust' },
            php: { icon: 'php', category: 'code', language: 'php' },
            rb: { icon: 'ruby', category: 'code', language: 'ruby' },
            swift: { icon: 'swift', category: 'code', language: 'swift' },
            kt: { icon: 'kotlin', category: 'code', language: 'kotlin' },
            kts: { icon: 'kotlin', category: 'code', language: 'kotlin' },

            // Web
            html: { icon: 'html', category: 'web', language: 'html' },
            htm: { icon: 'html', category: 'web', language: 'html' },
            css: { icon: 'css', category: 'web', language: 'css' },
            scss: { icon: 'sass', category: 'web', language: 'scss' },
            sass: { icon: 'sass', category: 'web', language: 'sass' },
            less: { icon: 'less', category: 'web', language: 'less' },

            // Data
            json: { icon: 'json', category: 'data', language: 'json' },
            jsonc: { icon: 'json', category: 'data', language: 'json' },
            json5: { icon: 'json', category: 'data', language: 'json' },
            xml: { icon: 'xml', category: 'data', language: 'xml' },
            yaml: { icon: 'yaml', category: 'data', language: 'yaml' },
            yml: { icon: 'yaml', category: 'data', language: 'yaml' },
            toml: { icon: 'toml', category: 'data', language: 'toml' },
            csv: { icon: 'table', category: 'data', language: 'csv' },

            // Documents
            md: { icon: 'markdown', category: 'document', language: 'markdown' },
            markdown: { icon: 'markdown', category: 'document', language: 'markdown' },
            txt: { icon: 'document', category: 'document', language: 'plaintext' },
            pdf: { icon: 'pdf', category: 'document', language: 'pdf' },
            doc: { icon: 'word', category: 'document', language: 'document' },
            docx: { icon: 'word', category: 'document', language: 'document' },

            // Logs
            log: { icon: 'log', category: 'log', language: 'log' },
            out: { icon: 'console', category: 'log', language: 'plaintext' },
            err: { icon: 'error', category: 'log', language: 'plaintext' },

            // Database
            db: { icon: 'database', category: 'binary', language: 'binary', binary: true },
            sqlite: { icon: 'database', category: 'binary', language: 'binary', binary: true },
            sqlite3: { icon: 'database', category: 'binary', language: 'binary', binary: true },
            sql: { icon: 'database', category: 'code', language: 'sql' },

            // Images
            png: { icon: 'image', category: 'image', language: 'image' },
            jpg: { icon: 'image', category: 'image', language: 'image' },
            jpeg: { icon: 'image', category: 'image', language: 'image' },
            gif: { icon: 'image', category: 'image', language: 'image' },
            svg: { icon: 'svg', category: 'image', language: 'svg' },
            webp: { icon: 'image', category: 'image', language: 'image' },
            ico: { icon: 'image', category: 'image', language: 'image' },
            bmp: { icon: 'image', category: 'image', language: 'image' },

            // Videos
            mp4: { icon: 'video', category: 'video', language: 'video' },
            webm: { icon: 'video', category: 'video', language: 'video' },
            mkv: { icon: 'video', category: 'video', language: 'video' },
            avi: { icon: 'video', category: 'video', language: 'video' },
            mov: { icon: 'video', category: 'video', language: 'video' },
            flv: { icon: 'video', category: 'video', language: 'video' },
            wmv: { icon: 'video', category: 'video', language: 'video' },
            m4v: { icon: 'video', category: 'video', language: 'video' },
            mpg: { icon: 'video', category: 'video', language: 'video' },
            mpeg: { icon: 'video', category: 'video', language: 'video' },
            '3gp': { icon: 'video', category: 'video', language: 'video' },
            ogv: { icon: 'video', category: 'video', language: 'video' },

            // Config
            gitignore: { icon: 'git', category: 'config', language: 'plaintext' },
            env: { icon: 'tune', category: 'config', language: 'plaintext' },
            config: { icon: 'settings', category: 'config', language: 'json' },
            conf: { icon: 'settings', category: 'config', language: 'plaintext' },

            // Shell
            sh: { icon: 'terminal', category: 'script', language: 'bash' },
            bash: { icon: 'terminal', category: 'script', language: 'bash' },
            zsh: { icon: 'terminal', category: 'script', language: 'bash' },
            bat: { icon: 'console', category: 'script', language: 'batch' },
            cmd: { icon: 'console', category: 'script', language: 'batch' },
            ps1: { icon: 'powershell', category: 'script', language: 'powershell' },

            // Default
            default: { icon: 'file', category: 'unknown', language: 'plaintext' }
        };
    }

    /**
     * Get file extension from filename
     * @param {string} filename - File name
     * @returns {string} File extension (lowercase, without dot)
     */
    getExtension(filename) {
        const parts = filename.split('.');
        if (parts.length === 1) return '';

        let ext = parts[parts.length - 1].toLowerCase();

        // Handle special cases like .gitignore, .env
        if (filename.startsWith('.') && parts.length === 2) {
            ext = parts[1];
        }

        return ext;
    }

    /**
     * Get file metadata
     * @param {string} filename - File name
     * @returns {Object} File metadata
     */
    getFileInfo(filename) {
        const ext = this.getExtension(filename);
        return this.extensions[ext] || this.extensions.default;
    }

    /**
     * Get file icon name (without extension)
     * @param {string} filename - File name
     * @returns {string} Icon name
     */
    getIcon(filename) {
        return this.getFileInfo(filename).icon;
    }

    /**
     * Get file icon path
     * @param {string} filename - File name
     * @returns {string} Icon file path
     */
    getIconPath(filename) {
        const iconName = this.getIcon(filename);
        return `${this.iconBasePath}${iconName}.svg`;
    }

    /**
     * Get folder icon path
     * @param {boolean} isOpen - Whether folder is open
     * @returns {string} Folder icon file path
     */
    getFolderIconPath(isOpen = false) {
        const iconName = isOpen ? 'folder-open' : 'folder';
        return `${this.iconBasePath}${iconName}.svg`;
    }

    /**
     * Get file category
     * @param {string} filename - File name
     * @returns {string} Category name
     */
    getCategory(filename) {
        return this.getFileInfo(filename).category;
    }

    /**
     * Get file language
     * @param {string} filename - File name
     * @returns {string} Language identifier
     */
    getLanguage(filename) {
        return this.getFileInfo(filename).language;
    }

    /**
     * Check if file is a code file
     * @param {string} filename - File name
     * @returns {boolean}
     */
    isCode(filename) {
        return this.getCategory(filename) === 'code';
    }

    /**
     * Check if file is an image
     * @param {string} filename - File name
     * @returns {boolean}
     */
    isImage(filename) {
        return this.getCategory(filename) === 'image';
    }

    /**
     * Check if file is a document
     * @param {string} filename - File name
     * @returns {boolean}
     */
    isDocument(filename) {
        return this.getCategory(filename) === 'document';
    }

    /**
     * Check if file is a config file
     * @param {string} filename - File name
     * @returns {boolean}
     */
    isConfig(filename) {
        return this.getCategory(filename) === 'config';
    }

    /**
     * Check if file is a video
     * @param {string} filename - File name
     * @returns {boolean}
     */
    isVideo(filename) {
        return this.getCategory(filename) === 'video';
    }

    /**
     * Check if file should be viewable in text viewer
     * @param {string} filename - File name
     * @returns {boolean}
     */
    isTextViewable(filename) {
        const category = this.getCategory(filename);
        return ['code', 'web', 'data', 'document', 'config', 'script', 'log', 'unknown'].includes(category);
    }

    /**
     * Check if file is binary
     * @param {string} filename - File name
     * @returns {boolean}
     */
    isBinary(filename) {
        const info = this.getFileInfo(filename);
        return info.binary === true || this.getCategory(filename) === 'binary';
    }
}

// Export singleton instance
const fileTypes = new FileTypes();
module.exports = fileTypes;

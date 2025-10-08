/**
 * PathUtils - Utility functions for path manipulation
 *
 * Provides cross-platform path utilities for working with file paths
 * in the renderer process without requiring Node.js path module.
 */

class PathUtils {
    /**
     * Join path segments
     * @param {...string} segments - Path segments to join
     * @returns {string} Joined path
     */
    join(...segments) {
        return segments
            .filter(seg => seg && seg.length > 0)
            .join('/')
            .replace(/\/+/g, '/')
            .replace(/\/$/, '');
    }

    /**
     * Get base name from path
     * @param {string} filePath - File path
     * @returns {string} Base name
     */
    basename(filePath) {
        if (!filePath) return '';
        const parts = filePath.split('/').filter(p => p.length > 0);
        return parts[parts.length - 1] || '';
    }

    /**
     * Get directory name from path
     * @param {string} filePath - File path
     * @returns {string} Directory path
     */
    dirname(filePath) {
        if (!filePath) return '';
        const parts = filePath.split('/').filter(p => p.length > 0);
        parts.pop();
        return '/' + parts.join('/');
    }

    /**
     * Get file extension
     * @param {string} filePath - File path
     * @returns {string} Extension (with dot)
     */
    extname(filePath) {
        const basename = this.basename(filePath);
        const lastDot = basename.lastIndexOf('.');

        if (lastDot === -1 || lastDot === 0) {
            return '';
        }

        return basename.substring(lastDot);
    }

    /**
     * Normalize a path
     * @param {string} filePath - File path
     * @returns {string} Normalized path
     */
    normalize(filePath) {
        if (!filePath) return '';

        const parts = [];
        const segments = filePath.split('/');

        for (const segment of segments) {
            if (segment === '..') {
                parts.pop();
            } else if (segment && segment !== '.') {
                parts.push(segment);
            }
        }

        const result = parts.join('/');
        return filePath.startsWith('/') ? '/' + result : result;
    }

    /**
     * Check if path is absolute
     * @param {string} filePath - File path
     * @returns {boolean}
     */
    isAbsolute(filePath) {
        if (!filePath) return false;
        return filePath.startsWith('/') || /^[a-zA-Z]:/.test(filePath);
    }

    /**
     * Get relative path from base to target
     * @param {string} from - Base path
     * @param {string} to - Target path
     * @returns {string} Relative path
     */
    relative(from, to) {
        const fromParts = this.normalize(from).split('/');
        const toParts = this.normalize(to).split('/');

        // Find common base
        let i = 0;
        while (i < fromParts.length && i < toParts.length && fromParts[i] === toParts[i]) {
            i++;
        }

        // Build relative path
        const upCount = fromParts.length - i;
        const relativeParts = Array(upCount).fill('..');
        const downParts = toParts.slice(i);

        return [...relativeParts, ...downParts].join('/') || '.';
    }

    /**
     * Check if a path is a child of another path
     * @param {string} parent - Parent path
     * @param {string} child - Child path
     * @returns {boolean}
     */
    isChildOf(parent, child) {
        const normalParent = this.normalize(parent);
        const normalChild = this.normalize(child);

        return normalChild.startsWith(normalParent + '/');
    }

    /**
     * Get depth of a path (number of segments)
     * @param {string} filePath - File path
     * @returns {number} Depth
     */
    depth(filePath) {
        if (!filePath || filePath === '/') return 0;
        return this.normalize(filePath).split('/').filter(p => p.length > 0).length;
    }

    /**
     * Parse path into components
     * @param {string} filePath - File path
     * @returns {Object} Path components
     */
    parse(filePath) {
        return {
            dir: this.dirname(filePath),
            base: this.basename(filePath),
            ext: this.extname(filePath),
            name: this.basename(filePath).replace(this.extname(filePath), '')
        };
    }

    /**
     * Format path components into a path string
     * @param {Object} pathObject - Path components
     * @returns {string} Formatted path
     */
    format(pathObject) {
        const { dir, base, name, ext } = pathObject;

        if (base) {
            return this.join(dir || '', base);
        }

        if (name && ext) {
            return this.join(dir || '', name + ext);
        }

        return dir || '';
    }

    /**
     * Get separator for the current platform
     * @returns {string} Path separator
     */
    get sep() {
        return '/';
    }
}

// Export singleton instance
const pathUtils = new PathUtils();
module.exports = pathUtils;

/**
 * Breadcrumb - Navigation breadcrumb showing file path
 *
 * Shows clickable path segments for easy navigation
 *
 * Usage:
 *   const breadcrumb = new Breadcrumb(container);
 *   breadcrumb.setPath('/home/user/project/src/index.js');
 */

const eventBus = require('../modules/EventBus');
const pathUtils = require('../utils/PathUtils');

class Breadcrumb {
    constructor(container) {
        this.container = container;
        this.currentPath = null;
        this.codeSymbols = []; // Array of code symbols (e.g., ['html', 'body', 'div#app', 'button'])
        this.init();
    }

    /**
     * Initialize the breadcrumb
     */
    init() {
        this.container.className = 'breadcrumb-container';
        this.render();
    }

    /**
     * Set the current path and update display
     * @param {string} filePath - Full file path
     */
    setPath(filePath) {
        this.currentPath = filePath;
        this.render();
    }

    /**
     * Set code symbols (structure within the file)
     * @param {Array<string>} symbols - Array of symbol names (e.g., ['html', 'body', 'div'])
     */
    setSymbols(symbols) {
        this.codeSymbols = symbols || [];
        this.render();
    }

    /**
     * Render the breadcrumb
     */
    render() {
        this.container.innerHTML = '';

        if (!this.currentPath) {
            this.container.innerHTML = '<span class="breadcrumb-item">No file selected</span>';
            return;
        }

        // Split path into segments
        const segments = this.currentPath.split(pathUtils.sep).filter(s => s);

        // Add root if path starts with /
        if (this.currentPath.startsWith('/')) {
            segments.unshift('/');
        }

        // Create breadcrumb items
        segments.forEach((segment, index) => {
            // Create separator (except for first item)
            if (index > 0) {
                const separator = document.createElement('span');
                separator.className = 'breadcrumb-separator';
                separator.textContent = '›';
                this.container.appendChild(separator);
            }

            // Create segment
            const item = document.createElement('span');
            item.className = 'breadcrumb-item';

            // Build full path up to this segment
            let segmentPath;
            if (index === 0 && segment === '/') {
                segmentPath = '/';
            } else {
                const pathParts = segments.slice(0, index + 1);
                if (pathParts[0] === '/') {
                    pathParts[0] = '';
                }
                segmentPath = pathParts.join(pathUtils.sep);
                if (!segmentPath.startsWith('/') && this.currentPath.startsWith('/')) {
                    segmentPath = '/' + segmentPath;
                }
            }

            // Last segment (file) is not clickable
            const isLast = index === segments.length - 1;

            if (isLast) {
                item.textContent = segment;
                item.classList.add('breadcrumb-file');
            } else {
                item.textContent = segment;
                item.classList.add('breadcrumb-directory');
                item.title = `Open ${segmentPath}`;

                // Make directory segments clickable
                item.addEventListener('click', () => {
                    console.log('[Breadcrumb] Navigating to:', segmentPath);
                    eventBus.emit('explorer:navigate-to', { path: segmentPath });
                });
            }

            this.container.appendChild(item);
        });

        // Add code symbols after file path
        if (this.codeSymbols.length > 0) {
            // Add separator before code symbols
            const separator = document.createElement('span');
            separator.className = 'breadcrumb-separator';
            separator.textContent = '›';
            this.container.appendChild(separator);

            this.codeSymbols.forEach((symbol, index) => {
                // Create separator (except for first code symbol)
                if (index > 0) {
                    const sep = document.createElement('span');
                    sep.className = 'breadcrumb-separator';
                    sep.textContent = '›';
                    this.container.appendChild(sep);
                }

                // Create symbol item
                const item = document.createElement('span');
                item.className = 'breadcrumb-item breadcrumb-symbol';
                item.textContent = symbol;
                item.title = symbol;
                this.container.appendChild(item);
            });
        }
    }

    /**
     * Clear the breadcrumb
     */
    clear() {
        this.currentPath = null;
        this.codeSymbols = [];
        this.render();
    }

    /**
     * Cleanup
     */
    destroy() {
        this.container.innerHTML = '';
    }
}

module.exports = Breadcrumb;

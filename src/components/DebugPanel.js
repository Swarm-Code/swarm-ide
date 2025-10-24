/**
 * DebugPanel.js
 *
 * Comprehensive debug panel that displays ALL application logs in extreme detail.
 * Shows logs from renderer, main process, and swarm-server with filtering and search.
 */

const logger = require('../utils/Logger');

class DebugPanel {
    constructor() {
        this.container = null;
        this.logContainer = null;
        this.logs = [];
        this.maxLogs = 5000; // Keep last 5000 logs
        this.autoScroll = true;
        this.filters = {
            levels: new Set(['ERROR', 'WARN', 'INFO', 'DEBUG', 'TRACE']),
            sources: new Set(['RENDERER', 'MAIN', 'SWARM_SERVER']),
            functionalities: new Set()
        };
        this.searchText = '';
        this.isVisible = false; // Hidden by default - toggle with Ctrl+Shift+D
        this.height = 300; // Default height in pixels

        // Intercept console methods to capture ALL logs
        this.interceptConsoleLogs();

        // Listen for IPC logs from main process
        this.listenForMainProcessLogs();
    }

    /**
     * Create the debug panel UI
     */
    create() {
        // Create main container
        this.container = document.createElement('div');
        this.container.id = 'debug-panel';
        this.container.className = 'debug-panel';
        this.container.style.display = this.isVisible ? 'flex' : 'none';

        // Create header with controls
        const header = document.createElement('div');
        header.className = 'debug-panel-header';
        header.innerHTML = `
            <div class="debug-panel-title">
                <span class="debug-panel-icon">🔍</span>
                <span>Debug Console</span>
                <span class="debug-panel-count" id="debug-log-count">0 logs</span>
            </div>
            <div class="debug-panel-controls">
                <input type="text"
                    id="debug-search"
                    placeholder="Search logs..."
                    class="debug-search-input">

                <div class="debug-filter-group">
                    <label class="debug-filter-label">Levels:</label>
                    <label class="debug-checkbox">
                        <input type="checkbox" data-filter="level" value="ERROR" checked>
                        <span class="level-badge error">ERROR</span>
                    </label>
                    <label class="debug-checkbox">
                        <input type="checkbox" data-filter="level" value="WARN" checked>
                        <span class="level-badge warn">WARN</span>
                    </label>
                    <label class="debug-checkbox">
                        <input type="checkbox" data-filter="level" value="INFO" checked>
                        <span class="level-badge info">INFO</span>
                    </label>
                    <label class="debug-checkbox">
                        <input type="checkbox" data-filter="level" value="DEBUG" checked>
                        <span class="level-badge debug">DEBUG</span>
                    </label>
                    <label class="debug-checkbox">
                        <input type="checkbox" data-filter="level" value="TRACE" checked>
                        <span class="level-badge trace">TRACE</span>
                    </label>
                </div>

                <div class="debug-filter-group">
                    <label class="debug-filter-label">Sources:</label>
                    <label class="debug-checkbox">
                        <input type="checkbox" data-filter="source" value="RENDERER" checked>
                        <span class="source-badge renderer">RENDERER</span>
                    </label>
                    <label class="debug-checkbox">
                        <input type="checkbox" data-filter="source" value="MAIN" checked>
                        <span class="source-badge main">MAIN</span>
                    </label>
                    <label class="debug-checkbox">
                        <input type="checkbox" data-filter="source" value="SWARM_SERVER" checked>
                        <span class="source-badge swarm">SWARM</span>
                    </label>
                </div>

                <label class="debug-checkbox">
                    <input type="checkbox" id="debug-autoscroll" checked>
                    <span>Auto-scroll</span>
                </label>

                <button id="debug-clear" class="debug-button" title="Clear logs">
                    🗑️ Clear
                </button>

                <button id="debug-export" class="debug-button" title="Export logs">
                    💾 Export
                </button>

                <button id="debug-toggle" class="debug-button" title="Minimize/Maximize">
                    ⬇️
                </button>
            </div>
        `;

        // Create resize handle
        const resizeHandle = document.createElement('div');
        resizeHandle.className = 'debug-panel-resize-handle';
        resizeHandle.title = 'Drag to resize';

        // Create log container
        this.logContainer = document.createElement('div');
        this.logContainer.className = 'debug-panel-logs';
        this.logContainer.id = 'debug-logs';

        // Assemble panel
        this.container.appendChild(resizeHandle);
        this.container.appendChild(header);
        this.container.appendChild(this.logContainer);

        // Add to document (check if body exists first)
        if (document.body) {
            document.body.appendChild(this.container);
        } else {
            console.error('[DebugPanel] document.body is null, cannot append debug panel');
            return null;
        }

        // Setup event listeners
        this.setupEventListeners();

        // Apply initial height
        this.container.style.height = `${this.height}px`;

        logger.debug('debugPanel', 'Debug panel created and initialized');

        return this.container;
    }

    /**
     * Setup all event listeners
     */
    setupEventListeners() {
        // Search input
        const searchInput = document.getElementById('debug-search');
        searchInput.addEventListener('input', (e) => {
            this.searchText = e.target.value.toLowerCase();
            this.renderLogs();
        });

        // Filter checkboxes
        const filterCheckboxes = this.container.querySelectorAll('[data-filter]');
        filterCheckboxes.forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const filterType = e.target.getAttribute('data-filter');
                const value = e.target.value;

                if (filterType === 'level') {
                    if (e.target.checked) {
                        this.filters.levels.add(value);
                    } else {
                        this.filters.levels.delete(value);
                    }
                } else if (filterType === 'source') {
                    if (e.target.checked) {
                        this.filters.sources.add(value);
                    } else {
                        this.filters.sources.delete(value);
                    }
                }

                this.renderLogs();
            });
        });

        // Auto-scroll checkbox
        const autoScrollCheckbox = document.getElementById('debug-autoscroll');
        autoScrollCheckbox.addEventListener('change', (e) => {
            this.autoScroll = e.target.checked;
        });

        // Clear button
        const clearButton = document.getElementById('debug-clear');
        clearButton.addEventListener('click', () => {
            this.logs = [];
            this.renderLogs();
        });

        // Export button
        const exportButton = document.getElementById('debug-export');
        exportButton.addEventListener('click', () => {
            this.exportLogs();
        });

        // Toggle button
        const toggleButton = document.getElementById('debug-toggle');
        toggleButton.addEventListener('click', () => {
            this.toggleMinimize();
        });

        // Resize handle
        const resizeHandle = this.container.querySelector('.debug-panel-resize-handle');
        this.setupResizeHandle(resizeHandle);
    }

    /**
     * Setup resize handle for dragging
     */
    setupResizeHandle(handle) {
        let isResizing = false;
        let startY = 0;
        let startHeight = 0;

        handle.addEventListener('mousedown', (e) => {
            isResizing = true;
            startY = e.clientY;
            startHeight = this.height;
            document.body.style.cursor = 'ns-resize';
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isResizing) return;

            const deltaY = startY - e.clientY;
            this.height = Math.max(100, Math.min(800, startHeight + deltaY));
            this.container.style.height = `${this.height}px`;
        });

        document.addEventListener('mouseup', () => {
            if (isResizing) {
                isResizing = false;
                document.body.style.cursor = '';
            }
        });
    }

    /**
     * Intercept console methods to capture all logs
     */
    interceptConsoleLogs() {
        const originalLog = console.log;
        const originalError = console.error;
        const originalWarn = console.warn;
        const originalInfo = console.info;
        const originalDebug = console.debug;
        const originalTrace = console.trace;

        console.log = (...args) => {
            this.addLog('DEBUG', 'RENDERER', 'console', args);
            originalLog.apply(console, args);
        };

        console.error = (...args) => {
            this.addLog('ERROR', 'RENDERER', 'console', args);
            originalError.apply(console, args);
        };

        console.warn = (...args) => {
            this.addLog('WARN', 'RENDERER', 'console', args);
            originalWarn.apply(console, args);
        };

        console.info = (...args) => {
            this.addLog('INFO', 'RENDERER', 'console', args);
            originalInfo.apply(console, args);
        };

        console.debug = (...args) => {
            this.addLog('DEBUG', 'RENDERER', 'console', args);
            originalDebug.apply(console, args);
        };

        console.trace = (...args) => {
            this.addLog('TRACE', 'RENDERER', 'console', args);
            originalTrace.apply(console, args);
        };
    }

    /**
     * Listen for logs from main process via IPC
     */
    listenForMainProcessLogs() {
        if (window.electronAPI && window.electronAPI.onDebugLog) {
            window.electronAPI.onDebugLog((log) => {
                this.addLog(
                    log.level || 'DEBUG',
                    log.source || 'MAIN',
                    log.functionality || 'main',
                    [log.message, ...(log.data || [])]
                );
            });
        }
    }

    /**
     * Add a log entry
     */
    addLog(level, source, functionality, args) {
        const timestamp = new Date();
        const message = args.map(arg => {
            if (typeof arg === 'object') {
                try {
                    return JSON.stringify(arg, null, 2);
                } catch (e) {
                    return String(arg);
                }
            }
            return String(arg);
        }).join(' ');

        const logEntry = {
            id: Date.now() + Math.random(),
            timestamp,
            level,
            source,
            functionality,
            message,
            args
        };

        this.logs.push(logEntry);

        // Trim logs if too many
        if (this.logs.length > this.maxLogs) {
            this.logs = this.logs.slice(-this.maxLogs);
        }

        // Update display
        this.renderNewLog(logEntry);

        // Update count
        this.updateLogCount();
    }

    /**
     * Render a single new log entry (for performance)
     */
    renderNewLog(logEntry) {
        // If panel not created yet, skip rendering (logs are still stored)
        if (!this.logContainer) {
            return;
        }

        if (!this.shouldShowLog(logEntry)) {
            return;
        }

        const logElement = this.createLogElement(logEntry);
        this.logContainer.appendChild(logElement);

        // Auto-scroll if enabled
        if (this.autoScroll) {
            this.logContainer.scrollTop = this.logContainer.scrollHeight;
        }
    }

    /**
     * Check if a log should be shown based on filters
     */
    shouldShowLog(logEntry) {
        // Level filter
        if (!this.filters.levels.has(logEntry.level)) {
            return false;
        }

        // Source filter
        if (!this.filters.sources.has(logEntry.source)) {
            return false;
        }

        // Search text
        if (this.searchText) {
            const searchIn = `${logEntry.message} ${logEntry.functionality}`.toLowerCase();
            if (!searchIn.includes(this.searchText)) {
                return false;
            }
        }

        return true;
    }

    /**
     * Create a log element
     */
    createLogElement(logEntry) {
        const div = document.createElement('div');
        div.className = `debug-log-entry level-${logEntry.level.toLowerCase()}`;

        const time = logEntry.timestamp.toISOString().split('T')[1].replace('Z', '');

        div.innerHTML = `
            <span class="debug-log-time">${time}</span>
            <span class="debug-log-level level-${logEntry.level.toLowerCase()}">${logEntry.level}</span>
            <span class="debug-log-source source-${logEntry.source.toLowerCase()}">${logEntry.source}</span>
            <span class="debug-log-functionality">[${logEntry.functionality}]</span>
            <span class="debug-log-message">${this.escapeHtml(logEntry.message)}</span>
        `;

        return div;
    }

    /**
     * Render all logs (called when filters change)
     */
    renderLogs() {
        this.logContainer.innerHTML = '';

        const filteredLogs = this.logs.filter(log => this.shouldShowLog(log));

        filteredLogs.forEach(log => {
            const logElement = this.createLogElement(log);
            this.logContainer.appendChild(logElement);
        });

        // Auto-scroll if enabled
        if (this.autoScroll) {
            this.logContainer.scrollTop = this.logContainer.scrollHeight;
        }

        this.updateLogCount();
    }

    /**
     * Update log count display
     */
    updateLogCount() {
        // If panel not created yet, skip
        if (!this.container) {
            return;
        }

        const countElement = document.getElementById('debug-log-count');
        if (countElement) {
            const filtered = this.logs.filter(log => this.shouldShowLog(log)).length;
            const total = this.logs.length;
            countElement.textContent = `${filtered}/${total} logs`;
        }
    }

    /**
     * Toggle minimize/maximize
     */
    toggleMinimize() {
        const logsContainer = this.logContainer;
        const toggleButton = document.getElementById('debug-toggle');

        if (logsContainer.style.display === 'none') {
            logsContainer.style.display = 'block';
            this.container.style.height = `${this.height}px`;
            toggleButton.textContent = '⬇️';
        } else {
            logsContainer.style.display = 'none';
            this.container.style.height = 'auto';
            toggleButton.textContent = '⬆️';
        }
    }

    /**
     * Export logs to file
     */
    async exportLogs() {
        const logsText = this.logs.map(log => {
            return `[${log.timestamp.toISOString()}] [${log.level}] [${log.source}] [${log.functionality}] ${log.message}`;
        }).join('\n');

        const blob = new Blob([logsText], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `swarm-ide-debug-${Date.now()}.log`;
        a.click();
        URL.revokeObjectURL(url);

        logger.info('debugPanel', 'Logs exported', { count: this.logs.length });
    }

    /**
     * Escape HTML to prevent XSS
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Show the panel
     */
    show() {
        this.isVisible = true;
        this.container.style.display = 'flex';
    }

    /**
     * Hide the panel
     */
    hide() {
        this.isVisible = false;
        this.container.style.display = 'none';
    }

    /**
     * Toggle visibility
     */
    toggle() {
        if (this.isVisible) {
            this.hide();
        } else {
            this.show();
        }
    }
}

module.exports = new DebugPanel();

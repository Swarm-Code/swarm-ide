/**
 * Functionality-Based Logger System
 *
 * Allows granular control over logging by functionality tags.
 * Key Features:
 * - Functionality-first: Every log must specify what functionality it's for
 * - Whitelist mode: Enable ONLY specific functionalities (silence everything else)
 * - Blacklist mode: Disable specific functionalities (log everything else)
 * - Log levels: ERROR, WARN, INFO, DEBUG, TRACE
 * - Always show errors: Critical errors always logged (configurable)
 * - Zero overhead when disabled: No-op functions when logging disabled
 *
 * Usage:
 *   logger.trace('hover', 'Hover request at position', {line, ch});
 *   logger.debug('gitPush', 'Pushing to remote', {branch, remote});
 *   logger.info('appInit', 'Application started', version);
 *   logger.warn('fileWatch', 'Slow file watcher', details);
 *   logger.error('lspClient', 'LSP connection failed', error);
 *
 * Configuration:
 *   Logger.enableOnly(['hover', 'gitPush']); // Only log these functionalities
 *   Logger.disable(['tabSwitch', 'dragDrop']); // Silence these, log everything else
 *   Logger.setLevel('DEBUG'); // Minimum log level
 *   Logger.setAlwaysShowErrors(true); // Always show errors regardless of filtering
 */

class LoggerClass {
    constructor() {
        // Log levels (higher number = more verbose)
        this.LEVELS = {
            ERROR: 0,
            WARN: 1,
            INFO: 2,
            DEBUG: 3,
            TRACE: 4
        };

        // Default configuration
        this.config = {
            enabled: false,                   // Master enable/disable (disabled by default)
            minLevel: this.LEVELS.INFO,       // Minimum level to log
            mode: 'blacklist',                // 'whitelist' or 'blacklist'
            enabledFunctionalities: [],       // Whitelist: only log these
            disabledFunctionalities: [],      // Blacklist: don't log these
            alwaysShowErrors: true,           // Always show ERROR level regardless of functionality filter
            useColors: true,                  // Use colors in console output
            showTimestamps: false,            // Show timestamps
            showComponent: true               // Show component/functionality tags
        };

        // Detect environment
        this.isProduction = this._detectProduction();

        // Apply environment-specific defaults
        if (this.isProduction) {
            this.config.enabled = false;      // Disabled in production by default
            this.config.minLevel = this.LEVELS.ERROR;
            this.config.alwaysShowErrors = true;
        } else {
            this.config.enabled = true;       // Enabled in development
            this.config.minLevel = this.LEVELS.DEBUG;
        }

        // Color codes for different log levels
        this.colors = {
            ERROR: '\x1b[31m',   // Red
            WARN: '\x1b[33m',    // Yellow
            INFO: '\x1b[36m',    // Cyan
            DEBUG: '\x1b[90m',   // Gray
            TRACE: '\x1b[35m',   // Magenta
            RESET: '\x1b[0m',
            BOLD: '\x1b[1m',
            DIM: '\x1b[2m'
        };

        // Bind methods
        this.trace = this.trace.bind(this);
        this.debug = this.debug.bind(this);
        this.info = this.info.bind(this);
        this.warn = this.warn.bind(this);
        this.error = this.error.bind(this);
    }

    /**
     * Detect if running in production
     */
    _detectProduction() {
        // Check various production indicators
        if (typeof process !== 'undefined') {
            if (process.env.NODE_ENV === 'production') return true;
            // Check if Electron app is packaged
            if (process.type && typeof require !== 'undefined') {
                try {
                    const { app } = require('electron');
                    if (app && app.isPackaged) return true;
                } catch (e) {
                    // Not in Electron or can't access app
                }
            }
        }
        return false;
    }

    /**
     * Check if a functionality should be logged
     */
    isEnabled(functionality, level) {
        // If master switch is off, nothing logs (except errors if alwaysShowErrors)
        if (!this.config.enabled) {
            return level === this.LEVELS.ERROR && this.config.alwaysShowErrors;
        }

        // Check log level
        if (level < this.config.minLevel) {
            return false;
        }

        // Always show errors if configured
        if (level === this.LEVELS.ERROR && this.config.alwaysShowErrors) {
            return true;
        }

        // Check functionality filtering
        if (this.config.mode === 'whitelist') {
            // Whitelist mode: only enabled functionalities are logged
            if (this.config.enabledFunctionalities.length === 0) {
                return true; // If whitelist is empty, log everything
            }
            return this.config.enabledFunctionalities.includes(functionality);
        } else {
            // Blacklist mode: all except disabled functionalities are logged
            return !this.config.disabledFunctionalities.includes(functionality);
        }
    }

    /**
     * Format log message
     */
    _format(level, functionality, message, ...args) {
        const parts = [];

        // Timestamp
        if (this.config.showTimestamps) {
            const now = new Date();
            const time = now.toTimeString().split(' ')[0];
            parts.push(`[${time}]`);
        }

        // Level
        const levelName = Object.keys(this.LEVELS).find(k => this.LEVELS[k] === level);
        if (this.config.useColors) {
            parts.push(`${this.colors[levelName]}${levelName}${this.colors.RESET}`);
        } else {
            parts.push(`[${levelName}]`);
        }

        // Functionality/Component
        if (this.config.showComponent && functionality) {
            if (this.config.useColors) {
                parts.push(`${this.colors.BOLD}[${functionality}]${this.colors.RESET}`);
            } else {
                parts.push(`[${functionality}]`);
            }
        }

        // Message
        parts.push(message);

        return { formatted: parts.join(' '), args };
    }

    /**
     * Internal log method
     */
    _log(level, functionality, message, ...args) {
        if (!this.isEnabled(functionality, level)) {
            return;
        }

        const { formatted, args: formattedArgs } = this._format(level, functionality, message, ...args);

        // Choose console method based on level
        switch (level) {
            case this.LEVELS.ERROR:
                console.error(formatted, ...formattedArgs);
                break;
            case this.LEVELS.WARN:
                console.warn(formatted, ...formattedArgs);
                break;
            case this.LEVELS.INFO:
            case this.LEVELS.DEBUG:
            case this.LEVELS.TRACE:
            default:
                console.log(formatted, ...formattedArgs);
                break;
        }
    }

    /**
     * Log at TRACE level (most verbose)
     * Use for: Very detailed debugging, step-by-step execution traces
     */
    trace(functionality, message, ...args) {
        this._log(this.LEVELS.TRACE, functionality, message, ...args);
    }

    /**
     * Log at DEBUG level
     * Use for: Detailed debugging information, internal state
     */
    debug(functionality, message, ...args) {
        this._log(this.LEVELS.DEBUG, functionality, message, ...args);
    }

    /**
     * Log at INFO level
     * Use for: Important events, major milestones, user actions
     */
    info(functionality, message, ...args) {
        this._log(this.LEVELS.INFO, functionality, message, ...args);
    }

    /**
     * Log at WARN level
     * Use for: Warning conditions, potential issues, recoverable errors
     */
    warn(functionality, message, ...args) {
        this._log(this.LEVELS.WARN, functionality, message, ...args);
    }

    /**
     * Log at ERROR level
     * Use for: Error conditions, exceptions, failures
     */
    error(functionality, message, ...args) {
        this._log(this.LEVELS.ERROR, functionality, message, ...args);
    }

    // ====== Configuration Methods ======

    /**
     * Enable ONLY specific functionalities (whitelist mode)
     * All other functionalities will be silenced
     * Example: Logger.enableOnly(['hover', 'gitPush'])
     */
    enableOnly(functionalities) {
        this.config.mode = 'whitelist';
        this.config.enabledFunctionalities = Array.isArray(functionalities) ? functionalities : [functionalities];
        this.config.disabledFunctionalities = [];
        console.log(`[Logger] Whitelist mode: Only logging [${this.config.enabledFunctionalities.join(', ')}]`);
    }

    /**
     * Disable specific functionalities (blacklist mode)
     * All other functionalities will be logged
     * Example: Logger.disable(['tabSwitch', 'dragDrop'])
     */
    disable(functionalities) {
        this.config.mode = 'blacklist';
        this.config.disabledFunctionalities = Array.isArray(functionalities) ? functionalities : [functionalities];
        this.config.enabledFunctionalities = [];
        console.log(`[Logger] Blacklist mode: Disabled [${this.config.disabledFunctionalities.join(', ')}]`);
    }

    /**
     * Enable a single functionality (adds to whitelist or removes from blacklist)
     */
    enable(functionality) {
        if (this.config.mode === 'whitelist') {
            if (!this.config.enabledFunctionalities.includes(functionality)) {
                this.config.enabledFunctionalities.push(functionality);
            }
        } else {
            const index = this.config.disabledFunctionalities.indexOf(functionality);
            if (index > -1) {
                this.config.disabledFunctionalities.splice(index, 1);
            }
        }
        console.log(`[Logger] Enabled functionality: ${functionality}`);
    }

    /**
     * Set minimum log level
     * Example: Logger.setLevel('DEBUG')
     */
    setLevel(level) {
        const levelUpper = level.toUpperCase();
        if (this.LEVELS[levelUpper] !== undefined) {
            this.config.minLevel = this.LEVELS[levelUpper];
            console.log(`[Logger] Log level set to: ${levelUpper}`);
        } else {
            console.warn(`[Logger] Invalid log level: ${level}`);
        }
    }

    /**
     * Set whether to always show errors regardless of functionality filtering
     */
    setAlwaysShowErrors(enabled) {
        this.config.alwaysShowErrors = enabled;
        console.log(`[Logger] Always show errors: ${enabled}`);
    }

    /**
     * Enable or disable all logging
     */
    setEnabled(enabled) {
        this.config.enabled = enabled;
        console.log(`[Logger] Logging ${enabled ? 'enabled' : 'disabled'}`);
    }

    /**
     * Reset to default configuration
     */
    reset() {
        this.config.mode = 'blacklist';
        this.config.enabledFunctionalities = [];
        this.config.disabledFunctionalities = [];
        this.config.minLevel = this.isProduction ? this.LEVELS.ERROR : this.LEVELS.DEBUG;
        this.config.enabled = !this.isProduction;
        console.log('[Logger] Configuration reset to defaults');
    }

    /**
     * Show all functionalities (disable filtering)
     */
    showAll() {
        this.config.mode = 'blacklist';
        this.config.enabledFunctionalities = [];
        this.config.disabledFunctionalities = [];
        console.log('[Logger] Showing all functionalities');
    }

    /**
     * Get current configuration
     */
    getConfig() {
        return { ...this.config };
    }

    /**
     * Load configuration from object
     */
    loadConfig(config) {
        if (config.enabled !== undefined) this.config.enabled = config.enabled;
        if (config.minLevel !== undefined) {
            if (typeof config.minLevel === 'string') {
                this.setLevel(config.minLevel);
            } else {
                this.config.minLevel = config.minLevel;
            }
        }
        if (config.mode !== undefined) this.config.mode = config.mode;
        if (config.enabledFunctionalities !== undefined) this.config.enabledFunctionalities = config.enabledFunctionalities;
        if (config.disabledFunctionalities !== undefined) this.config.disabledFunctionalities = config.disabledFunctionalities;
        if (config.alwaysShowErrors !== undefined) this.config.alwaysShowErrors = config.alwaysShowErrors;
        if (config.useColors !== undefined) this.config.useColors = config.useColors;
        if (config.showTimestamps !== undefined) this.config.showTimestamps = config.showTimestamps;
        if (config.showComponent !== undefined) this.config.showComponent = config.showComponent;

        console.log('[Logger] Configuration loaded');
    }

    /**
     * Utility: List common functionalities
     */
    listFunctionalities() {
        return {
            git: ['gitPush', 'gitPull', 'gitFetch', 'gitCommit', 'gitBranch', 'gitMerge', 'gitConflict', 'gitDiff', 'gitBlame', 'gitHistory'],
            lsp: ['hover', 'goToDefinition', 'findReferences', 'renameSymbol', 'formatting', 'lspClient', 'lspServer'],
            editor: ['editorInit', 'editorChange', 'diffRender', 'syntaxHighlight', 'autocomplete'],
            panes: ['tabSwitch', 'paneCreate', 'paneSplit', 'paneClose', 'dragDrop'],
            files: ['fileOpen', 'fileClose', 'fileSave', 'fileWatch', 'fileSystem'],
            app: ['appInit', 'appShutdown', 'settings', 'perfMonitor'],
            browser: ['browserNav', 'browserProfile', 'browserAutomation']
        };
    }
}

// Export singleton instance
const Logger = new LoggerClass();

// Make it available globally for easy access in console
if (typeof window !== 'undefined') {
    window.Logger = Logger;
}

// CommonJS export
module.exports = Logger;

/**
 * Functionality-based logger for Swarm Server
 * Follows the same pattern as Swarm IDE's logging system
 */

const LOG_LEVELS = {
    ERROR: 0,
    WARN: 1,
    INFO: 2,
    DEBUG: 3,
    TRACE: 4
};

class Logger {
    constructor(level = 'DEBUG') {
        this.level = LOG_LEVELS[level] || LOG_LEVELS.DEBUG;
        this.enabled = true;
        this.alwaysShowErrors = true;

        // Functionality tags for swarm-server
        this.enabledFunctionalities = new Set([
            'terminal',
            'terminalPTY',
            'terminalWebSocket',
            'swarmServer',
            'workspace',
            'http'
        ]);
    }

    _shouldLog(level, functionality) {
        if (!this.enabled) {
            return this.alwaysShowErrors && level === LOG_LEVELS.ERROR;
        }

        if (level > this.level) {
            return false;
        }

        // Always show errors if configured
        if (this.alwaysShowErrors && level === LOG_LEVELS.ERROR) {
            return true;
        }

        // Check if functionality is enabled
        return this.enabledFunctionalities.has(functionality);
    }

    _log(level, levelName, functionality, ...args) {
        if (this._shouldLog(level, functionality)) {
            const timestamp = new Date().toISOString();
            console.log(`[${timestamp}] [${levelName}] [${functionality}]`, ...args);
        }
    }

    error(functionality, ...args) {
        this._log(LOG_LEVELS.ERROR, 'ERROR', functionality, ...args);
    }

    warn(functionality, ...args) {
        this._log(LOG_LEVELS.WARN, 'WARN', functionality, ...args);
    }

    info(functionality, ...args) {
        this._log(LOG_LEVELS.INFO, 'INFO', functionality, ...args);
    }

    debug(functionality, ...args) {
        this._log(LOG_LEVELS.DEBUG, 'DEBUG', functionality, ...args);
    }

    trace(functionality, ...args) {
        this._log(LOG_LEVELS.TRACE, 'TRACE', functionality, ...args);
    }

    enable(functionality) {
        this.enabledFunctionalities.add(functionality);
    }

    disable(functionality) {
        this.enabledFunctionalities.delete(functionality);
    }

    setLevel(level) {
        if (typeof level === 'string') {
            this.level = LOG_LEVELS[level.toUpperCase()] || LOG_LEVELS.DEBUG;
        } else {
            this.level = level;
        }
    }

    setEnabled(enabled) {
        this.enabled = enabled;
    }
}

// Use TRACE level by default for debugging, or read from environment
const logLevel = process.env.LOG_LEVEL || 'TRACE';
module.exports = new Logger(logLevel);

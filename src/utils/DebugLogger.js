/**
 * Debug Logger for SSH Terminal Issues
 * Writes detailed logs to console with structured formatting
 * Falls back to console-only mode in renderer process
 */

class DebugLogger {
    constructor() {
        // Check if we're in renderer or main process
        this.isRenderer = typeof window !== 'undefined';
        this.logPrefix = this.isRenderer ? '[RENDERER DEBUG]' : '[MAIN DEBUG]';
        this.sessionStart = new Date().toISOString();

        this.write('='.repeat(80));
        this.write(`DEBUG LOG SESSION STARTED: ${this.sessionStart}`);
        this.write(`Process: ${this.isRenderer ? 'Renderer' : 'Main'}`);
        this.write('='.repeat(80));
        this.write('');
    }

    write(message) {
        const timestamp = new Date().toISOString();
        const logLine = `${this.logPrefix} [${timestamp}] ${message}`;
        console.log(logLine);
    }

    terminal(message, data = {}) {
        this.write(`[TERMINAL] ${message}`);
        if (Object.keys(data).length > 0) {
            this.write(`           Data: ${JSON.stringify(data, null, 2)}`);
        }
    }

    workspace(message, data = {}) {
        this.write(`[WORKSPACE] ${message}`);
        if (Object.keys(data).length > 0) {
            this.write(`            Data: ${JSON.stringify(data, null, 2)}`);
        }
    }

    ssh(message, data = {}) {
        this.write(`[SSH] ${message}`);
        if (Object.keys(data).length > 0) {
            this.write(`      Data: ${JSON.stringify(data, null, 2)}`);
        }
    }

    error(message, error) {
        this.write(`[ERROR] ${message}`);
        if (error) {
            this.write(`        Error: ${error.message}`);
            this.write(`        Stack: ${error.stack}`);
        }
    }

    separator() {
        this.write('-'.repeat(80));
    }

    section(title) {
        this.write('');
        this.write('='.repeat(80));
        this.write(`  ${title}`);
        this.write('='.repeat(80));
        this.write('');
    }

    getLogPath() {
        return 'console (check DevTools)';
    }
}

// Create singleton instance
const debugLogger = new DebugLogger();

module.exports = debugLogger;

/**
 * CrashLogger - Captures and logs crash information to individual log files
 *
 * Creates timestamped crash log files with full error details, system info,
 * and application state for debugging purposes.
 */

const fs = require('fs').promises;
const path = require('path');
const os = require('os');

class CrashLogger {
    constructor() {
        this.crashLogsDir = null;
        this.initialized = false;
    }

    /**
     * Initialize crash logger with logs directory
     */
    async init() {
        try {
            // Create crash logs directory in user data
            const homeDir = os.homedir();
            this.crashLogsDir = path.join(homeDir, '.swarm-ide', 'crash-logs');

            await fs.mkdir(this.crashLogsDir, { recursive: true });

            this.initialized = true;
            console.log('[CrashLogger] Initialized, logs directory:', this.crashLogsDir);

            // Clean up old crash logs (keep only last 50)
            await this.cleanupOldLogs();
        } catch (error) {
            console.error('[CrashLogger] Failed to initialize:', error);
        }
    }

    /**
     * Log a crash with full details
     */
    async logCrash(crashInfo) {
        if (!this.initialized) {
            console.error('[CrashLogger] Not initialized, cannot log crash');
            return null;
        }

        try {
            const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\./g, '-');
            const filename = `crash-${timestamp}.log`;
            const filepath = path.join(this.crashLogsDir, filename);

            const logContent = this.generateCrashLog(crashInfo);

            await fs.writeFile(filepath, logContent, 'utf-8');

            console.log('[CrashLogger] ✓ Crash log saved:', filepath);
            return filepath;
        } catch (error) {
            console.error('[CrashLogger] Failed to write crash log:', error);
            return null;
        }
    }

    /**
     * Generate formatted crash log content
     */
    generateCrashLog(crashInfo) {
        const now = new Date();
        const sections = [];

        // Header
        sections.push('========================================');
        sections.push('SWARM IDE CRASH REPORT');
        sections.push('========================================');
        sections.push(`Date: ${now.toISOString()}`);
        sections.push(`Local Time: ${now.toLocaleString()}`);
        sections.push('');

        // System Information
        sections.push('========================================');
        sections.push('SYSTEM INFORMATION');
        sections.push('========================================');
        sections.push(`Platform: ${os.platform()}`);
        sections.push(`OS: ${os.type()} ${os.release()}`);
        sections.push(`Arch: ${os.arch()}`);
        sections.push(`CPU: ${os.cpus()[0].model} (${os.cpus().length} cores)`);
        sections.push(`Total Memory: ${(os.totalmem() / 1073741824).toFixed(2)} GB`);
        sections.push(`Free Memory: ${(os.freemem() / 1073741824).toFixed(2)} GB`);
        sections.push(`Uptime: ${(os.uptime() / 3600).toFixed(2)} hours`);
        sections.push('');

        // Application Information
        sections.push('========================================');
        sections.push('APPLICATION INFORMATION');
        sections.push('========================================');
        sections.push(`Electron: ${process.versions.electron || 'N/A'}`);
        sections.push(`Chrome: ${process.versions.chrome || 'N/A'}`);
        sections.push(`Node: ${process.versions.node || 'N/A'}`);
        sections.push(`V8: ${process.versions.v8 || 'N/A'}`);
        sections.push(`Process Type: ${crashInfo.processType || 'unknown'}`);
        sections.push('');

        // Crash Details
        sections.push('========================================');
        sections.push('CRASH DETAILS');
        sections.push('========================================');
        sections.push(`Crash Type: ${crashInfo.type || 'unknown'}`);
        sections.push(`Killed: ${crashInfo.killed !== undefined ? crashInfo.killed : 'N/A'}`);
        sections.push('');

        // Error Information
        if (crashInfo.error) {
            sections.push('========================================');
            sections.push('ERROR INFORMATION');
            sections.push('========================================');
            sections.push(`Name: ${crashInfo.error.name || 'N/A'}`);
            sections.push(`Message: ${crashInfo.error.message || 'N/A'}`);
            sections.push('');

            if (crashInfo.error.stack) {
                sections.push('Stack Trace:');
                sections.push(crashInfo.error.stack);
                sections.push('');
            }
        }

        // Memory Information
        if (crashInfo.memory) {
            sections.push('========================================');
            sections.push('MEMORY INFORMATION');
            sections.push('========================================');
            sections.push(`Used JS Heap: ${(crashInfo.memory.usedJSHeapSize / 1048576).toFixed(2)} MB`);
            sections.push(`Total JS Heap: ${(crashInfo.memory.totalJSHeapSize / 1048576).toFixed(2)} MB`);
            sections.push(`Heap Limit: ${(crashInfo.memory.jsHeapSizeLimit / 1048576).toFixed(2)} MB`);
            sections.push('');
        }

        // Application State
        if (crashInfo.state) {
            sections.push('========================================');
            sections.push('APPLICATION STATE');
            sections.push('========================================');
            sections.push(JSON.stringify(crashInfo.state, null, 2));
            sections.push('');
        }

        // Console Logs (last 100 lines if available)
        if (crashInfo.consoleLogs && crashInfo.consoleLogs.length > 0) {
            sections.push('========================================');
            sections.push('RECENT CONSOLE LOGS');
            sections.push('========================================');
            const logs = crashInfo.consoleLogs.slice(-100);
            logs.forEach(log => sections.push(log));
            sections.push('');
        }

        // Additional Info
        if (crashInfo.additionalInfo) {
            sections.push('========================================');
            sections.push('ADDITIONAL INFORMATION');
            sections.push('========================================');
            sections.push(JSON.stringify(crashInfo.additionalInfo, null, 2));
            sections.push('');
        }

        sections.push('========================================');
        sections.push('END OF CRASH REPORT');
        sections.push('========================================');

        return sections.join('\n');
    }

    /**
     * Get list of all crash logs
     */
    async getCrashLogs() {
        if (!this.initialized) {
            return [];
        }

        try {
            const files = await fs.readdir(this.crashLogsDir);
            const crashLogs = files
                .filter(f => f.startsWith('crash-') && f.endsWith('.log'))
                .map(f => ({
                    filename: f,
                    filepath: path.join(this.crashLogsDir, f),
                    timestamp: this.extractTimestampFromFilename(f)
                }))
                .sort((a, b) => b.timestamp - a.timestamp);

            return crashLogs;
        } catch (error) {
            console.error('[CrashLogger] Failed to list crash logs:', error);
            return [];
        }
    }

    /**
     * Read a crash log file
     */
    async readCrashLog(filename) {
        if (!this.initialized) {
            return null;
        }

        try {
            const filepath = path.join(this.crashLogsDir, filename);
            const content = await fs.readFile(filepath, 'utf-8');
            return content;
        } catch (error) {
            console.error('[CrashLogger] Failed to read crash log:', error);
            return null;
        }
    }

    /**
     * Clean up old crash logs (keep only last 50)
     */
    async cleanupOldLogs() {
        try {
            const logs = await this.getCrashLogs();

            if (logs.length > 50) {
                const logsToDelete = logs.slice(50);
                console.log(`[CrashLogger] Cleaning up ${logsToDelete.length} old crash logs`);

                for (const log of logsToDelete) {
                    await fs.unlink(log.filepath);
                }
            }
        } catch (error) {
            console.error('[CrashLogger] Failed to cleanup old logs:', error);
        }
    }

    /**
     * Extract timestamp from filename
     */
    extractTimestampFromFilename(filename) {
        try {
            // crash-2025-01-15T12-30-45-123Z.log
            const match = filename.match(/crash-(.+)\.log/);
            if (match) {
                const timestampStr = match[1].replace(/-/g, ':').replace(/T/g, 'T').replace(/Z$/, '.000Z');
                return new Date(timestampStr).getTime();
            }
        } catch (error) {
            console.error('[CrashLogger] Failed to extract timestamp:', error);
        }
        return 0;
    }

    /**
     * Get crash logs directory path
     */
    getCrashLogsDirectory() {
        return this.crashLogsDir;
    }
}

// Create singleton instance
const crashLogger = new CrashLogger();

module.exports = crashLogger;

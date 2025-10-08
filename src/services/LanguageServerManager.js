/**
 * LanguageServerManager - Manages language server processes
 *
 * Runs in the Electron main process.
 * Spawns and manages language server processes for different languages.
 * Routes LSP messages between renderer and language servers.
 */

const { spawn } = require('child_process');
const path = require('path');

class LanguageServerManager {
    constructor() {
        this.servers = new Map(); // languageId -> server instance
        this.messageId = 1;
        this.pendingRequests = new Map(); // messageId -> resolve/reject
        this.initialized = new Map(); // languageId -> boolean
    }

    /**
     * Get or start a language server for a given language
     * @param {string} languageId - Language identifier (javascript, typescript, python, etc)
     * @param {string} rootPath - Workspace root path
     * @returns {Promise<Object>} Server instance
     */
    async getServer(languageId, rootPath) {
        // Check if server already exists
        if (this.servers.has(languageId)) {
            return this.servers.get(languageId);
        }

        // Start new server
        const server = await this.startServer(languageId, rootPath);
        this.servers.set(languageId, server);

        return server;
    }

    /**
     * Start a language server process
     * @param {string} languageId - Language identifier
     * @param {string} rootPath - Workspace root path
     * @returns {Promise<Object>} Server instance
     */
    async startServer(languageId, rootPath) {
        console.log(`[LSP] Starting language server for ${languageId}`);

        const serverConfig = this.getServerConfig(languageId);
        if (!serverConfig) {
            throw new Error(`No language server configured for ${languageId}`);
        }

        // Spawn the language server process
        const serverProcess = spawn(serverConfig.command, serverConfig.args, {
            cwd: rootPath || process.cwd(),
            stdio: ['pipe', 'pipe', 'pipe']
        });

        const server = {
            process: serverProcess,
            languageId,
            rootPath,
            outputBuffer: Buffer.alloc(0),
            contentLength: 0
        };

        // Handle server output
        serverProcess.stdout.on('data', (data) => {
            this.handleServerOutput(server, data);
        });

        serverProcess.stderr.on('data', (data) => {
            console.error(`[LSP ${languageId}] STDERR:`, data.toString());
        });

        serverProcess.on('exit', (code) => {
            console.log(`[LSP ${languageId}] Process exited with code ${code}`);
            this.servers.delete(languageId);
            this.initialized.delete(languageId);
        });

        // Initialize the server
        await this.initializeServer(server, rootPath);

        return server;
    }

    /**
     * Get server configuration for a language
     * @param {string} languageId - Language identifier
     * @returns {Object|null} Server configuration
     */
    getServerConfig(languageId) {
        const configs = {
            javascript: {
                command: 'typescript-language-server',
                args: ['--stdio']
            },
            typescript: {
                command: 'typescript-language-server',
                args: ['--stdio']
            }
        };

        // For all other languages, use TypeScript server as fallback
        // It provides basic completion and hover for any text-based file
        return configs[languageId] || {
            command: 'typescript-language-server',
            args: ['--stdio']
        };
    }

    /**
     * Initialize a language server
     * @param {Object} server - Server instance
     * @param {string} rootPath - Workspace root path
     * @returns {Promise<void>}
     */
    async initializeServer(server, rootPath) {
        console.log(`[LSP] Initializing ${server.languageId} server...`);

        const initializeParams = {
            processId: process.pid,
            rootPath: rootPath,
            rootUri: `file://${rootPath}`,
            capabilities: {
                textDocument: {
                    completion: {
                        completionItem: {
                            snippetSupport: true,
                            documentationFormat: ['markdown', 'plaintext']
                        }
                    },
                    hover: {
                        contentFormat: ['markdown', 'plaintext']
                    },
                    signatureHelp: {
                        signatureInformation: {
                            documentationFormat: ['markdown', 'plaintext']
                        }
                    },
                    definition: {
                        linkSupport: true
                    },
                    publishDiagnostics: {}
                }
            },
            workspaceFolders: rootPath ? [{
                uri: `file://${rootPath}`,
                name: path.basename(rootPath)
            }] : null
        };

        const response = await this.sendRequest(server, 'initialize', initializeParams);

        if (response && response.capabilities) {
            console.log(`[LSP] ${server.languageId} server initialized successfully`);
            this.initialized.set(server.languageId, true);

            // Send initialized notification
            this.sendNotification(server, 'initialized', {});
        } else {
            throw new Error(`Failed to initialize ${server.languageId} server`);
        }
    }

    /**
     * Send an LSP request to the server
     * @param {Object} server - Server instance
     * @param {string} method - LSP method name
     * @param {Object} params - Request parameters
     * @returns {Promise<Object>} Response
     */
    async sendRequest(server, method, params) {
        const id = this.messageId++;

        const message = {
            jsonrpc: '2.0',
            id,
            method,
            params
        };

        console.log(`[LSP ${server.languageId}] >>> REQUEST ${id}: ${method}`, JSON.stringify(params).substring(0, 200));

        return new Promise((resolve, reject) => {
            this.pendingRequests.set(id, { resolve, reject });
            this.writeMessage(server, message);

            // Timeout after 10 seconds
            setTimeout(() => {
                if (this.pendingRequests.has(id)) {
                    this.pendingRequests.delete(id);
                    console.error(`[LSP ${server.languageId}] XXX TIMEOUT ${id}: ${method}`);
                    reject(new Error(`Request timeout: ${method}`));
                }
            }, 10000);
        });
    }

    /**
     * Send an LSP notification to the server
     * @param {Object} server - Server instance
     * @param {string} method - LSP method name
     * @param {Object} params - Notification parameters
     */
    sendNotification(server, method, params) {
        const message = {
            jsonrpc: '2.0',
            method,
            params
        };

        console.log(`[LSP ${server.languageId}] >>> NOTIFY: ${method}`);
        this.writeMessage(server, message);
    }

    /**
     * Write a message to the server's stdin
     * @param {Object} server - Server instance
     * @param {Object} message - Message object
     */
    writeMessage(server, message) {
        const content = JSON.stringify(message);
        const header = `Content-Length: ${Buffer.byteLength(content, 'utf8')}\r\n\r\n`;

        server.process.stdin.write(header + content, 'utf8');
    }

    /**
     * Handle output from the language server
     * @param {Object} server - Server instance
     * @param {Buffer} data - Output data
     */
    handleServerOutput(server, data) {
        // Concatenate buffers (proper byte-level handling)
        server.outputBuffer = Buffer.concat([server.outputBuffer, data]);

        while (true) {
            // Parse Content-Length header
            if (server.contentLength === 0) {
                const bufferStr = server.outputBuffer.toString('utf8');
                const headerMatch = bufferStr.match(/Content-Length: (\d+)\r\n\r\n/);
                if (!headerMatch) break;

                server.contentLength = parseInt(headerMatch[1]);
                const headerLength = Buffer.byteLength(headerMatch[0], 'utf8');
                server.outputBuffer = server.outputBuffer.slice(headerLength);
            }

            // Check if we have the full message (compare BYTES, not characters)
            if (server.outputBuffer.length < server.contentLength) break;

            // Extract the message (byte-level slicing)
            const messageBuffer = server.outputBuffer.slice(0, server.contentLength);
            server.outputBuffer = server.outputBuffer.slice(server.contentLength);
            server.contentLength = 0;

            // Parse and handle the message
            try {
                const messageStr = messageBuffer.toString('utf8');
                const message = JSON.parse(messageStr);
                this.handleServerMessage(server, message);
            } catch (error) {
                console.error(`[LSP ${server.languageId}] Failed to parse message:`, error);
                console.error(`[LSP ${server.languageId}] Message content:`, messageBuffer.toString('utf8').substring(0, 200));
            }
        }
    }

    /**
     * Handle a message from the language server
     * @param {Object} server - Server instance
     * @param {Object} message - LSP message
     */
    handleServerMessage(server, message) {
        // Handle response to a request
        if (message.id !== undefined && this.pendingRequests.has(message.id)) {
            const { resolve, reject } = this.pendingRequests.get(message.id);
            this.pendingRequests.delete(message.id);

            if (message.error) {
                console.error(`[LSP ${server.languageId}] <<< ERROR ${message.id}:`, message.error.message);
                reject(new Error(message.error.message));
            } else {
                const resultPreview = JSON.stringify(message.result).substring(0, 200);
                console.log(`[LSP ${server.languageId}] <<< RESPONSE ${message.id}:`, resultPreview);
                resolve(message.result);
            }
        }
        // Handle notification from server
        else if (message.method) {
            console.log(`[LSP ${server.languageId}] <<< NOTIFICATION: ${message.method}`);
            // These will be forwarded to renderer via IPC
        }
    }

    /**
     * Shutdown a language server
     * @param {string} languageId - Language identifier
     */
    async shutdownServer(languageId) {
        const server = this.servers.get(languageId);
        if (!server) return;

        try {
            await this.sendRequest(server, 'shutdown', null);
            this.sendNotification(server, 'exit', null);
        } catch (error) {
            console.error(`[LSP] Error shutting down ${languageId} server:`, error);
        }

        server.process.kill();
        this.servers.delete(languageId);
        this.initialized.delete(languageId);
    }

    /**
     * Shutdown all language servers
     */
    async shutdownAll() {
        const shutdownPromises = [];
        for (const [languageId] of this.servers) {
            shutdownPromises.push(this.shutdownServer(languageId));
        }
        await Promise.all(shutdownPromises);
    }
}

// Export singleton instance
const languageServerManager = new LanguageServerManager();
module.exports = languageServerManager;

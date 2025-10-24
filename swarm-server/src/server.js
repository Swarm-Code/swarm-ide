/**
 * Swarm Server
 * Main HTTP/WebSocket server for workspace-aware terminal management
 */

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const logger = require('./utils/logger');
const workspaceManager = require('./workspace-manager');
const terminalManager = require('./terminal-manager');

class SwarmServer {
    constructor(port = 7777, options = {}) {
        this.port = port;
        this.app = express();
        this.server = null;
        this.wss = null;

        // Auto-shutdown configuration
        this.idleTimeout = options.idleTimeout || 30 * 60 * 1000; // 30 minutes default
        this.shutdownOnIdle = options.shutdownOnIdle !== false; // Enabled by default
        this.lastActivityTime = Date.now();
        this.idleCheckInterval = null;
        this.activeConnections = new Set(); // Track active WebSocket connections

        logger.info(`Auto-shutdown: ${this.shutdownOnIdle ? 'enabled' : 'disabled'}`);
        if (this.shutdownOnIdle) {
            logger.info(`Idle timeout: ${this.idleTimeout / 1000 / 60} minutes`);
        }
    }

    /**
     * Initialize and start the server
     */
    async start() {
        try {
            // Setup Express middleware
            this.setupMiddleware();

            // Setup REST API routes
            this.setupRoutes();

            // Create HTTP server
            this.server = http.createServer(this.app);

            // Setup WebSocket server
            this.setupWebSocket();

            // Start listening
            await new Promise((resolve, reject) => {
                this.server.listen(this.port, (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });

            logger.info(`✅ Swarm Server started on port ${this.port}`);
            logger.info(`   HTTP API: http://localhost:${this.port}`);
            logger.info(`   WebSocket: ws://localhost:${this.port}`);

            // Start idle checker if auto-shutdown is enabled
            if (this.shutdownOnIdle) {
                this.startIdleChecker();
            }

            return true;
        } catch (error) {
            logger.error('Failed to start server:', error);
            throw error;
        }
    }

    /**
     * Setup Express middleware
     */
    setupMiddleware() {
        // Parse JSON bodies
        this.app.use(express.json());

        // CORS headers for development
        this.app.use((req, res, next) => {
            res.header('Access-Control-Allow-Origin', '*');
            res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
            res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');

            if (req.method === 'OPTIONS') {
                return res.sendStatus(200);
            }

            next();
        });

        // Request logging and activity tracking
        this.app.use((req, res, next) => {
            logger.debug(`${req.method} ${req.path}`);
            this.recordActivity(); // Track activity on every request
            next();
        });
    }

    /**
     * Setup REST API routes
     */
    setupRoutes() {
        // Health check
        this.app.get('/health', (req, res) => {
            res.json({
                status: 'ok',
                version: '1.0.0',
                uptime: process.uptime()
            });
        });

        // ===== Workspace Routes =====

        // List all workspaces
        this.app.get('/workspaces', (req, res) => {
            try {
                const workspaces = workspaceManager.listWorkspaces();
                res.json({ workspaces });
            } catch (error) {
                logger.error('GET /workspaces error:', error);
                res.status(500).json({ error: error.message });
            }
        });

        // Get specific workspace
        this.app.get('/workspaces/:id', (req, res) => {
            try {
                const workspace = workspaceManager.getWorkspace(req.params.id);

                if (!workspace) {
                    return res.status(404).json({ error: 'Workspace not found' });
                }

                res.json({ workspace });
            } catch (error) {
                logger.error(`GET /workspaces/${req.params.id} error:`, error);
                res.status(500).json({ error: error.message });
            }
        });

        // Create workspace
        this.app.post('/workspaces', (req, res) => {
            try {
                const { name, path } = req.body;

                if (!name || !path) {
                    return res.status(400).json({
                        error: 'Missing required fields: name, path'
                    });
                }

                const workspace = workspaceManager.createWorkspace(name, path);

                logger.info(`Created workspace: ${workspace.name} (${workspace.id})`);

                res.status(201).json({ workspace });
            } catch (error) {
                logger.error('POST /workspaces error:', error);
                res.status(500).json({ error: error.message });
            }
        });

        // Delete workspace
        this.app.delete('/workspaces/:id', (req, res) => {
            try {
                workspaceManager.deleteWorkspace(req.params.id);

                logger.info(`Deleted workspace: ${req.params.id}`);

                res.json({ success: true });
            } catch (error) {
                logger.error(`DELETE /workspaces/${req.params.id} error:`, error);
                res.status(500).json({ error: error.message });
            }
        });

        // ===== Terminal Routes =====

        // List terminals (optionally filtered by workspace)
        this.app.get('/terminals', (req, res) => {
            try {
                const { workspaceId } = req.query;
                const terminals = terminalManager.listTerminals(workspaceId);

                res.json({ terminals });
            } catch (error) {
                logger.error('GET /terminals error:', error);
                res.status(500).json({ error: error.message });
            }
        });

        // Get specific terminal
        this.app.get('/terminals/:id', (req, res) => {
            try {
                const terminal = terminalManager.getTerminal(req.params.id);

                if (!terminal) {
                    return res.status(404).json({ error: 'Terminal not found' });
                }

                // Return safe subset of terminal data (no ptyProcess)
                res.json({
                    terminal: {
                        id: terminal.id,
                        workspaceId: terminal.workspaceId,
                        pid: terminal.pid,
                        shell: terminal.shell,
                        cwd: terminal.cwd,
                        cols: terminal.cols,
                        rows: terminal.rows,
                        created: terminal.created
                    }
                });
            } catch (error) {
                logger.error(`GET /terminals/${req.params.id} error:`, error);
                res.status(500).json({ error: error.message });
            }
        });

        // Create terminal in workspace
        this.app.post('/workspaces/:workspaceId/terminals', (req, res) => {
            try {
                const { workspaceId } = req.params;
                const options = req.body;

                const terminal = terminalManager.createTerminal(workspaceId, options);

                logger.info(`Created terminal ${terminal.id} in workspace ${workspaceId}`);

                res.status(201).json({ terminal });
            } catch (error) {
                logger.error(`POST /workspaces/${req.params.workspaceId}/terminals error:`, error);
                res.status(500).json({ error: error.message });
            }
        });

        // Write to terminal (send input)
        this.app.post('/terminals/:id/input', (req, res) => {
            try {
                const { data } = req.body;

                if (data === undefined) {
                    return res.status(400).json({ error: 'Missing data field' });
                }

                terminalManager.writeToTerminal(req.params.id, data);

                res.json({ success: true });
            } catch (error) {
                logger.error(`POST /terminals/${req.params.id}/input error:`, error);
                res.status(500).json({ error: error.message });
            }
        });

        // Resize terminal
        this.app.post('/terminals/:id/resize', (req, res) => {
            try {
                const { cols, rows } = req.body;

                if (!cols || !rows) {
                    return res.status(400).json({
                        error: 'Missing required fields: cols, rows'
                    });
                }

                terminalManager.resizeTerminal(req.params.id, cols, rows);

                res.json({ success: true });
            } catch (error) {
                logger.error(`POST /terminals/${req.params.id}/resize error:`, error);
                res.status(500).json({ error: error.message });
            }
        });

        // Kill terminal
        this.app.delete('/terminals/:id', (req, res) => {
            try {
                terminalManager.killTerminal(req.params.id);

                logger.info(`Killed terminal: ${req.params.id}`);

                res.json({ success: true });
            } catch (error) {
                logger.error(`DELETE /terminals/${req.params.id} error:`, error);
                res.status(500).json({ error: error.message });
            }
        });
    }

    /**
     * Setup WebSocket server for terminal streaming
     */
    setupWebSocket() {
        // Don't use 'path' option - we need to accept /terminals/:id/stream
        // and we'll validate the path in the connection handler
        this.wss = new WebSocket.Server({
            server: this.server
        });

        this.wss.on('connection', (ws, req) => {
            // Extract terminal ID from URL path
            // Expected format: /terminals/:terminalId/stream
            const match = req.url.match(/\/terminals\/([^\/]+)\/stream/);

            if (!match) {
                logger.warn('WebSocket connection without terminal ID');
                ws.close(1008, 'Missing terminal ID in URL');
                return;
            }

            const terminalId = match[1];

            logger.info('terminalWebSocket', `WebSocket connected for terminal: ${terminalId}`);
            logger.trace('terminalWebSocket', `WebSocket connection details:`, {
                terminalId,
                url: req.url,
                origin: req.headers.origin
            });

            // Track active connection
            this.activeConnections.add(ws);
            this.recordActivity();

            try {
                const terminal = terminalManager.getTerminal(terminalId);

                if (!terminal) {
                    logger.warn(`WebSocket connection for non-existent terminal: ${terminalId}`);
                    ws.close(1008, 'Terminal not found');
                    return;
                }

                // Setup terminal data handler (terminal output -> WebSocket)
                const onData = (data) => {
                    console.log(`[Server] 🔥🔥 onData callback triggered, data length: ${data.length}, WS state: ${ws.readyState}`);
                    logger.trace('terminalWebSocket', `🔥🔥 onData callback triggered for ${terminalId}`, {
                        dataLength: data.length,
                        wsState: ws.readyState,
                        wsStateText: ws.readyState === 1 ? 'OPEN' : ws.readyState === 0 ? 'CONNECTING' : ws.readyState === 2 ? 'CLOSING' : 'CLOSED',
                        dataPreview: data.substring(0, 100).replace(/\r/g, '\\r').replace(/\n/g, '\\n')
                    });

                    if (ws.readyState === WebSocket.OPEN) {
                        console.log(`[Server] ✅ Sending data message via WebSocket`);
                        const message = JSON.stringify({
                            type: 'data',
                            data: data
                        });
                        logger.trace('terminalWebSocket', `✅ Sending data message via WebSocket`, {
                            messageLength: message.length,
                            terminalId
                        });
                        ws.send(message);
                        logger.trace('terminalWebSocket', `✅ WebSocket.send() completed successfully`);
                    } else {
                        console.error(`[Server] ❌ WebSocket NOT OPEN, cannot send data`);
                        logger.error('terminalWebSocket', `❌ WebSocket NOT OPEN, cannot send data`, {
                            wsState: ws.readyState,
                            terminalId
                        });
                    }
                };

                // Setup terminal exit handler
                const onExit = (exitCode, signal) => {
                    logger.info(`Terminal ${terminalId} exited: code=${exitCode}, signal=${signal}`);

                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({
                            type: 'exit',
                            exitCode,
                            signal
                        }));
                        ws.close(1000, 'Terminal exited');
                    }
                };

                // Attach handlers to terminal
                logger.trace('terminalWebSocket', `Attaching client handlers to terminal ${terminalId}`);
                terminalManager.attachHandlers(terminalId, onData, onExit);
                logger.trace('terminalWebSocket', `✅ Client handlers attached successfully`);

                // Handle WebSocket messages (input from client -> terminal)
                ws.on('message', (message) => {
                    try {
                        const msg = JSON.parse(message);
                        logger.trace('terminalWebSocket', `📨 Received WebSocket message`, {
                            type: msg.type,
                            terminalId
                        });

                        if (msg.type === 'input' && msg.data !== undefined) {
                            terminalManager.writeToTerminal(terminalId, msg.data);
                        } else if (msg.type === 'resize' && msg.cols && msg.rows) {
                            terminalManager.resizeTerminal(terminalId, msg.cols, msg.rows);
                        } else {
                            logger.warn('terminalWebSocket', `Unknown WebSocket message type: ${msg.type}`);
                        }
                    } catch (error) {
                        logger.error('terminalWebSocket', 'WebSocket message error:', error);
                    }
                });

                // Handle WebSocket close
                ws.on('close', () => {
                    logger.info('terminalWebSocket', `WebSocket disconnected for terminal: ${terminalId}`);
                    // Remove from active connections
                    this.activeConnections.delete(ws);
                    // ✅ FIX: Remove client handlers when WebSocket closes
                    terminalManager.detachHandlers(terminalId, onData, onExit);
                    // Note: We don't kill the terminal on disconnect
                    // This allows session persistence across client reconnections
                });

                // Handle WebSocket errors
                ws.on('error', (error) => {
                    logger.error('terminalWebSocket', `WebSocket error for terminal ${terminalId}:`, error);
                });

                // Send connection confirmation
                const connectedMsg = JSON.stringify({
                    type: 'connected',
                    terminalId: terminalId,
                    pid: terminal.pid
                });
                logger.trace('terminalWebSocket', `Sending 'connected' confirmation`, {
                    terminalId,
                    pid: terminal.pid
                });
                ws.send(connectedMsg);
                logger.trace('terminalWebSocket', `✅ 'connected' message sent successfully`);

            } catch (error) {
                logger.error('WebSocket connection error:', error);
                ws.close(1011, 'Internal server error');
            }
        });

        logger.info('WebSocket server initialized');
    }

    /**
     * Record activity - resets the idle timer
     */
    recordActivity() {
        this.lastActivityTime = Date.now();
    }

    /**
     * Start the idle checker interval
     */
    startIdleChecker() {
        // Check every minute
        this.idleCheckInterval = setInterval(() => {
            this.checkIdleStatus();
        }, 60 * 1000);

        logger.info('Idle checker started');
    }

    /**
     * Check if server has been idle and shutdown if necessary
     */
    checkIdleStatus() {
        const idleTime = Date.now() - this.lastActivityTime;
        const idleMinutes = Math.floor(idleTime / 1000 / 60);

        // Check if there are active connections
        const hasActiveConnections = this.activeConnections.size > 0;

        if (hasActiveConnections) {
            // Active connections - reset idle timer
            this.recordActivity();
            logger.debug(`Active connections: ${this.activeConnections.size}, idle timer reset`);
            return;
        }

        logger.debug(`Idle for ${idleMinutes} minutes (threshold: ${this.idleTimeout / 1000 / 60} minutes)`);

        if (idleTime >= this.idleTimeout) {
            logger.warn(`⏰ Server has been idle for ${idleMinutes} minutes. Shutting down...`);
            this.shutdown();
        }
    }

    /**
     * Gracefully shutdown the server
     */
    async shutdown() {
        logger.info('🛑 Graceful shutdown initiated...');

        // Stop idle checker
        if (this.idleCheckInterval) {
            clearInterval(this.idleCheckInterval);
        }

        // Close all terminals
        logger.info('Closing all terminals...');
        try {
            const terminals = terminalManager.listTerminals();
            for (const terminal of terminals) {
                await terminalManager.killTerminal(terminal.id);
            }
        } catch (error) {
            logger.error('Error closing terminals:', error);
        }

        // Stop server
        await this.stop();

        // Exit process
        logger.info('👋 Server shutdown complete. Exiting...');
        process.exit(0);
    }

    /**
     * Stop the server
     */
    async stop() {
        logger.info('Stopping Swarm Server...');

        // Close WebSocket server
        if (this.wss) {
            this.wss.close();
        }

        // Close HTTP server
        if (this.server) {
            await new Promise((resolve) => {
                this.server.close(resolve);
            });
        }

        logger.info('✅ Swarm Server stopped');
    }
}

module.exports = SwarmServer;

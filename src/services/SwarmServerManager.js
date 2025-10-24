/**
 * Swarm Server Manager
 * Manages connection to swarm-server for remote terminal management
 */

const logger = require('../utils/Logger');

class SwarmServerManager {
    constructor() {
        this.serverUrl = null;
        this.workspaceMap = new Map(); // Maps local workspace ID to server workspace ID
        this.isConnected = false;
        this.connectionType = null; // 'direct' or 'ssh-tunnel'
    }

    /**
     * Connect to swarm-server (either direct or via SSH tunnel)
     * @param {string} url - Server URL (e.g., 'http://localhost:7777')
     * @param {string} type - Connection type: 'direct' or 'ssh-tunnel'
     */
    async connect(url, type = 'direct') {
        this.serverUrl = url;
        this.connectionType = type;

        try {
            // Test connection with health check (via IPC to main process)
            logger.debug('swarmServer', `Making health check request to: ${this.serverUrl}/health`);

            const result = await window.electronAPI.swarmServerHealthCheck(`${this.serverUrl}/health`);

            if (!result.success) {
                throw new Error(result.error || 'Health check failed');
            }

            if (result.status !== 200) {
                throw new Error(`Health check failed with status: ${result.status}`);
            }

            const health = result.data;

            this.isConnected = true;

            logger.info('swarmServer', `Connected to Swarm Server at ${this.serverUrl}`);
            logger.info('swarmServer', `  Version: ${health.version}`);
            logger.info('swarmServer', `  Connection: ${this.connectionType}`);

            return true;
        } catch (error) {
            logger.error('swarmServer', `Failed to connect to swarm-server:`, error);
            this.isConnected = false;
            throw error;
        }
    }

    /**
     * Disconnect from swarm-server
     */
    disconnect() {
        this.serverUrl = null;
        this.isConnected = false;
        this.workspaceMap.clear();

        logger.info('swarmServer', 'Disconnected from Swarm Server');
    }

    /**
     * Check if connected to swarm-server
     */
    isServerConnected() {
        return this.isConnected;
    }

    /**
     * Create or get workspace on swarm-server
     * @param {string} name - Workspace name
     * @param {string} remotePath - Path on remote machine
     * @param {string} localWorkspaceId - Local workspace ID for mapping
     */
    async createWorkspace(name, remotePath, localWorkspaceId) {
        if (!this.isConnected) {
            throw new Error('Not connected to swarm-server');
        }

        try {
            logger.debug('swarmServer', `Creating workspace on server: ${name} at ${remotePath}`);

            const response = await fetch(`${this.serverUrl}/workspaces`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    name,
                    path: remotePath
                })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || `Failed to create workspace: ${response.status}`);
            }

            const data = await response.json();
            const serverWorkspace = data.workspace;

            // Store mapping
            this.workspaceMap.set(localWorkspaceId, serverWorkspace.id);

            logger.info('swarmServer', `Created server workspace: ${serverWorkspace.id} (${serverWorkspace.name})`);

            return serverWorkspace;
        } catch (error) {
            logger.error('swarmServer', `Failed to create workspace:`, error);
            throw error;
        }
    }

    /**
     * List workspaces on swarm-server
     */
    async listWorkspaces() {
        if (!this.isConnected) {
            throw new Error('Not connected to swarm-server');
        }

        try {
            const response = await fetch(`${this.serverUrl}/workspaces`);

            if (!response.ok) {
                throw new Error(`Failed to list workspaces: ${response.status}`);
            }

            const data = await response.json();
            return data.workspaces;
        } catch (error) {
            logger.error('swarmServer', `Failed to list workspaces:`, error);
            throw error;
        }
    }

    /**
     * Delete workspace on swarm-server
     * @param {string} localWorkspaceId - Local workspace ID
     */
    async deleteWorkspace(localWorkspaceId) {
        if (!this.isConnected) {
            throw new Error('Not connected to swarm-server');
        }

        const serverWorkspaceId = this.workspaceMap.get(localWorkspaceId);

        if (!serverWorkspaceId) {
            logger.warn('swarmServer', `No server workspace found for local workspace: ${localWorkspaceId}`);
            return;
        }

        try {
            const response = await fetch(`${this.serverUrl}/workspaces/${serverWorkspaceId}`, {
                method: 'DELETE'
            });

            if (!response.ok) {
                throw new Error(`Failed to delete workspace: ${response.status}`);
            }

            this.workspaceMap.delete(localWorkspaceId);

            logger.info('swarmServer', `Deleted server workspace: ${serverWorkspaceId}`);
        } catch (error) {
            logger.error('swarmServer', `Failed to delete workspace:`, error);
            throw error;
        }
    }

    /**
     * Create terminal on swarm-server
     * @param {string} localWorkspaceId - Local workspace ID
     * @param {Object} options - Terminal options (cols, rows, shell, env)
     */
    async createTerminal(localWorkspaceId, options = {}) {
        if (!this.isConnected) {
            throw new Error('Not connected to swarm-server');
        }

        const serverWorkspaceId = this.workspaceMap.get(localWorkspaceId);

        if (!serverWorkspaceId) {
            throw new Error(`No server workspace found for local workspace: ${localWorkspaceId}`);
        }

        try {
            logger.debug('swarmServer', `Creating terminal in server workspace: ${serverWorkspaceId}`);

            const response = await fetch(`${this.serverUrl}/workspaces/${serverWorkspaceId}/terminals`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(options)
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || `Failed to create terminal: ${response.status}`);
            }

            const data = await response.json();
            const terminal = data.terminal;

            logger.info('swarmServer', `Created server terminal: ${terminal.id} (PID: ${terminal.pid})`);

            return terminal;
        } catch (error) {
            logger.error('swarmServer', `Failed to create terminal:`, error);
            throw error;
        }
    }

    /**
     * List terminals on swarm-server
     * @param {string} localWorkspaceId - Optional local workspace ID to filter
     */
    async listTerminals(localWorkspaceId = null) {
        if (!this.isConnected) {
            throw new Error('Not connected to swarm-server');
        }

        try {
            let url = `${this.serverUrl}/terminals`;

            if (localWorkspaceId) {
                const serverWorkspaceId = this.workspaceMap.get(localWorkspaceId);
                if (serverWorkspaceId) {
                    url += `?workspaceId=${serverWorkspaceId}`;
                }
            }

            const response = await fetch(url);

            if (!response.ok) {
                throw new Error(`Failed to list terminals: ${response.status}`);
            }

            const data = await response.json();
            return data.terminals;
        } catch (error) {
            logger.error('swarmServer', `Failed to list terminals:`, error);
            throw error;
        }
    }

    /**
     * Kill terminal on swarm-server
     * @param {string} terminalId - Server terminal ID
     */
    async killTerminal(terminalId) {
        if (!this.isConnected) {
            throw new Error('Not connected to swarm-server');
        }

        try {
            const response = await fetch(`${this.serverUrl}/terminals/${terminalId}`, {
                method: 'DELETE'
            });

            if (!response.ok) {
                throw new Error(`Failed to kill terminal: ${response.status}`);
            }

            logger.info('swarmServer', `Killed server terminal: ${terminalId}`);
        } catch (error) {
            logger.error('swarmServer', `Failed to kill terminal:`, error);
            throw error;
        }
    }

    /**
     * Write to terminal (send input)
     * @param {string} terminalId - Server terminal ID
     * @param {string} data - Data to write
     */
    async writeToTerminal(terminalId, data) {
        if (!this.isConnected) {
            throw new Error('Not connected to swarm-server');
        }

        try {
            const response = await fetch(`${this.serverUrl}/terminals/${terminalId}/input`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ data })
            });

            if (!response.ok) {
                throw new Error(`Failed to write to terminal: ${response.status}`);
            }
        } catch (error) {
            logger.error('swarmServer', `Failed to write to terminal:`, error);
            throw error;
        }
    }

    /**
     * Resize terminal
     * @param {string} terminalId - Server terminal ID
     * @param {number} cols - Number of columns
     * @param {number} rows - Number of rows
     */
    async resizeTerminal(terminalId, cols, rows) {
        if (!this.isConnected) {
            throw new Error('Not connected to swarm-server');
        }

        try {
            const response = await fetch(`${this.serverUrl}/terminals/${terminalId}/resize`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ cols, rows })
            });

            if (!response.ok) {
                throw new Error(`Failed to resize terminal: ${response.status}`);
            }
        } catch (error) {
            logger.error('swarmServer', `Failed to resize terminal:`, error);
            throw error;
        }
    }

    /**
     * Connect to terminal WebSocket for streaming I/O
     * @param {string} terminalId - Server terminal ID
     * @param {Function} onData - Callback for terminal output
     * @param {Function} onExit - Callback for terminal exit
     */
    connectTerminalWebSocket(terminalId, onData, onExit) {
        if (!this.isConnected) {
            throw new Error('Not connected to swarm-server');
        }

        // Convert HTTP URL to WebSocket URL
        const wsUrl = this.serverUrl.replace(/^http/, 'ws');
        const fullWsUrl = `${wsUrl}/terminals/${terminalId}/stream`;

        console.log(`[SwarmServerManager] 🔌 Connecting via IPC proxy to: ${fullWsUrl}`);
        logger.info('swarmServer', `Connecting WebSocket via IPC to: ${fullWsUrl}`);

        // Use IPC-based WebSocket proxy to avoid CSP restrictions
        window.electronAPI.swarmServerWsConnect(
            fullWsUrl,
            terminalId,
            () => {
                console.log(`[SwarmServerManager] ✅ WebSocket OPENED (via IPC) for terminal: ${terminalId}`);
                logger.info('swarmServer', `WebSocket connected for terminal: ${terminalId}`);
            },
            (msg) => {
                console.log(`[SwarmServerManager] 📨 WebSocket message (via IPC):`, JSON.stringify(msg));

                if (msg.type === 'data' && onData) {
                    console.log(`[SwarmServerManager] ✅ Message type 'data' - calling onData callback with:`, {
                        dataLength: msg.data ? msg.data.length : 0,
                        dataPreview: msg.data ? msg.data.substring(0, 50) : 'null'
                    });
                    onData(msg.data);
                } else if (msg.type === 'exit' && onExit) {
                    console.log(`[SwarmServerManager] ⚠️  Message type 'exit'`);
                    onExit(msg.exitCode, msg.signal);
                } else if (msg.type === 'connected') {
                    console.log(`[SwarmServerManager] ℹ️  Message type 'connected'`);
                    logger.info('swarmServer', `Terminal connected: ${msg.terminalId} (PID: ${msg.pid})`);
                } else {
                    console.error(`[SwarmServerManager] ❌ UNKNOWN message type: ${msg.type}`, msg);
                }
            },
            (code, reason) => {
                console.log(`[SwarmServerManager] 🔴 WebSocket CLOSED (via IPC) for terminal: ${terminalId}`, {
                    code,
                    reason
                });
                logger.debug('swarmServer', `WebSocket closed for terminal: ${terminalId} (code: ${code}, reason: ${reason})`);
            },
            (error) => {
                console.error(`[SwarmServerManager] ❌ WebSocket ERROR (via IPC) for terminal ${terminalId}:`, error);
                logger.error('swarmServer', `WebSocket error for terminal ${terminalId}:`, error);
            }
        );

        // Return a proxy object that mimics WebSocket interface
        return {
            close: () => {
                window.electronAPI.swarmServerWsClose(terminalId);
            }
        };
    }

    /**
     * Get server workspace ID from local workspace ID
     */
    getServerWorkspaceId(localWorkspaceId) {
        return this.workspaceMap.get(localWorkspaceId);
    }
}

module.exports = new SwarmServerManager();

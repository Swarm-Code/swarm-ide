/**
 * Workspace Manager
 * Handles workspace creation, deletion, and tracking
 */

const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const logger = require('./utils/logger');
const storage = require('./utils/storage');

class WorkspaceManager {
    constructor() {
        this.workspaces = new Map();
        this.loadWorkspaces();
    }

    loadWorkspaces() {
        const data = storage.load('workspaces', { workspaces: [] });

        for (const workspace of data.workspaces) {
            this.workspaces.set(workspace.id, workspace);
        }

        logger.info(`Loaded ${this.workspaces.size} workspaces`);
    }

    saveWorkspaces() {
        const data = {
            workspaces: Array.from(this.workspaces.values())
        };

        storage.save('workspaces', data);
    }

    createWorkspace(name, path) {
        // Validate path exists
        if (!fs.existsSync(path)) {
            throw new Error(`Path does not exist: ${path}`);
        }

        const workspace = {
            id: `ws_${uuidv4().replace(/-/g, '')}`,
            name,
            path,
            terminals: [],
            created: new Date().toISOString(),
            lastAccessed: new Date().toISOString()
        };

        this.workspaces.set(workspace.id, workspace);
        this.saveWorkspaces();

        logger.info(`Created workspace: ${workspace.name} (${workspace.id}) at ${workspace.path}`);

        return workspace;
    }

    getWorkspace(id) {
        const workspace = this.workspaces.get(id);

        if (workspace) {
            workspace.lastAccessed = new Date().toISOString();
            this.saveWorkspaces();
        }

        return workspace;
    }

    listWorkspaces() {
        return Array.from(this.workspaces.values());
    }

    deleteWorkspace(id) {
        const workspace = this.workspaces.get(id);

        if (!workspace) {
            throw new Error(`Workspace not found: ${id}`);
        }

        // TODO: Kill all terminals in workspace
        if (workspace.terminals.length > 0) {
            logger.warn(`Deleting workspace with ${workspace.terminals.length} active terminals`);
        }

        this.workspaces.delete(id);
        this.saveWorkspaces();

        logger.info(`Deleted workspace: ${workspace.name} (${id})`);

        return true;
    }

    addTerminalToWorkspace(workspaceId, terminalId) {
        const workspace = this.workspaces.get(workspaceId);

        if (!workspace) {
            throw new Error(`Workspace not found: ${workspaceId}`);
        }

        if (!workspace.terminals.includes(terminalId)) {
            workspace.terminals.push(terminalId);
            workspace.lastAccessed = new Date().toISOString();
            this.saveWorkspaces();
        }
    }

    removeTerminalFromWorkspace(workspaceId, terminalId) {
        const workspace = this.workspaces.get(workspaceId);

        if (workspace) {
            workspace.terminals = workspace.terminals.filter(id => id !== terminalId);
            this.saveWorkspaces();
        }
    }
}

module.exports = new WorkspaceManager();

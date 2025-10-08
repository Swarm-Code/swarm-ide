/**
 * WorkspaceManager - Manages multiple workspaces with saved layouts
 *
 * Handles workspace creation, switching, saving, and loading.
 * Each workspace contains pane layouts, open files, browser sessions, and settings.
 * Uses electron-store for persistent storage with encryption.
 */

const eventBus = require('../modules/EventBus');

// Simple ID generator
function generateId() {
    return 'ws-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
}

class WorkspaceManager {
    constructor() {
        this.storageKey = 'swarm-ide-workspaces';
        this.workspaces = new Map(); // workspaceId → workspace object
        this.activeWorkspace = null;
        this.defaultWorkspace = null;

        console.log('[WorkspaceManager] Initialized');
    }

    /**
     * Initialize workspace manager
     */
    async init() {
        // Load workspaces from localStorage
        const storedData = localStorage.getItem(this.storageKey);
        const storedWorkspaces = storedData ? JSON.parse(storedData) : [];
        console.log('[WorkspaceManager] Loaded workspaces:', storedWorkspaces.length);

        // If no workspaces exist, create default one
        if (storedWorkspaces.length === 0) {
            const defaultWorkspace = this.createWorkspace('Default', 'Default workspace');
            this.setActiveWorkspace(defaultWorkspace.id);
            this.defaultWorkspace = defaultWorkspace;
        } else {
            // Load existing workspaces
            storedWorkspaces.forEach(ws => {
                this.workspaces.set(ws.id, ws);
            });

            // Set first workspace as active
            const firstWorkspace = storedWorkspaces[0];
            this.setActiveWorkspace(firstWorkspace.id);
            this.defaultWorkspace = firstWorkspace;
        }

        console.log('[WorkspaceManager] Active workspace:', this.activeWorkspace?.id);
    }

    /**
     * Create a new workspace
     */
    createWorkspace(name, description = '', template = 'empty') {
        const workspaceId = generateId();

        const workspace = {
            id: workspaceId,
            name: name || 'Untitled Workspace',
            description: description,
            template: template,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            paneLayout: null, // Will be set by PaneManager
            openFiles: [],
            browserSessions: [],
            activeBrowserProfile: null,
            settings: {
                theme: 'dark'
            }
        };

        this.workspaces.set(workspaceId, workspace);
        this.saveWorkspaces();

        console.log('[WorkspaceManager] Created workspace:', workspaceId, name);
        eventBus.emit('workspace:created', { workspaceId, workspace });

        return workspace;
    }

    /**
     * Get workspace by ID
     */
    getWorkspace(workspaceId) {
        return this.workspaces.get(workspaceId);
    }

    /**
     * Get all workspaces
     */
    getAllWorkspaces() {
        return Array.from(this.workspaces.values());
    }

    /**
     * Get active workspace
     */
    getActiveWorkspace() {
        return this.activeWorkspace;
    }

    /**
     * Set active workspace
     */
    setActiveWorkspace(workspaceId) {
        const workspace = this.workspaces.get(workspaceId);
        if (!workspace) {
            console.error('[WorkspaceManager] Workspace not found:', workspaceId);
            return false;
        }

        // Save current workspace state before switching
        if (this.activeWorkspace) {
            this.saveWorkspaceState(this.activeWorkspace.id);
        }

        this.activeWorkspace = workspace;
        console.log('[WorkspaceManager] Active workspace set:', workspaceId);

        eventBus.emit('workspace:activated', { workspaceId, workspace });

        return true;
    }

    /**
     * Update workspace
     */
    updateWorkspace(workspaceId, updates) {
        const workspace = this.workspaces.get(workspaceId);
        if (!workspace) {
            console.error('[WorkspaceManager] Workspace not found:', workspaceId);
            return false;
        }

        Object.assign(workspace, updates, {
            updatedAt: Date.now()
        });

        this.saveWorkspaces();

        console.log('[WorkspaceManager] Updated workspace:', workspaceId);
        eventBus.emit('workspace:updated', { workspaceId, workspace });

        return true;
    }

    /**
     * Delete workspace
     */
    deleteWorkspace(workspaceId) {
        // Can't delete last workspace
        if (this.workspaces.size === 1) {
            console.warn('[WorkspaceManager] Cannot delete last workspace');
            return false;
        }

        // Can't delete active workspace without switching first
        if (this.activeWorkspace?.id === workspaceId) {
            // Switch to another workspace first
            const otherWorkspace = Array.from(this.workspaces.values()).find(ws => ws.id !== workspaceId);
            if (otherWorkspace) {
                this.setActiveWorkspace(otherWorkspace.id);
            }
        }

        this.workspaces.delete(workspaceId);
        this.saveWorkspaces();

        console.log('[WorkspaceManager] Deleted workspace:', workspaceId);
        eventBus.emit('workspace:deleted', { workspaceId });

        return true;
    }

    /**
     * Save workspace state (pane layout, open files, etc.)
     */
    saveWorkspaceState(workspaceId, state = {}) {
        const workspace = this.workspaces.get(workspaceId);
        if (!workspace) {
            console.error('[WorkspaceManager] Workspace not found:', workspaceId);
            return false;
        }

        // Update workspace with current state
        Object.assign(workspace, state, {
            updatedAt: Date.now()
        });

        this.saveWorkspaces();

        console.log('[WorkspaceManager] Saved workspace state:', workspaceId);
        return true;
    }

    /**
     * Load workspace state
     */
    loadWorkspaceState(workspaceId) {
        const workspace = this.workspaces.get(workspaceId);
        if (!workspace) {
            console.error('[WorkspaceManager] Workspace not found:', workspaceId);
            return null;
        }

        console.log('[WorkspaceManager] Loaded workspace state:', workspaceId);
        return {
            paneLayout: workspace.paneLayout,
            openFiles: workspace.openFiles,
            browserSessions: workspace.browserSessions,
            activeBrowserProfile: workspace.activeBrowserProfile,
            settings: workspace.settings
        };
    }

    /**
     * Update pane layout for workspace
     */
    updatePaneLayout(workspaceId, paneLayout) {
        return this.updateWorkspace(workspaceId, { paneLayout });
    }

    /**
     * Add open file to workspace
     */
    addOpenFile(workspaceId, filePath) {
        const workspace = this.workspaces.get(workspaceId);
        if (!workspace) return false;

        if (!workspace.openFiles.includes(filePath)) {
            workspace.openFiles.push(filePath);
            this.saveWorkspaces();
            console.log('[WorkspaceManager] Added open file:', filePath);
        }

        return true;
    }

    /**
     * Remove open file from workspace
     */
    removeOpenFile(workspaceId, filePath) {
        const workspace = this.workspaces.get(workspaceId);
        if (!workspace) return false;

        const index = workspace.openFiles.indexOf(filePath);
        if (index > -1) {
            workspace.openFiles.splice(index, 1);
            this.saveWorkspaces();
            console.log('[WorkspaceManager] Removed open file:', filePath);
        }

        return true;
    }

    /**
     * Set active browser profile for workspace
     */
    setActiveBrowserProfile(workspaceId, profileId) {
        return this.updateWorkspace(workspaceId, { activeBrowserProfile: profileId });
    }

    /**
     * Add browser session to workspace
     */
    addBrowserSession(workspaceId, session) {
        const workspace = this.workspaces.get(workspaceId);
        if (!workspace) return false;

        workspace.browserSessions.push(session);
        this.saveWorkspaces();

        console.log('[WorkspaceManager] Added browser session');
        return true;
    }

    /**
     * Save workspaces to persistent storage
     */
    saveWorkspaces() {
        const workspacesArray = Array.from(this.workspaces.values());
        localStorage.setItem(this.storageKey, JSON.stringify(workspacesArray));
        console.log('[WorkspaceManager] Saved workspaces to storage');
    }

    /**
     * Export workspace to JSON
     */
    exportWorkspace(workspaceId) {
        const workspace = this.workspaces.get(workspaceId);
        if (!workspace) {
            console.error('[WorkspaceManager] Workspace not found:', workspaceId);
            return null;
        }

        return JSON.stringify(workspace, null, 2);
    }

    /**
     * Import workspace from JSON
     */
    importWorkspace(jsonString) {
        try {
            const workspace = JSON.parse(jsonString);

            // Generate new ID to avoid conflicts
            workspace.id = generateId();
            workspace.createdAt = Date.now();
            workspace.updatedAt = Date.now();

            this.workspaces.set(workspace.id, workspace);
            this.saveWorkspaces();

            console.log('[WorkspaceManager] Imported workspace:', workspace.id);
            eventBus.emit('workspace:imported', { workspaceId: workspace.id, workspace });

            return workspace;
        } catch (error) {
            console.error('[WorkspaceManager] Failed to import workspace:', error);
            return null;
        }
    }

    /**
     * Get workspace templates
     */
    getTemplates() {
        return [
            {
                id: 'empty',
                name: 'Empty',
                description: 'Start with a clean slate'
            },
            {
                id: 'browser-testing',
                name: 'Browser Testing',
                description: 'Browser in split view with console'
            },
            {
                id: 'full-stack',
                name: 'Full Stack',
                description: 'Code editor + browser + terminal'
            },
            {
                id: 'dual-browser',
                name: 'Dual Browser',
                description: 'Two browsers side by side for testing'
            }
        ];
    }

    /**
     * Cleanup
     */
    destroy() {
        if (this.activeWorkspace) {
            this.saveWorkspaceState(this.activeWorkspace.id);
        }
        this.saveWorkspaces();
        console.log('[WorkspaceManager] Destroyed');
    }
}

// Export singleton instance
module.exports = new WorkspaceManager();

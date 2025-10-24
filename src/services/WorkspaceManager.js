/**
 * WorkspaceManager - Manages multiple directory-based workspace contexts
 *
 * ENHANCED to support:
 * - Directory-based workspaces (each workspace = a project folder)
 * - Terminal persistence across workspace switches
 * - Pane hiding/showing instead of destruction
 * - SSH workspace support with connection tracking
 * - Multi-project development in same IDE instance
 *
 * Each workspace contains:
 * - Root directory path (local or ssh://)
 * - Associated panes and their layouts (hidden when not active)
 * - Running terminals (persist across switches)
 * - Open files and editors
 * - Git state and LSP servers
 */

const eventBus = require('../modules/EventBus');
const logger = require('../utils/Logger');
const config = require('../modules/Config');

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
        this.lastWorkspaceId = null; // Track last workspace for "Open Previous Workspace" feature

        // Config for settings (singleton instance)
        this.config = config;

        // NEW: Reference to PaneManager for pane manipulation
        this.paneManager = null;

        // NEW: Reference to FileExplorer for directory navigation
        this.fileExplorer = null;

        // NEW: Track which panes belong to which workspace
        this.paneToWorkspace = new Map(); // paneId → workspaceId

        // NEW: Track which terminals belong to which workspace
        this.terminalToWorkspace = new Map(); // terminalId → workspaceId

        // NEW: Track which browsers belong to which workspace
        this.browserToWorkspace = new Map(); // browserInstanceId → workspaceId

        logger.debug('workspaceLoad', 'Initialized');
    }

    /**
     * Set references to managers (called during app initialization)
     */
    setManagers(paneManager, fileExplorer) {
        this.paneManager = paneManager;
        this.fileExplorer = fileExplorer;
        logger.debug('workspaceLoad', 'Managers set:', {
            hasPaneManager: !!paneManager,
            hasFileExplorer: !!fileExplorer
        });
    }

    /**
     * Initialize workspace manager (ENHANCED: restores tracking maps)
     */
    async init() {
        // Load config to check restore preference
        this.config.load();
        const shouldRestore = this.config.get('restoreWorkspaceOnStartup', false);

        // Load workspaces and tracking maps from localStorage
        const storedData = localStorage.getItem(this.storageKey);
        const persistedState = storedData ? JSON.parse(storedData) : null;

        let storedWorkspaces = [];
        let paneToWorkspaceMap = [];
        let terminalToWorkspaceMap = [];
        let activeWorkspaceId = null;

        if (persistedState && persistedState.version === 2) {
            // New format with tracking maps
            storedWorkspaces = persistedState.workspaces || [];
            paneToWorkspaceMap = persistedState.paneToWorkspace || [];
            terminalToWorkspaceMap = persistedState.terminalToWorkspace || [];
            activeWorkspaceId = persistedState.activeWorkspaceId;
            logger.debug('workspaceLoad', 'Loaded persisted state v2:', {
                workspaces: storedWorkspaces.length,
                paneTracking: paneToWorkspaceMap.length,
                terminalTracking: terminalToWorkspaceMap.length
            });
        } else if (persistedState && Array.isArray(persistedState)) {
            // Legacy format (array of workspaces only)
            storedWorkspaces = persistedState;
            logger.debug('workspaceLoad', 'Loaded legacy workspaces:', storedWorkspaces.length);
        }

        // Store last workspace ID for "Open Previous Workspace" feature
        this.lastWorkspaceId = activeWorkspaceId;

        // Load existing workspaces into memory (but don't activate)
        if (storedWorkspaces.length > 0) {
            storedWorkspaces.forEach(ws => {
                // Initialize missing arrays for legacy workspaces
                if (!ws.paneIds) ws.paneIds = [];
                if (!ws.terminalIds) ws.terminalIds = [];
                if (!ws.browserIds) ws.browserIds = [];

                // CRITICAL FIX: Clear dead terminals on app startup
                // Terminals cannot persist across app restarts because:
                // 1. PTY processes are killed when app closes
                // 2. xterm.js instances are destroyed
                // 3. WebSocket connections are terminated
                // Start fresh with empty terminal list in this session
                ws.terminalIds = [];

                this.workspaces.set(ws.id, ws);
            });

            // Restore tracking maps
            paneToWorkspaceMap.forEach(([paneId, workspaceId]) => {
                this.paneToWorkspace.set(paneId, workspaceId);
            });
            // CRITICAL FIX: Don't restore terminal tracking from previous session
            // These terminals are dead - we only track terminals launched in current session
            // terminalToWorkspaceMap.forEach(([terminalId, workspaceId]) => {
            //     this.terminalToWorkspace.set(terminalId, workspaceId);
            // });
        }

        // Only restore workspace if the setting is enabled
        if (shouldRestore && this.lastWorkspaceId) {
            const targetWorkspace = this.workspaces.get(this.lastWorkspaceId);
            if (targetWorkspace) {
                this.activeWorkspace = targetWorkspace;
                this.defaultWorkspace = targetWorkspace;
                logger.debug('workspaceLoad', 'Restored active workspace:', targetWorkspace.id);
            }
        } else {
            logger.debug('workspaceLoad', 'Auto-restore disabled, starting with clean slate');
        }

        logger.debug('workspaceLoad', 'Initialization complete:', {
            activeWorkspace: this.activeWorkspace?.id,
            totalWorkspaces: this.workspaces.size,
            lastWorkspaceId: this.lastWorkspaceId,
            paneTrackingEntries: this.paneToWorkspace.size,
            terminalTrackingEntries: this.terminalToWorkspace.size,
            autoRestore: shouldRestore
        });
    }

    /**
     * Create a new workspace (ENHANCED for directory-based workspaces)
     */
    createWorkspace(name, description = '', template = 'empty', rootPath = null) {
        const workspaceId = generateId();

        // NEW: Extract name from rootPath if not provided
        if (!name && rootPath) {
            name = this.extractWorkspaceName(rootPath);
        }

        const workspace = {
            id: workspaceId,
            name: name || 'Untitled Workspace',
            description: description,
            template: template,
            createdAt: Date.now(),
            updatedAt: Date.now(),

            // NEW: Directory context
            rootPath: rootPath || null, // Root directory of this workspace
            currentPath: rootPath || null, // Current directory (can navigate within workspace)
            isSSH: rootPath ? rootPath.startsWith('ssh://') : false,

            // Pane state
            paneLayout: null, // Will be set by PaneManager
            paneIds: [], // Track pane IDs belonging to this workspace
            isHidden: false, // Whether workspace panes are currently hidden

            // File state
            openFiles: [],

            // Browser state
            browserSessions: [],
            activeBrowserProfile: null,

            // Terminal state
            terminalIds: [], // Track terminal IDs in this workspace

            // Browser state
            browserIds: [], // Track browser instance IDs in this workspace

            // Settings
            settings: {
                theme: 'dark'
            },

            // NEW: SSH connection tracking
            sshConnectionId: null
        };

        this.workspaces.set(workspaceId, workspace);
        this.saveWorkspaces();

        logger.debug('workspaceLoad', 'Created workspace:', workspaceId, name, {
            rootPath,
            isSSH: workspace.isSSH
        });
        eventBus.emit('workspace:created', { workspaceId, workspace });

        return workspace;
    }

    /**
     * Extract a readable workspace name from a path
     */
    extractWorkspaceName(path) {
        if (!path) return 'Untitled';

        // Handle SSH paths
        if (path.startsWith('ssh://')) {
            const match = path.match(/ssh:\/\/([^/]+)(\/.*)?/);
            if (match) {
                const host = match[1];
                const remotePath = match[2] || '/';
                const dirName = remotePath.split('/').filter(Boolean).pop() || 'root';
                return `${dirName} (${host})`;
            }
        }

        // Handle local paths
        const parts = path.split('/').filter(Boolean);
        return parts[parts.length - 1] || 'root';
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
     * Get last workspace info (for "Open Previous Workspace" feature)
     */
    getLastWorkspace() {
        if (!this.lastWorkspaceId) return null;
        return this.workspaces.get(this.lastWorkspaceId);
    }

    /**
     * Restore the last workspace
     */
    async restoreLastWorkspace() {
        if (!this.lastWorkspaceId) {
            logger.warn('workspaceLoad', 'No last workspace to restore');
            return false;
        }

        const workspace = this.workspaces.get(this.lastWorkspaceId);
        if (!workspace) {
            logger.warn('workspaceLoad', 'Last workspace not found:', this.lastWorkspaceId);
            return false;
        }

        logger.info('workspaceLoad', 'Restoring last workspace:', workspace.name);
        return await this.setActiveWorkspace(this.lastWorkspaceId);
    }

    /**
     * Set active workspace (ENHANCED for pane/terminal persistence)
     */
    async setActiveWorkspace(workspaceId) {
        const workspace = this.workspaces.get(workspaceId);
        if (!workspace) {
            logger.error('workspaceLoad', 'Workspace not found:', workspaceId);
            return false;
        }

        const previousWorkspace = this.activeWorkspace;

        // DEBUG: Log workspace pane ownership
        logger.debug('workspaceLoad', '========== WORKSPACE SWITCH DEBUG ==========');
        if (previousWorkspace) {
            logger.debug('workspaceLoad', `Previous workspace: ${previousWorkspace.id} (${previousWorkspace.name})`);
            logger.debug('workspaceLoad', `Previous paneIds: [${previousWorkspace.paneIds.join(', ')}]`);
        }
        logger.debug('workspaceLoad', `Target workspace: ${workspaceId} (${workspace.name})`);
        logger.debug('workspaceLoad', `Target paneIds: [${workspace.paneIds.join(', ')}]`);

        // Check for pane overlap
        if (previousWorkspace && previousWorkspace.paneIds.some(id => workspace.paneIds.includes(id))) {
            logger.error('workspaceLoad', '❌ CRITICAL: Workspaces sharing panes!');
            logger.error('workspaceLoad', 'Shared pane IDs:', previousWorkspace.paneIds.filter(id => workspace.paneIds.includes(id)));
        }

        // PERFORMANCE TRACKING: Measure workspace switch duration
        const switchStartTime = performance.now();

        // Save current workspace state before switching
        if (previousWorkspace && previousWorkspace.id !== workspaceId) {
            this.saveWorkspaceState(previousWorkspace.id);

            // NEW: Hide current workspace's panes (don't destroy!)
            const hideStartTime = performance.now();
            await this.hideWorkspacePanes(previousWorkspace.id);
            const hideEndTime = performance.now();

            logger.debug('workspaceLoad', `Hid panes in ${(hideEndTime - hideStartTime).toFixed(1)}ms`);
        }

        // NEW: Show target workspace's panes
        const showStartTime = performance.now();
        await this.showWorkspacePanes(workspaceId);
        const showEndTime = performance.now();

        this.activeWorkspace = workspace;
        workspace.updatedAt = Date.now();

        // NEW: Update file explorer to workspace directory
        if (this.fileExplorer && workspace.rootPath) {
            await this.fileExplorer.openDirectory(workspace.rootPath);
        }

        const switchEndTime = performance.now();
        const totalDuration = switchEndTime - switchStartTime;

        logger.info('workspaceLoad', 'Active workspace set:', workspaceId, {
            name: workspace.name,
            rootPath: workspace.rootPath,
            paneCount: workspace.paneIds.length,
            terminalCount: workspace.terminalIds.length,
            performanceMetrics: {
                showPanesDuration: `${(showEndTime - showStartTime).toFixed(1)}ms`,
                totalSwitchDuration: `${totalDuration.toFixed(1)}ms`
            }
        });

        eventBus.emit('workspace:activated', {
            workspaceId,
            workspace,
            previousWorkspaceId: previousWorkspace?.id
        });

        return true;
    }

    /**
     * Hide workspace panes without destroying them
     *
     * CRITICAL FOR TERMINAL PERSISTENCE:
     * This method hides all panes and their contained elements (terminals, editors, etc)
     * by setting CSS display property to 'none'. Terminals are NOT destroyed - they
     * remain in memory and continue running in the background.
     *
     * Process:
     * 1. Iterate through all panes belonging to this workspace
     * 2. Set pane.element.style.display = 'none' to hide the pane from view
     * 3. All child elements (terminals, editors, etc) inherit this visibility state
     * 4. Terminals continue processing and accumulating output while hidden
     * 5. Long-running commands in hidden workspaces keep executing
     *
     * Why this approach:
     * - Avoids costly DOM recreation when switching back to workspace
     * - Preserves terminal connection state and xterm.js instance
     * - Maintains editor undo/redo stacks and cursor positions
     * - Keeps browser instances loaded in memory
     * - Allows terminals to run background jobs while workspace is hidden
     *
     * @param {string} workspaceId - The workspace ID to hide
     */
    async hideWorkspacePanes(workspaceId) {
        const workspace = this.workspaces.get(workspaceId);
        if (!workspace || !this.paneManager) return;

        logger.debug('workspaceLoad', `Hiding panes for workspace: ${workspaceId}`);

        // Initialize arrays if they don't exist (for legacy workspaces)
        if (!workspace.paneIds) {
            workspace.paneIds = [];
            logger.debug('workspaceLoad', `Initialized paneIds array for workspace ${workspaceId}`);
        }
        if (!workspace.browserIds) {
            workspace.browserIds = [];
            logger.debug('workspaceLoad', `Initialized browserIds array for workspace ${workspaceId}`);
        }

        // Hide all panes using CSS display property (not DOM destruction)
        // This ensures terminals stay alive and continue running commands
        for (const paneId of workspace.paneIds) {
            const pane = this.paneManager.panes.get(paneId);
            if (pane && pane.element) {
                pane.element.style.display = 'none';
            }
        }

        // Hide all browsers in this workspace
        const Browser = require('../components/Browser');
        for (const browserInstanceId of workspace.browserIds) {
            const registryEntry = Browser.instances.get(browserInstanceId);
            if (registryEntry && registryEntry.browser) {
                logger.debug('workspaceLoad', `Hiding browser ${browserInstanceId}`);
                await registryEntry.browser.hideBrowserView();
            }
        }

        workspace.isHidden = true;

        logger.debug('workspaceLoad', `✓ Hidden ${workspace.paneIds.length} panes and ${workspace.browserIds.length} browsers for workspace: ${workspaceId}`);
    }

    /**
     * Show workspace panes after they've been hidden
     *
     * CRITICAL FOR TERMINAL PERSISTENCE:
     * This method restores visibility for all panes in a workspace. Because panes were
     * hidden (not destroyed), terminals are still alive with active connections and
     * accumulated output in their buffers.
     *
     * Process:
     * 1. Set pane.element.style.display = 'flex' to make panes visible again
     * 2. For each terminal in each pane, trigger resize/fit with double RAF pattern
     * 3. Double RAF ensures DOM layout is complete before calling terminal methods
     * 4. Terminals immediately become visible with all their previous output
     * 5. Any commands running in background have their output now visible
     *
     * Terminal Restoration Pattern (Double RAF):
     * - First RAF: Waits for browser to complete painting
     * - Second RAF: Waits for next frame after paint is done
     * - Then calls resize() and fit() to adjust terminal to new container dimensions
     * This prevents race conditions where terminal tries to measure before layout completes
     *
     * Why persistence works:
     * - xterm.js instance never disposed, just hidden with CSS
     * - PTY connection stays open while workspace hidden
     * - Terminal output buffer accumulates even while hidden
     * - No need to re-establish connections or re-create instances
     *
     * @param {string} workspaceId - The workspace ID to show
     */
    async showWorkspacePanes(workspaceId) {
        const workspace = this.workspaces.get(workspaceId);
        if (!workspace || !this.paneManager) return;

        logger.debug('workspaceLoad', `Showing panes for workspace: ${workspaceId}`);

        // Initialize arrays if they don't exist (for legacy workspaces)
        if (!workspace.paneIds) {
            workspace.paneIds = [];
            logger.debug('workspaceLoad', `Initialized paneIds array for workspace ${workspaceId}`);
        }
        if (!workspace.browserIds) {
            workspace.browserIds = [];
            logger.debug('workspaceLoad', `Initialized browserIds array for workspace ${workspaceId}`);
        }

        // If no panes yet, create a NEW root pane for this workspace
        // CRITICAL: Each workspace must have its own isolated pane tree
        if (workspace.paneIds.length === 0) {
            logger.debug('workspaceLoad', `📝 Creating new root pane for workspace: ${workspaceId}`);
            const newRootPane = this.paneManager.createRootPane();
            workspace.paneIds.push(newRootPane.id);
            this.paneToWorkspace.set(newRootPane.id, workspaceId);
            logger.debug('workspaceLoad', `✅ Created root pane ${newRootPane.id} for workspace ${workspaceId}`);
        } else {
            // Workspace has panes, update paneManager.rootPane to this workspace's root
            const workspaceRootPaneId = workspace.paneIds[0]; // First pane is typically root
            const workspaceRootPane = this.paneManager.panes.get(workspaceRootPaneId);
            if (workspaceRootPane) {
                this.paneManager.rootPane = workspaceRootPane;
                logger.debug('workspaceLoad', `♻️ Set paneManager.rootPane to ${workspaceRootPaneId} for workspace ${workspaceId}`);
            } else {
                logger.error('workspaceLoad', `❌ ERROR: Workspace pane ${workspaceRootPaneId} not found in paneManager!`);
            }
        }

        // Show all panes using CSS display property (restores hidden panes to visible)
        // Terminals remain alive during this restoration process
        for (const paneId of workspace.paneIds) {
            const pane = this.paneManager.panes.get(paneId);
            if (pane && pane.element) {
                pane.element.style.display = 'flex';

                // CRITICAL FIX: Restore active tab content display
                // When workspace was hidden, tab contents were set to display: none
                // We need to restore the active tab content to display: flex
                if (pane.tabs && pane.tabs.length > 0) {
                    // Hide all tab contents first
                    pane.tabs.forEach(tab => {
                        if (tab.content) {
                            tab.content.style.display = 'none';
                        }
                    });

                    // Show only the active tab content
                    if (pane.activeTabId) {
                        const activeTab = pane.tabs.find(t => t.id === pane.activeTabId);
                        if (activeTab && activeTab.content) {
                            activeTab.content.style.display = 'flex';
                            logger.debug('workspaceLoad', `✓ Restored active tab display: ${activeTab.title} (${activeTab.id}) in pane ${paneId}`);

                            // CRITICAL FIX: Only resize/fit the ACTIVE terminal
                            // Terminals need explicit refresh after container visibility changes
                            if (activeTab.contentType === 'terminal' && activeTab.content._terminalInstance) {
                                const terminal = activeTab.content._terminalInstance;
                                // Triple RAF for maximum reliability - ensures DOM is fully painted
                                requestAnimationFrame(() => {
                                    requestAnimationFrame(() => {
                                        requestAnimationFrame(() => {
                                            try {
                                                logger.debug('workspaceLoad', `🔄 Refreshing terminal: ${terminal.id}`);
                                                // Call refresh on xterm to force re-render
                                                if (terminal.xterm && typeof terminal.xterm.refresh === 'function') {
                                                    terminal.xterm.refresh(0, terminal.xterm.rows - 1);
                                                }
                                                // Then resize to match container
                                                terminal.resize();
                                                terminal.fit();
                                                logger.debug('workspaceLoad', `✓ Terminal refreshed: ${terminal.id}`);
                                            } catch (err) {
                                                logger.error('workspaceLoad', 'Error refreshing terminal:', err);
                                            }
                                        });
                                    });
                                });
                            }
                        }
                    }
                }
            }
        }

        // Show all browsers in this workspace
        const Browser = require('../components/Browser');
        for (const browserInstanceId of workspace.browserIds) {
            const registryEntry = Browser.instances.get(browserInstanceId);
            if (registryEntry && registryEntry.browser) {
                logger.debug('workspaceLoad', `Showing browser ${browserInstanceId}`);
                await registryEntry.browser.showBrowserView();
            }
        }

        workspace.isHidden = false;

        logger.debug('workspaceLoad', `✓ Shown ${workspace.paneIds.length} panes and ${workspace.browserIds.length} browsers for workspace: ${workspaceId}`);
    }

    /**
     * Update workspace
     */
    updateWorkspace(workspaceId, updates) {
        const workspace = this.workspaces.get(workspaceId);
        if (!workspace) {
            logger.error('workspaceLoad', 'Workspace not found:', workspaceId);
            return false;
        }

        Object.assign(workspace, updates, {
            updatedAt: Date.now()
        });

        this.saveWorkspaces();

        logger.debug('workspaceLoad', 'Updated workspace:', workspaceId);
        eventBus.emit('workspace:updated', { workspaceId, workspace });

        return true;
    }

    /**
     * Delete workspace
     */
    deleteWorkspace(workspaceId) {
        // Can't delete last workspace
        if (this.workspaces.size === 1) {
            logger.warn('workspaceLoad', 'Cannot delete last workspace');
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

        logger.debug('workspaceLoad', 'Deleted workspace:', workspaceId);
        eventBus.emit('workspace:deleted', { workspaceId });

        return true;
    }

    /**
     * Save workspace state (pane layout, open files, etc.)
     */
    saveWorkspaceState(workspaceId, state = {}) {
        const workspace = this.workspaces.get(workspaceId);
        if (!workspace) {
            logger.error('workspaceLoad', 'Workspace not found:', workspaceId);
            return false;
        }

        // Update workspace with current state
        Object.assign(workspace, state, {
            updatedAt: Date.now()
        });

        this.saveWorkspaces();

        logger.debug('workspaceLoad', 'Saved workspace state:', workspaceId);
        return true;
    }

    /**
     * Load workspace state
     */
    loadWorkspaceState(workspaceId) {
        const workspace = this.workspaces.get(workspaceId);
        if (!workspace) {
            logger.error('workspaceLoad', 'Workspace not found:', workspaceId);
            return null;
        }

        logger.debug('workspaceLoad', 'Loaded workspace state:', workspaceId);
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
            logger.debug('workspaceLoad', 'Added open file:', filePath);
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
            logger.debug('workspaceLoad', 'Removed open file:', filePath);
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

        logger.debug('workspaceLoad', 'Added browser session');
        return true;
    }

    /**
     * Save workspaces to persistent storage (ENHANCED: saves tracking maps)
     */
    saveWorkspaces() {
        const workspacesArray = Array.from(this.workspaces.values());

        // Convert Maps to arrays for JSON serialization
        const paneToWorkspaceArray = Array.from(this.paneToWorkspace.entries());
        const terminalToWorkspaceArray = Array.from(this.terminalToWorkspace.entries());

        // Create v2 persisted state with tracking maps
        const persistedState = {
            version: 2,
            workspaces: workspacesArray,
            paneToWorkspace: paneToWorkspaceArray,
            terminalToWorkspace: terminalToWorkspaceArray,
            activeWorkspaceId: this.activeWorkspace?.id || null,
            savedAt: Date.now()
        };

        localStorage.setItem(this.storageKey, JSON.stringify(persistedState));
        logger.debug('workspaceLoad', 'Saved workspaces to storage (v2):', {
            workspaces: workspacesArray.length,
            paneTracking: paneToWorkspaceArray.length,
            terminalTracking: terminalToWorkspaceArray.length,
            terminalNote: 'Only tracking terminals from current session (PTY cannot persist across app restart)'
        });
    }

    /**
     * Export workspace to JSON
     */
    exportWorkspace(workspaceId) {
        const workspace = this.workspaces.get(workspaceId);
        if (!workspace) {
            logger.error('workspaceLoad', 'Workspace not found:', workspaceId);
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

            logger.debug('workspaceLoad', 'Imported workspace:', workspace.id);
            eventBus.emit('workspace:imported', { workspaceId: workspace.id, workspace });

            return workspace;
        } catch (error) {
            logger.error('workspaceLoad', 'Failed to import workspace:', error);
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
     * Track a pane in the active workspace
     */
    trackPaneInActiveWorkspace(paneId) {
        if (!this.activeWorkspace) return;

        // Initialize paneIds array if it doesn't exist (for legacy workspaces)
        if (!this.activeWorkspace.paneIds) {
            this.activeWorkspace.paneIds = [];
            logger.debug('workspaceLoad', `Initialized paneIds array for workspace ${this.activeWorkspace.id}`);
        }

        if (!this.activeWorkspace.paneIds.includes(paneId)) {
            this.activeWorkspace.paneIds.push(paneId);
            this.paneToWorkspace.set(paneId, this.activeWorkspace.id);
            logger.debug('workspaceLoad', `Pane ${paneId} tracked in workspace ${this.activeWorkspace.id}`);
        }
    }

    /**
     * Track a terminal in the active workspace
     */
    trackTerminalInActiveWorkspace(terminalId) {
        if (!this.activeWorkspace) return;

        // Initialize terminalIds array if it doesn't exist (for legacy workspaces)
        if (!this.activeWorkspace.terminalIds) {
            this.activeWorkspace.terminalIds = [];
            logger.debug('workspaceLoad', `Initialized terminalIds array for workspace ${this.activeWorkspace.id}`);
        }

        if (!this.activeWorkspace.terminalIds.includes(terminalId)) {
            this.activeWorkspace.terminalIds.push(terminalId);
            this.terminalToWorkspace.set(terminalId, this.activeWorkspace.id);
            logger.debug('workspaceLoad', `Terminal ${terminalId} tracked in workspace ${this.activeWorkspace.id}`);
        }
    }

    /**
     * Untrack a pane from its workspace
     */
    untrackPane(paneId) {
        const workspaceId = this.paneToWorkspace.get(paneId);
        if (!workspaceId) return;

        const workspace = this.workspaces.get(workspaceId);
        if (workspace) {
            const index = workspace.paneIds.indexOf(paneId);
            if (index > -1) {
                workspace.paneIds.splice(index, 1);
            }
        }

        this.paneToWorkspace.delete(paneId);
        logger.debug('workspaceLoad', `Pane ${paneId} untracked from workspace ${workspaceId}`);
    }

    /**
     * Untrack a terminal from its workspace
     */
    untrackTerminal(terminalId) {
        const workspaceId = this.terminalToWorkspace.get(terminalId);
        if (!workspaceId) return;

        const workspace = this.workspaces.get(workspaceId);
        if (workspace) {
            const index = workspace.terminalIds.indexOf(terminalId);
            if (index > -1) {
                workspace.terminalIds.splice(index, 1);
            }
        }

        this.terminalToWorkspace.delete(terminalId);
        logger.debug('workspaceLoad', `Terminal ${terminalId} untracked from workspace ${workspaceId}`);
    }

    /**
     * Track a browser in the active workspace
     */
    trackBrowserInActiveWorkspace(browserInstanceId) {
        if (!this.activeWorkspace) return;

        // Initialize browserIds array if it doesn't exist (for legacy workspaces)
        if (!this.activeWorkspace.browserIds) {
            this.activeWorkspace.browserIds = [];
            logger.debug('workspaceLoad', `Initialized browserIds array for workspace ${this.activeWorkspace.id}`);
        }

        if (!this.activeWorkspace.browserIds.includes(browserInstanceId)) {
            this.activeWorkspace.browserIds.push(browserInstanceId);
            this.browserToWorkspace.set(browserInstanceId, this.activeWorkspace.id);
            logger.debug('workspaceLoad', `Browser ${browserInstanceId} tracked in workspace ${this.activeWorkspace.id}`);
        }
    }

    /**
     * Untrack a browser from its workspace
     */
    untrackBrowser(browserInstanceId) {
        const workspaceId = this.browserToWorkspace.get(browserInstanceId);
        if (!workspaceId) return;

        const workspace = this.workspaces.get(workspaceId);
        if (workspace) {
            const index = workspace.browserIds.indexOf(browserInstanceId);
            if (index > -1) {
                workspace.browserIds.splice(index, 1);
            }
        }

        this.browserToWorkspace.delete(browserInstanceId);
        logger.debug('workspaceLoad', `Browser ${browserInstanceId} untracked from workspace ${workspaceId}`);
    }

    /**
     * Get workspace for a given root path (or create if doesn't exist)
     */
    async getOrCreateWorkspaceForPath(rootPath) {
        // Check if workspace already exists for this path
        for (const workspace of this.workspaces.values()) {
            if (workspace.rootPath === rootPath) {
                return workspace;
            }
        }

        // Create new workspace for this path
        const workspace = this.createWorkspace(null, `Workspace for ${rootPath}`, 'empty', rootPath);
        logger.info('workspaceLoad', `Created new workspace for path: ${rootPath}`);

        return workspace;
    }

    /**
     * Cleanup
     */
    destroy() {
        if (this.activeWorkspace) {
            this.saveWorkspaceState(this.activeWorkspace.id);
        }
        this.saveWorkspaces();
        logger.debug('workspaceLoad', 'Destroyed');
    }
}

// Export singleton instance
module.exports = new WorkspaceManager();

/**
 * Main Renderer Entry Point
 *
 * Bootstraps the application by initializing all modules, components,
 * and wiring everything together through the EventBus.
 */

// Import logger first (must be before any logger calls)
const logger = require('./utils/Logger');

logger.info('appInit', '========================================');
logger.info('appInit', 'Starting to load renderer.js...');
logger.info('appInit', '========================================');

// Global error handlers
window.addEventListener('error', async (event) => {
    console.error('[GLOBAL ERROR]', event.error);
    console.error('[GLOBAL ERROR] Stack:', event.error?.stack);
    console.error('[GLOBAL ERROR] Message:', event.message);
    console.error('[GLOBAL ERROR] Filename:', event.filename);
    console.error('[GLOBAL ERROR] Line:', event.lineno, 'Col:', event.colno);

    // Log to crash file if serious error
    try {
        const errorInfo = {
            name: event.error?.name || 'Error',
            message: event.message || event.error?.message,
            stack: event.error?.stack,
            filename: event.filename,
            lineno: event.lineno,
            colno: event.colno,
            timestamp: new Date().toISOString(),
            memory: performance.memory ? {
                usedJSHeapSize: performance.memory.usedJSHeapSize,
                totalJSHeapSize: performance.memory.totalJSHeapSize,
                jsHeapSizeLimit: performance.memory.jsHeapSizeLimit
            } : null
        };

        await window.electronAPI.logRendererError(errorInfo);
    } catch (logError) {
        console.error('[GLOBAL ERROR] Failed to log error to crash file:', logError);
    }

    // Don't prevent default - let the error bubble for DevTools
});

window.addEventListener('unhandledrejection', async (event) => {
    console.error('[UNHANDLED PROMISE REJECTION]', event.reason);
    console.error('[UNHANDLED PROMISE] Promise:', event.promise);

    // Log to crash file
    try {
        const errorInfo = {
            name: 'UnhandledPromiseRejection',
            message: event.reason?.message || String(event.reason),
            stack: event.reason?.stack,
            timestamp: new Date().toISOString(),
            memory: performance.memory ? {
                usedJSHeapSize: performance.memory.usedJSHeapSize,
                totalJSHeapSize: performance.memory.totalJSHeapSize,
                jsHeapSizeLimit: performance.memory.jsHeapSizeLimit
            } : null
        };

        await window.electronAPI.logRendererError(errorInfo);
    } catch (logError) {
        console.error('[UNHANDLED PROMISE] Failed to log error to crash file:', logError);
    }

    // Don't prevent default - let the error bubble for DevTools
});

// Import core modules
const eventBus = require('./modules/EventBus');
const stateManager = require('./modules/StateManager');
const config = require('./modules/Config');
const pluginManager = require('./modules/PluginManager');
const uiManager = require('./modules/UIManager');

// Import services
const fileSystemService = require('./services/FileSystemService');
const sqliteService = require('./services/SQLiteService');
const sshService = require('./services/SSHService');
const PaneManager = require('./services/PaneManager');
const workspaceManager = require('./services/WorkspaceManager');
const browserProfileManager = require('./services/BrowserProfileManager');

// Import utilities
const performanceMonitor = require('./utils/PerformanceMonitor');

// Make performance monitor globally available
window.performanceMonitor = performanceMonitor;
logger.info('appInit', '✓ Performance monitoring enabled');

// ============================================================================
// TERMINAL REGISTRY - Critical for terminal persistence across workspace switches
// ============================================================================
// This registry keeps track of all Terminal instances by ID.
// When workspaces switch, terminals should be hidden/shown, not recreated.
// The registry prevents duplicate Terminal instances and preserves PTY connections.
// ============================================================================
const terminalRegistry = new Map(); // terminalId → { instance, container, paneId }

// Registry operations
const TerminalRegistryAPI = {
    // Register a terminal instance when created
    register: function(terminal, container) {
        if (!terminal || !terminal.id) {
            logger.error('appInit', 'Cannot register terminal: missing id or instance');
            return false;
        }

        const existing = terminalRegistry.get(terminal.id);
        if (existing && existing.instance !== terminal) {
            logger.warn('appInit', `Terminal ID ${terminal.id} already registered, replacing...`);
        }

        terminalRegistry.set(terminal.id, {
            instance: terminal,
            container: container,
            paneId: null,
            createdAt: Date.now()
        });

        logger.debug('appInit', `✓ Terminal registered: ${terminal.id} (total: ${terminalRegistry.size})`);
        return true;
    },

    // Get a terminal instance by ID
    get: function(terminalId) {
        const entry = terminalRegistry.get(terminalId);
        return entry ? entry.instance : null;
    },

    // Update which pane contains this terminal
    updatePaneId: function(terminalId, paneId) {
        const entry = terminalRegistry.get(terminalId);
        if (entry) {
            entry.paneId = paneId;
            logger.debug('appInit', `Terminal ${terminalId} now in pane ${paneId}`);
        }
    },

    // Check if terminal already exists
    exists: function(terminalId) {
        return terminalRegistry.has(terminalId);
    },

    // List all registered terminals
    listAll: function() {
        return Array.from(terminalRegistry.entries()).map(([id, entry]) => ({
            id,
            paneId: entry.paneId,
            isAlive: !entry.instance.isDisposed
        }));
    },

    // Unregister a terminal (when closed)
    unregister: function(terminalId) {
        terminalRegistry.delete(terminalId);
        logger.debug('appInit', `Terminal unregistered: ${terminalId} (remaining: ${terminalRegistry.size})`);
    }
};

// Expose registry for debugging
window.terminalRegistry = TerminalRegistryAPI;
logger.info('appInit', '✓ Terminal registry initialized (accessible via window.terminalRegistry)');

// Expose workspaceManager for debugging
window.workspaceManager = workspaceManager;
logger.info('appInit', '✓ WorkspaceManager exposed (accessible via window.workspaceManager)');

// Import components
const MenuBar = require('./components/MenuBar');
const FileExplorer = require('./components/FileExplorer');
const FileViewer = require('./components/FileViewer');
const WelcomeScreen = require('./components/WelcomeScreen');
const SSHWelcomeScreen = require('./components/SSHWelcomeScreen');
const Browser = require('./components/Browser');
const WorkspacePanel = require('./components/WorkspacePanel');
const quickOpen = require('./components/QuickOpen');
const globalSearch = require('./components/GlobalSearch');
const findReplacePanel = require('./components/FindReplacePanel');
const statusBar = require('./components/StatusBar');

// Import Git components
const GitPanel = require('./components/GitPanel');
const GitHistoryPanel = require('./components/GitHistoryPanel');
const CommitView = require('./components/CommitView');
const GitBranchMenu = require('./components/GitBranchMenu');

// Import SSH components
const SSHPanel = require('./components/SSHPanel');
const GitDiffPanel = require('./components/GitDiffPanel');
const GitBlamePanel = require('./components/GitBlamePanel');

// Import Terminal components
const TerminalPanel = require('./components/terminal/TerminalPanel');

// Import Modal for replacing browser dialogs
const modal = require('./components/Modal');

/**
 * Application Bootstrap
 */
class Application {
    constructor() {
        this.initialized = false;
        this.paneManager = null;
        this.workspaceManager = workspaceManager;
        this.browserProfileManager = browserProfileManager;
    }

    /**
     * Initialize the application
     */
    async init() {
        try {
            logger.info('appInit', '========================================');
            logger.info('appInit', 'Initializing Swarm IDE...');
            logger.debug('appInit', 'window.electronAPI:', window.electronAPI);

            // 1. Load configuration
            config.load();
            logger.info('appInit', '✓ Configuration loaded');

            // 2. Initialize FileSystemService with Electron API
            fileSystemService.initialize(window.electronAPI);
            logger.info('appInit', '✓ FileSystemService initialized');

            // 2.5. Initialize SQLiteService with Electron API
            sqliteService.initialize(window.electronAPI);
            logger.info('appInit', '✓ SQLiteService initialized');

            // 2.5.1. Initialize SSHService with Electron API
            logger.debug('appInit', 'About to initialize SSH Service...');
            logger.debug('appInit', 'window.electronAPI available:', !!window.electronAPI);
            logger.debug('appInit', 'window.electronAPI.sshInit available:', !!window.electronAPI?.sshInit);

            await sshService.initialize(window.electronAPI);
            window.sshService = sshService; // Make SSH service globally available

            logger.debug('appInit', 'SSH Service init complete, checking state:', sshService.isInitialized());
            logger.info('appInit', '✓ SSHService initialized');

            // 2.6. Initialize WorkspaceManager
            await this.workspaceManager.init();
            logger.info('appInit', '✓ WorkspaceManager initialized');

            // 2.7. Initialize BrowserProfileManager
            await this.browserProfileManager.init();
            logger.info('appInit', '✓ BrowserProfileManager initialized');

            // 3. Initialize UIManager
            uiManager.initialize();
            logger.info('appInit', '✓ UIManager initialized');

            // Expose UIManager globally for keyboard shortcut handling
            window.UIManager = uiManager;
            logger.debug('appInit', '✓ UIManager exposed to window');

            // 3.5. Initialize Git services
            await this.initializeGitServices();
            logger.info('appInit', '✓ Git services initialized');

            // 4. Setup global event handlers
            this.setupGlobalHandlers();
            logger.info('appInit', '✓ Global handlers setup');

            // 5. Initialize UI components
            await this.initializeComponents();
            logger.info('appInit', '✓ Components initialized');

            // 6. Apply theme
            const theme = config.get('theme', 'dark');
            uiManager.applyTheme(theme);
            logger.info('appInit', '✓ Theme applied:', theme);

            // 7. Setup open folder button
            this.setupFolderButton();
            logger.info('appInit', '✓ Folder button setup complete');

            // 8. Setup explorer toolbar buttons
            this.setupExplorerToolbar();
            logger.info('appInit', '✓ Explorer toolbar setup complete');

            // 9. Setup icon sidebar
            this.setupIconSidebar();
            logger.info('appInit', '✓ Icon sidebar setup complete');

            // 10. Check for initial folder from command line
            const initialFolder = await window.electronAPI.getInitialFolder();
            if (initialFolder) {
                logger.info('appInit', 'Opening initial folder from command line:', initialFolder);
                try {
                    const explorer = uiManager.getComponent('fileExplorer');
                    if (explorer) {
                        await explorer.openDirectory(initialFolder);
                    }
                } catch (error) {
                    logger.error('appInit', 'Error opening initial folder:', error);
                }
            }

            this.initialized = true;
            logger.info('appInit', '========================================');
            logger.info('appInit', '✓✓✓ Swarm IDE initialized successfully ✓✓✓');
            logger.info('appInit', '========================================');

            eventBus.emit('app:initialized');
        } catch (error) {
            logger.error('appInit', '❌ Initialization error:', error);
            logger.error('appInit', 'Stack trace:', error.stack);
        }
    }

    /**
     * Initialize Git services
     */
    async initializeGitServices() {
        try {
            const gitService = require('./services/GitService').getInstance();
            const gitStore = require('./modules/GitStore').getInstance();

            logger.info('appInit', 'Git services loaded');

            // Git services will initialize themselves when needed
            // They use lazy initialization pattern
        } catch (error) {
            logger.warn('appInit', 'Git services not available:', error.message);
            logger.warn('appInit', 'Git functionality will be disabled');
        }
    }

    /**
     * Initialize UI components
     */
    async initializeComponents() {
        console.log('[RENDERER] ************************************************');
        console.log('[RENDERER] initializeComponents() CALLED');
        console.log('[RENDERER] ************************************************');
        logger.info('appInit', '🎯 Starting initializeComponents...');

        // Get DOM elements
        console.log('[RENDERER] Getting DOM elements...');
        logger.debug('appInit', 'Getting DOM elements...');
        const welcomeContainer = document.getElementById('welcome-container');
        const sshWelcomeContainer = document.getElementById('ssh-welcome-container');
        const appContainer = document.getElementById('app-container');
        const menuBarContainer = document.getElementById('menu-bar');
        const fileTreeContainer = document.getElementById('file-tree');
        const paneContainer = document.getElementById('pane-container');
        console.log('[RENDERER] DOM elements retrieved');
        console.log('[RENDERER] fileTreeContainer:', fileTreeContainer);
        logger.debug('appInit', 'DOM elements retrieved');

        // Create and register WelcomeScreen
        logger.info('appInit', 'Creating WelcomeScreen...');
        const welcomeScreen = new WelcomeScreen(welcomeContainer, config, fileSystemService);
        logger.info('appInit', 'WelcomeScreen created, registering...');
        uiManager.registerComponent('welcomeScreen', welcomeScreen);
        logger.info('appInit', '✓ WelcomeScreen registered');

        // Create and register SSHWelcomeScreen
        logger.info('appInit', 'Creating SSHWelcomeScreen...');
        const sshWelcomeScreen = new SSHWelcomeScreen(sshWelcomeContainer, config, sshService);
        await sshWelcomeScreen.init();
        logger.info('appInit', 'SSHWelcomeScreen created and initialized, registering...');
        uiManager.registerComponent('sshWelcomeScreen', sshWelcomeScreen);
        logger.info('appInit', '✓ SSHWelcomeScreen registered');

        // Setup navigation between welcome screens
        eventBus.on('ssh:show-welcome-screen', () => {
            logger.debug('appInit', 'Showing SSH Welcome Screen');
            welcomeScreen.hide();
            sshWelcomeScreen.show();
        });

        eventBus.on('welcome:show-main-screen', () => {
            logger.debug('appInit', 'Showing main Welcome Screen');
            sshWelcomeScreen.hide();
            welcomeScreen.show();
        });

        // Create and register MenuBar
        logger.info('appInit', 'Creating MenuBar...');
        const menuBar = new MenuBar(menuBarContainer, fileSystemService);
        logger.info('appInit', 'MenuBar created, registering...');
        uiManager.registerComponent('menuBar', menuBar);
        logger.info('appInit', '✓ MenuBar registered');

        // Create and register WorkspacePanel
        logger.info('appInit', 'Creating WorkspacePanel...');
        const workspacePanel = new WorkspacePanel();
        logger.info('appInit', 'WorkspacePanel created, registering...');
        uiManager.registerComponent('workspacePanel', workspacePanel);
        logger.info('appInit', '✓ WorkspacePanel registered');

        // Create and register FileExplorer
        console.log('[RENDERER] ========================================');
        console.log('[RENDERER] Creating FileExplorer...');
        console.log('[RENDERER] fileTreeContainer:', fileTreeContainer);
        console.log('[RENDERER] fileSystemService:', fileSystemService);
        console.log('[RENDERER] config:', config);
        logger.info('appInit', 'Creating FileExplorer...');
        const explorer = new FileExplorer(fileTreeContainer, fileSystemService, config);
        console.log('[RENDERER] FileExplorer created:', explorer);
        logger.info('appInit', 'FileExplorer created, registering...');
        uiManager.registerComponent('fileExplorer', explorer);
        console.log('[RENDERER] FileExplorer registered with UIManager');
        logger.info('appInit', '✓ FileExplorer registered');
        console.log('[RENDERER] ========================================');

        // Create and register Git UI components
        try {
            const gitPanel = new GitPanel();
            uiManager.registerComponent('gitPanel', gitPanel);

            const gitHistoryPanel = new GitHistoryPanel();
            uiManager.registerComponent('gitHistoryPanel', gitHistoryPanel);

            const gitBranchMenu = new GitBranchMenu();
            uiManager.registerComponent('gitBranchMenu', gitBranchMenu);

            const gitDiffPanel = new GitDiffPanel();
            uiManager.registerComponent('gitDiffPanel', gitDiffPanel);

            const gitBlamePanel = new GitBlamePanel();
            uiManager.registerComponent('gitBlamePanel', gitBlamePanel);

            logger.info('appInit', '✓ Git UI components registered');
        } catch (error) {
            logger.warn('appInit', 'Failed to initialize Git UI components:', error.message);
        }

        // Create and register SSH UI components
        try {
            logger.info('appInit', '🔗 Initializing SSH Panel...');
            const sshPanel = new SSHPanel();
            logger.info('appInit', 'SSH Panel created, calling render...');

            sshPanel.render(); // Render the SSH panel to DOM
            logger.info('appInit', 'SSH Panel rendered, registering component...');

            uiManager.registerComponent('sshPanel', sshPanel);
            logger.info('appInit', 'SSH Panel registered with UIManager');

            // Setup SSH menu action handlers
            this.setupSSHMenuHandlers(sshPanel);
            logger.info('appInit', 'SSH menu handlers setup complete');

            // Test that the panel can be toggled
            logger.info('appInit', 'SSH Panel state - isVisible:', sshPanel.isVisible, 'panel exists:', !!sshPanel.panel);

            logger.info('appInit', '✅ SSH UI components registered and rendered successfully');
        } catch (error) {
            logger.error('appInit', '❌ Failed to initialize SSH UI components:', error.message);
            logger.error('appInit', 'SSH Error stack:', error.stack);
        }

        // Create and register Terminal UI components
        try {
            logger.info('appInit', '🔌 Initializing Terminal Panel...');

            // Create terminal container in pane container (will be positioned at bottom)
            const terminalContainer = document.createElement('div');
            terminalContainer.id = 'terminal-container';
            terminalContainer.style.cssText = 'position: absolute; left: 0; right: 0; bottom: 0; z-index: 1000;';

            // Use existing paneContainer variable (don't redeclare)
            if (paneContainer) {
                paneContainer.appendChild(terminalContainer);
                logger.debug('appInit', 'Terminal container created and added to pane container');
            } else {
                logger.error('appInit', 'Pane container not found for terminal');
                throw new Error('Pane container not found');
            }

            const terminalPanel = new TerminalPanel(terminalContainer);
            terminalPanel.init();
            logger.info('appInit', 'Terminal Panel initialized');

            uiManager.registerComponent('terminalPanel', terminalPanel);
            logger.info('appInit', 'Terminal Panel registered with UIManager');

            logger.info('appInit', '✅ Terminal UI components registered successfully');
        } catch (error) {
            logger.error('appInit', '❌ Failed to initialize Terminal UI components:', error.message);
            logger.error('appInit', 'Terminal Error stack:', error.stack);
        }

        // Setup IPC→EventBus bridge for terminal events
        if (window.electronAPI && window.electronAPI.onTerminalData) {
            logger.info('appInit', 'Setting up terminal IPC→EventBus bridges...');

            // Bridge terminal:data events
            window.electronAPI.onTerminalData((data) => {
                logger.debug('terminal', 'IPC→EventBus: terminal:data', data);
                eventBus.emit('terminal:data', data);
            });

            // Bridge terminal:exit events
            window.electronAPI.onTerminalExit((data) => {
                logger.debug('terminal', 'IPC→EventBus: terminal:exit', data);
                eventBus.emit('terminal:exit', data);
            });

            logger.info('appInit', '✅ Terminal IPC→EventBus bridges established');
        } else {
            logger.warn('appInit', 'Terminal IPC event listeners not available in electronAPI');
        }

        // Initialize PaneManager
        console.log('[RENDERER] ═══════════════════════════════════════════════════');
        console.log('[RENDERER] 🔥🔥🔥 REACHED PANEMANAGER INITIALIZATION 🔥🔥🔥');
        console.log('[RENDERER] ═══════════════════════════════════════════════════');

        try {
            console.log('[RENDERER] 🔍 BEFORE creating PaneManager...');
            logger.info('appInit', '🔍 BEFORE creating PaneManager...');
            console.log('[RENDERER] 🔍 paneContainer:', paneContainer);
            logger.info('appInit', '🔍 paneContainer:', paneContainer);
            console.log('[RENDERER] 🔍 paneContainer children count:', paneContainer?.children?.length);
            logger.info('appInit', '🔍 paneContainer children count:', paneContainer?.children?.length);

            console.log('[RENDERER] 🔍 Creating new PaneManager instance...');
            this.paneManager = new PaneManager(paneContainer);
            console.log('[RENDERER] ✓ PaneManager instance created');
            logger.info('appInit', '🔍 PaneManager created, calling init()...');

            console.log('[RENDERER] 🔍 Calling paneManager.init()...');
            const rootPane = this.paneManager.init();
            console.log('[RENDERER] ✓ init() returned, rootPane:', rootPane);
            logger.info('appInit', '🔍 init() returned, rootPane:', rootPane);
            logger.info('appInit', '🔍 rootPane type:', typeof rootPane);
            logger.info('appInit', '🔍 rootPane.id:', rootPane?.id);
            logger.info('appInit', '✓ PaneManager initialized with root pane:', rootPane.id);
        } catch (error) {
            console.error('[RENDERER] ❌❌❌ ERROR DURING PANEMANAGER INIT:', error);
            console.error('[RENDERER] Error stack:', error.stack);
            logger.error('appInit', '❌❌❌ ERROR DURING PANEMANAGER INIT:', error);
            logger.error('appInit', 'Error stack:', error.stack);
            throw error;
        }

        // Wire up WorkspaceManager with PaneManager and FileExplorer
        console.log('[RENDERER] 🔧 Wiring up WorkspaceManager...');
        this.workspaceManager.setManagers(this.paneManager, explorer);
        console.log('[RENDERER] ✓ WorkspaceManager wired up');
        logger.info('appInit', '✓ WorkspaceManager wired up with PaneManager and FileExplorer');

        // Show empty state in root pane
        try {
            console.log('[RENDERER] 📝 Creating empty state element...');
            const emptyState = document.createElement('div');
            emptyState.style.cssText = 'display: flex; align-items: center; justify-content: center; height: 100%; width: 100%; color: #888;';
            emptyState.textContent = 'Select a file from the sidebar to view its contents';
            console.log('[RENDERER] 📝 Appending empty state to rootPane.contentContainer...');
            console.log('[RENDERER] rootPane:', rootPane);
            console.log('[RENDERER] rootPane.contentContainer:', rootPane.contentContainer);

            if (!rootPane.contentContainer) {
                console.error('[RENDERER] ❌ rootPane.contentContainer is NULL/undefined!');
                throw new Error('rootPane.contentContainer is null or undefined');
            }

            rootPane.contentContainer.appendChild(emptyState);
            console.log('[RENDERER] ✓ Empty state appended');

            // Update root pane title
            console.log('[RENDERER] 📝 Updating root pane title...');
            const titleElement = rootPane.element.querySelector('.pane-title');
            console.log('[RENDERER] titleElement:', titleElement);
            if (titleElement) {
                titleElement.textContent = 'File Viewer';
                console.log('[RENDERER] ✓ Title updated');
            } else {
                console.warn('[RENDERER] ⚠️ titleElement not found');
            }
        } catch (error) {
            console.error('[RENDERER] ❌ ERROR setting up root pane:', error);
            console.error('[RENDERER] Error stack:', error.stack);
            // Continue anyway - this shouldn't block welcome screen setup
        }

        // Setup welcome screen show/hide logic
        console.log('[RENDERER] >>>>>>>>>> ABOUT TO CALL setupWelcomeScreen <<<<<<<<<<<');
        logger.info('appInit', '>>>>>>>>>> ABOUT TO CALL setupWelcomeScreen <<<<<<<<<<<');
        this.setupWelcomeScreen(welcomeContainer, appContainer);
        console.log('[RENDERER] >>>>>>>>>> setupWelcomeScreen CALLED <<<<<<<<<<<');
        logger.info('appInit', '>>>>>>>>>> setupWelcomeScreen RETURNED <<<<<<<<<<<');
    }

    /**
     * Create file viewer content structure
     */
    createFileViewerContent() {
        // Generate unique IDs for this instance to avoid conflicts
        const instanceId = 'fv-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);

        const container = document.createElement('div');
        container.style.cssText = 'position: absolute; top: 0; left: 0; right: 0; bottom: 0; display: flex; flex-direction: column; width: 100%; height: 100%;';
        container.dataset.fileViewerId = instanceId;

        const header = document.createElement('div');
        header.className = 'editor-header';

        const pathSpan = document.createElement('span');
        pathSpan.className = 'file-path';
        pathSpan.textContent = 'No file selected';
        // Don't use id attribute to avoid conflicts

        header.appendChild(pathSpan);

        const content = document.createElement('div');
        content.className = 'editor-content';

        const viewer = document.createElement('pre');
        viewer.className = 'file-viewer';
        viewer.dataset.viewerId = instanceId;
        // Don't use id attribute to avoid conflicts

        const code = document.createElement('code');
        code.textContent = 'Select a file from the sidebar to view its contents';

        viewer.appendChild(code);
        content.appendChild(viewer);

        container.appendChild(header);
        container.appendChild(content);

        logger.debug('appInit', 'Created FileViewer content structure with instanceId:', instanceId);

        return { container, header: pathSpan, viewer, instanceId };
    }

    /**
     * Setup global event handlers
     */
    setupGlobalHandlers() {
        logger.info('appInit', '🎯 Starting setupGlobalHandlers...');

        try {
            // Handle shortcut: open folder
            logger.debug('appInit', 'Setting up shortcut:open-folder handler...');
            eventBus.on('shortcut:open-folder', async () => {
                const homeDir = await fileSystemService.getHomeDirectory();
                if (homeDir) {
                    const explorer = uiManager.getComponent('fileExplorer');
                    if (explorer) {
                        await explorer.openDirectory(homeDir);
                    }
                }
            });
            logger.debug('appInit', '✓ shortcut:open-folder handler set');

            // Handle shortcut: refresh
            logger.debug('appInit', 'Setting up shortcut:refresh handler...');
            eventBus.on('shortcut:refresh', () => {
                eventBus.emit('explorer:refresh');
            });
            logger.debug('appInit', '✓ shortcut:refresh handler set');

            // Handle browser toggle - now opens in pane
            logger.debug('appInit', 'Setting up browser:toggle handler...');
            eventBus.on('browser:toggle', async () => {
                await this.openBrowserInPane();
            });
            logger.debug('appInit', '✓ browser:toggle handler set');

            // Handle request to open file in specific pane
            eventBus.on('pane:request-file-open', async (data) => {
                await this.openFileInPane(data.paneId, data.filePath);
            });

            // Handle Ctrl+E - Open Claude extension
            logger.debug('appInit', 'Setting up extension:open-claude handler...');
            if (window.electronAPI && window.electronAPI.onExtensionEvent) {
                window.electronAPI.onExtensionEvent(() => {
                    logger.debug('appInit', 'Ctrl+E pressed - Opening Claude extension');
                    const browser = uiManager.getComponent('browser');
                    if (browser && browser.toggleExtensionsDropdown) {
                        browser.toggleExtensionsDropdown();
                    }
                });
                logger.debug('appInit', '✓ extension:open-claude handler set');
            }

            // Handle extension sidebar open/close messages from main process
            const { ipcRenderer } = require('electron');

            ipcRenderer.on('extension-sidebar-opened', (event, data) => {
                logger.info('appInit', `Extension sidebar opened: ${data.extensionName}`);
                const sidebar = document.getElementById('extension-sidebar');
                const nameElement = document.getElementById('extension-name');
                if (sidebar) {
                    sidebar.style.display = 'flex';
                    if (nameElement) {
                        nameElement.textContent = data.extensionName;
                    }
                }
            });

            ipcRenderer.on('extension-sidebar-closed', (event) => {
                logger.info('appInit', 'Extension sidebar closed');
                const sidebar = document.getElementById('extension-sidebar');
                if (sidebar) {
                    sidebar.style.display = 'none';
                }
            });

            // Handle close button for sidebar
            const closeBtn = document.getElementById('extension-close-btn');
            if (closeBtn) {
                closeBtn.addEventListener('click', async () => {
                    logger.debug('appInit', 'Extension close button clicked');
                    await window.electronAPI.invoke('close-extension-window');
                });
            }

            // CRITICAL FIX: Handle terminal restoration when workspace layout is loaded
            // Don't create new terminals - reuse existing ones from the registry
            // This preserves the PTY connection and terminal state across workspace switches
            eventBus.on('terminal:create-in-pane', async (data) => {
                logger.debug('appInit', '====== TERMINAL RESTORATION STARTING ======');
                logger.debug('appInit', 'Pane ID:', data.paneId);
                logger.debug('appInit', 'Terminal ID (from data):', data.terminalId);

                const pane = this.paneManager.getPane(data.paneId);
                if (!pane) {
                    logger.error('appInit', 'Pane not found for terminal restoration:', data.paneId);
                    return;
                }

                // ====================================================================
                // TERMINAL PERSISTENCE LOGIC
                // ====================================================================
                // Check if this terminal already exists in the registry
                const existingTerminal = TerminalRegistryAPI.get(data.terminalId);

                if (existingTerminal && !existingTerminal.isDisposed) {
                    // PERSISTENCE SCENARIO: Terminal already exists!
                    // This happens when switching workspaces - the terminal was created before
                    // and is still alive with its PTY connection intact
                    logger.debug('appInit', `✓ REUSING EXISTING TERMINAL: ${data.terminalId}`);
                    logger.debug('appInit', 'This terminal has been running in the background!');

                    const terminalContainer = existingTerminal.container;
                    const terminalTitle = `Terminal`;

                    // CRITICAL FIX: Reset container display to flex
                    // The container may have display: none from being hidden in another pane
                    // We need to ensure it's visible when added to the new pane
                    terminalContainer.style.display = 'flex';
                    logger.debug('appInit', `Reset terminal container display to flex for ${data.terminalId}`);

                    // Add the existing container as a tab to this pane
                    const tabId = this.paneManager.addTab(
                        data.paneId,
                        `terminal://${data.terminalId}`,
                        terminalTitle,
                        terminalContainer,
                        'terminal',
                        null
                    );

                    // Update registry to reflect new pane
                    TerminalRegistryAPI.updatePaneId(data.terminalId, data.paneId);

                    // Trigger resize to fit new pane
                    if (existingTerminal.fitAddon) {
                        requestAnimationFrame(() => {
                            requestAnimationFrame(() => {
                                try {
                                    existingTerminal.fitAddon.fit();
                                    logger.debug('appInit', `✓ Terminal fitted to pane size: ${data.terminalId}`);
                                } catch (e) {
                                    logger.error('appInit', 'Error fitting terminal:', e.message);
                                }
                            });
                        });
                    }

                    logger.debug('appInit', '✓ TERMINAL PERSISTENCE SUCCESSFUL - Terminal reused with existing PTY connection');
                    return;
                }

                // ====================================================================
                // NEW TERMINAL SCENARIO
                // ====================================================================
                // Terminal doesn't exist yet - create a brand new one
                logger.debug('appInit', `⚠ CREATING NEW TERMINAL (not in registry yet): ${data.terminalId}`);

                // Create terminal container
                const terminalContainer = document.createElement('div');
                terminalContainer.className = 'terminal-pane-container';
                // CRITICAL: Don't use position: absolute with bottom: 0 - it ignores parent padding
                // Use height: 100% to fill the pane-content area which respects pane-container padding
                terminalContainer.style.cssText = 'display: flex; flex-direction: column; width: 100%; height: 100%; background: #1e1e1e;';

                // Terminal title
                const terminalTitle = 'Terminal';

                logger.debug('appInit', 'Adding terminal tab to pane');

                // Add as a tab to the pane
                const tabId = this.paneManager.addTab(
                    data.paneId,
                    `terminal://${Date.now()}`,
                    terminalTitle,
                    terminalContainer,
                    'terminal',
                    null
                );

                // Import Terminal component
                const Terminal = require('./components/terminal/Terminal');

                // Create Terminal instance
                logger.debug('appInit', 'Creating NEW Terminal instance with tabId:', tabId);
                const terminal = new Terminal(terminalContainer, { id: data.terminalId });
                await terminal.init();
                await terminal.attach();

                // Store reference for cleanup
                terminalContainer._terminalInstance = terminal;

                // CRITICAL: Register terminal in the registry so it won't be recreated on next workspace switch
                TerminalRegistryAPI.register(terminal, terminalContainer);
                TerminalRegistryAPI.updatePaneId(terminal.id, data.paneId);

                // Track terminal in active workspace
                this.workspaceManager.trackTerminalInActiveWorkspace(terminal.id);

                logger.debug('appInit', '✓ NEW TERMINAL CREATED AND REGISTERED SUCCESSFULLY');
                logger.debug('appInit', '====== TERMINAL RESTORATION COMPLETE ======');
            });

            // Handle file selection - open in active pane
            eventBus.on('file:selected', async (data) => {
                const activePane = this.paneManager.getActivePane();
                if (activePane) {
                    await this.openFileInPane(activePane.id, data.path, data.line, data.enableGitDiff);
                }
            });

            // Save workspace layout when panes or tabs change
            eventBus.on('pane:split', () => {
                this.saveWorkspaceLayout();
            });

            eventBus.on('pane:closed', () => {
                this.saveWorkspaceLayout();
            });

            eventBus.on('tab:switched', () => {
                this.saveWorkspaceLayout();
            });

            eventBus.on('tab:closed', (data) => {
                // Cleanup browser instance if browser tab was closed
                if (data && data.contentType === 'browser') {
                    logger.debug('appInit', 'Browser tab closed, cleaning up browser instance');
                    // The browser instance should be stored in the content element
                    const browserInstance = data.content?._browserInstance;
                    if (browserInstance) {
                        // Untrack browser from workspace
                        this.workspaceManager.untrackBrowser(browserInstance.instanceId);
                        logger.debug('appInit', 'Browser untracked from workspace:', browserInstance.instanceId);

                        // Destroy browser instance
                        if (typeof browserInstance.destroy === 'function') {
                            logger.debug('appInit', 'Destroying browser instance');
                            browserInstance.destroy();
                        }
                    }
                }
                this.saveWorkspaceLayout();
            });

            // Handle workspace activation - restore layout
            eventBus.on('workspace:activated', async (data) => {
                logger.debug('appInit', 'Workspace activated:', data.workspaceId);
                await this.restoreWorkspaceLayout(data.workspace);
            });

            // Git-related event handlers
            eventBus.on('file:saved', async (data) => {
                try {
                    const gitStore = require('./modules/GitStore').getInstance();
                    await gitStore.refreshStatus();
                } catch (error) {
                    logger.warn('appInit', 'Git status refresh failed:', error.message);
                }
            });

            eventBus.on('explorer:directory-opened', async (data) => {
                try {
                    const gitService = require('./services/GitService').getInstance();
                    const gitStore = require('./modules/GitStore').getInstance();

                    // Initialize Git for the opened directory
                    await gitService.initialize(data.path);
                    logger.info('appInit', 'Git initialized for directory:', data.path);
                } catch (error) {
                    logger.warn('appInit', 'Git initialization failed:', error.message);
                }
            });

            eventBus.on('git:toggle-blame', () => {
                // Get active file viewer and toggle blame
                const activePane = this.paneManager?.getActivePane();
                if (activePane && activePane.currentFile) {
                    const editorElement = activePane.contentContainer.querySelector('[data-file-viewer-id]');
                    if (editorElement && editorElement._fileViewerInstance) {
                        const textEditor = editorElement._fileViewerInstance.editor;
                        if (textEditor && typeof textEditor.toggleBlame === 'function') {
                            textEditor.toggleBlame();
                        }
                    }
                }
            });

            eventBus.on('git:view-commit', (data) => {
                // Open commit view in a new tab
                logger.debug('appInit', 'Opening commit view for:', data.commit.hash);
                this.openCommitView(data.commit, data.repositoryPath);
            });

            // Global keyboard shortcuts
            document.addEventListener('keydown', (e) => {
                const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
                const ctrlOrCmd = isMac ? e.metaKey : e.ctrlKey;

                // Ctrl+P / Cmd+P - Quick Open
                if (ctrlOrCmd && e.key === 'p' && !e.shiftKey) {
                    e.preventDefault();
                    quickOpen.show();
                }

                // Ctrl+Shift+F / Cmd+Shift+F - Global Search
                if (ctrlOrCmd && e.shiftKey && e.key === 'F') {
                    e.preventDefault();
                    globalSearch.toggle();
                }

                // Ctrl+Shift+H / Cmd+Shift+H - Find & Replace
                if (ctrlOrCmd && e.shiftKey && e.key === 'H') {
                    e.preventDefault();
                    findReplacePanel.toggle();
                }

                // Ctrl+` / Cmd+` - Toggle Terminal
                if (ctrlOrCmd && e.key === '`') {
                    e.preventDefault();
                    eventBus.emit('terminal:toggle-panel');
                }
            });

            // Log all events in debug mode
            if (config.get('debug', false)) {
                eventBus.setDebug(true);
            }

            logger.info('appInit', '✅ setupGlobalHandlers completed successfully');
        } catch (error) {
            logger.error('appInit', '❌ Error in setupGlobalHandlers:', error);
            logger.error('appInit', 'setupGlobalHandlers error stack:', error.stack);
        }
    }

    /**
     * Setup welcome screen show/hide logic
     */
    setupWelcomeScreen(welcomeContainer, appContainer) {
        logger.info('appInit', 'Setting up welcome screen show/hide logic');
        logger.debug('appInit', 'welcomeContainer:', welcomeContainer);
        logger.debug('appInit', 'appContainer:', appContainer);

        if (!welcomeContainer || !appContainer) {
            logger.error('appInit', 'welcomeContainer or appContainer is NULL! Cannot setup welcome screen');
            return;
        }

        // Listen for folder open events
        console.log('[RENDERER] 🎧 Registering listener for explorer:directory-opened event');
        eventBus.on('explorer:directory-opened', (data) => {
            console.log('[RENDERER] ╔═══════════════════════════════════════════════════╗');
            console.log('[RENDERER] ║  🎉 RECEIVED explorer:directory-opened EVENT!  ║');
            console.log('[RENDERER] ╚═══════════════════════════════════════════════════╝');
            console.log('[RENDERER] Event data:', data);
            console.log('[RENDERER] Event data.path:', data.path);
            console.log('[RENDERER] Event data.entries:', data.entries?.length);

            logger.info('appInit', '🎉 RECEIVED explorer:directory-opened EVENT');
            logger.info('appInit', 'Event data:', data);
            logger.info('appInit', 'Hiding welcome screen and showing IDE');

            console.log('[RENDERER] welcomeContainer:', welcomeContainer);
            console.log('[RENDERER] appContainer:', appContainer);
            console.log('[RENDERER] welcomeContainer.style.display BEFORE:', welcomeContainer.style.display);
            console.log('[RENDERER] appContainer.style.display BEFORE:', appContainer.style.display);
            logger.info('appInit', 'welcomeContainer before:', welcomeContainer.style.display);
            logger.info('appInit', 'appContainer before:', appContainer.style.display);

            console.log('[RENDERER] 🔄 Setting welcomeContainer.style.display = "none"');
            welcomeContainer.style.display = 'none';
            console.log('[RENDERER] 🔄 Setting appContainer.style.display = "block"');
            appContainer.style.display = 'block';

            console.log('[RENDERER] welcomeContainer.style.display AFTER:', welcomeContainer.style.display);
            console.log('[RENDERER] appContainer.style.display AFTER:', appContainer.style.display);
            logger.info('appInit', 'welcomeContainer after:', welcomeContainer.style.display);
            logger.info('appInit', 'appContainer after:', appContainer.style.display);
            console.log('[RENDERER] ✅ IDE SHOULD NOW BE VISIBLE!');
            logger.info('appInit', '===== FINISHED SHOWING IDE =====');
        });

        logger.info('appInit', '✓ Welcome screen event listener registered successfully');
    }

    /**
     * Setup folder selection button
     */
    setupFolderButton() {
        logger.info('appInit', 'Setting up folder button...');
        const folderButton = document.getElementById('select-folder');
        logger.debug('appInit', 'Folder button element:', folderButton);

        if (folderButton) {
            logger.debug('appInit', 'Folder button found, adding click listener');
            folderButton.addEventListener('click', async () => {
                logger.debug('appInit', 'Folder button clicked!');
                try {
                    // Open folder selection dialog
                    logger.debug('appInit', 'Calling fileSystemService.selectFolder()...');
                    const result = await fileSystemService.selectFolder();
                    logger.debug('appInit', 'selectFolder result:', result);

                    if (!result.canceled && result.path) {
                        logger.debug('appInit', 'Folder selected:', result.path);
                        const explorer = uiManager.getComponent('fileExplorer');
                        logger.debug('appInit', 'FileExplorer component:', explorer);

                        if (explorer) {
                            logger.debug('appInit', 'Opening directory:', result.path);
                            await explorer.openDirectory(result.path);
                            logger.debug('appInit', 'Directory opened successfully');
                        } else {
                            logger.error('appInit', 'FileExplorer component not found!');
                        }
                    } else {
                        logger.debug('appInit', 'Folder selection cancelled or no path returned');
                    }
                } catch (error) {
                    logger.error('appInit', 'Error in folder button click handler:', error);
                }
            });
        } else {
            logger.error('appInit', 'Folder button element not found!');
        }
    }

    /**
     * Setup explorer toolbar buttons
     */
    setupExplorerToolbar() {
        const explorer = uiManager.getComponent('fileExplorer');
        if (!explorer) {
            logger.error('appInit', 'FileExplorer component not found for toolbar setup!');
            return;
        }

        // New File button
        const btnNewFile = document.getElementById('btn-new-file');
        if (btnNewFile) {
            btnNewFile.addEventListener('click', async () => {
                if (explorer.currentPath) {
                    await explorer.createNewFile(explorer.currentPath);
                } else {
                    await modal.alert('No Folder Open', 'Please open a folder first');
                }
            });
        }

        // New Folder button
        const btnNewFolder = document.getElementById('btn-new-folder');
        if (btnNewFolder) {
            btnNewFolder.addEventListener('click', async () => {
                if (explorer.currentPath) {
                    await explorer.createNewFolder(explorer.currentPath);
                } else {
                    await modal.alert('No Folder Open', 'Please open a folder first');
                }
            });
        }

        // Collapse All button
        const btnCollapseAll = document.getElementById('btn-collapse-all');
        if (btnCollapseAll) {
            btnCollapseAll.addEventListener('click', () => {
                explorer.collapseAll();
            });
        }

        // Refresh button
        const btnRefresh = document.getElementById('btn-refresh');
        if (btnRefresh) {
            btnRefresh.addEventListener('click', async () => {
                await explorer.refreshCurrentDirectory();
            });
        }
    }

    /**
     * Open browser in a pane as a tab
     */
    async openBrowserInPane(url = 'https://google.com') {
        logger.debug('appInit', '========== OPENING BROWSER IN PANE ==========');
        logger.debug('appInit', 'URL:', url);

        // Get active pane or use root pane
        let activePane = this.paneManager?.getActivePane();
        if (!activePane) {
            logger.warn('appInit', 'No active pane, using root pane');
            activePane = this.paneManager?.rootPane;
        }

        if (!activePane) {
            logger.error('appInit', 'No pane available for browser');
            return;
        }

        logger.debug('appInit', 'Opening browser in pane:', activePane.id);

        // Create browser container
        const browserContainer = document.createElement('div');
        browserContainer.className = 'browser-pane-container';
        browserContainer.dataset.browserUrl = url;
        browserContainer.style.cssText = 'position: absolute; top: 0; left: 0; right: 0; bottom: 0; display: flex; flex-direction: column; width: 100%; height: 100%;';

        // Browser title
        const browserTitle = 'Browser';

        logger.debug('appInit', 'Adding browser tab to pane');

        // Add as a tab to the pane using browser:// protocol (returns tabId)
        const tabId = this.paneManager.addTab(
            activePane.id,
            `browser://${Date.now()}`, // Unique ID for browser instance
            browserTitle,
            browserContainer,
            'browser',
            null
        );

        // Get active profile for cookie isolation
        const activeProfile = this.browserProfileManager.getActiveProfile();
        const profileId = activeProfile ? activeProfile.id : null;
        logger.debug('appInit', 'Using profile:', profileId);

        // Create Browser instance NOW with paneId, tabId, and profileId
        logger.debug('appInit', 'Creating Browser instance with tabId:', tabId, 'profileId:', profileId);
        const browser = new Browser(browserContainer, activePane.id, tabId, profileId);

        // Store reference for cleanup
        browserContainer._browserInstance = browser;

        // Track browser in active workspace
        this.workspaceManager.trackBrowserInActiveWorkspace(browser.instanceId);
        logger.debug('appInit', 'Browser tracked in workspace:', browser.instanceId);

        logger.debug('appInit', '✓ Browser opened in pane successfully');
        logger.debug('appInit', '========================================');
    }

    /**
     * Open terminal in a pane as a tab
     */
    async openTerminalInPane() {
        logger.debug('appInit', '========== OPENING TERMINAL IN PANE ==========');

        // Get active pane or use root pane
        let activePane = this.paneManager?.getActivePane();
        if (!activePane) {
            logger.warn('appInit', 'No active pane, using root pane');
            activePane = this.paneManager?.rootPane;
        }

        if (!activePane) {
            logger.error('appInit', 'No pane available for terminal');
            return;
        }

        logger.debug('appInit', 'Opening terminal in pane:', activePane.id);

        // Create terminal container
        const terminalContainer = document.createElement('div');
        terminalContainer.className = 'terminal-pane-container';
        // CRITICAL: Don't use position: absolute with bottom: 0 - it ignores parent padding
        // Use height: 100% to fill the pane-content area which respects pane-container padding
        terminalContainer.style.cssText = 'display: flex; flex-direction: column; width: 100%; height: 100%; background: #1e1e1e;';

        // Terminal title
        const terminalTitle = 'Terminal';

        logger.debug('appInit', 'Adding terminal tab to pane');

        // Add as a tab to the pane using terminal:// protocol (returns tabId)
        const tabId = this.paneManager.addTab(
            activePane.id,
            `terminal://${Date.now()}`, // Unique ID for terminal instance
            terminalTitle,
            terminalContainer,
            'terminal',
            null
        );

        // Import Terminal component
        const Terminal = require('./components/terminal/Terminal');

        // Create Terminal instance
        logger.debug('appInit', 'Creating Terminal instance with tabId:', tabId);
        const terminal = new Terminal(terminalContainer);
        await terminal.init();
        await terminal.attach();

        // Store reference for cleanup
        terminalContainer._terminalInstance = terminal;

        // CRITICAL: Register terminal in the registry so it persists across workspace switches
        TerminalRegistryAPI.register(terminal, terminalContainer);
        TerminalRegistryAPI.updatePaneId(terminal.id, activePane.id);
        logger.debug('appInit', `✓ Terminal registered in registry: ${terminal.id}`);

        // Track terminal in active workspace
        this.workspaceManager.trackTerminalInActiveWorkspace(terminal.id);

        logger.debug('appInit', '✓ Terminal opened in pane successfully');
        logger.debug('appInit', '========================================');
    }

    /**
     * Open a file in a specific pane
     */
    async openFileInPane(paneId, filePath, lineNumber = null, enableGitDiff = false) {
        logger.debug('appInit', '========== OPENING FILE IN PANE ==========');
        logger.debug('appInit', 'paneId:', paneId);
        logger.debug('appInit', 'filePath:', filePath);
        logger.debug('appInit', 'lineNumber:', lineNumber);
        logger.debug('appInit', 'enableGitDiff:', enableGitDiff);

        const pane = this.paneManager.getPane(paneId);
        if (!pane) {
            logger.error('appInit', 'Pane not found:', paneId);
            return;
        }

        // Create file viewer content structure for this tab
        const fileViewerContent = this.createFileViewerContent();
        logger.debug('appInit', 'FileViewer content structure created');
        logger.debug('appInit', 'Container element:', fileViewerContent.container);
        logger.debug('appInit', 'Container instanceId:', fileViewerContent.instanceId);
        logger.debug('appInit', 'Viewer element:', fileViewerContent.viewer);

        // Create a new FileViewer instance for this tab
        logger.debug('appInit', 'Creating new FileViewer instance for file:', filePath);
        const viewer = new FileViewer(fileViewerContent.viewer, fileViewerContent.header, fileSystemService, sqliteService);
        logger.debug('appInit', 'FileViewer instance created:', viewer);

        // Store the viewer instance reference in the container for debugging
        fileViewerContent.container.dataset.filePath = filePath;
        fileViewerContent.container._fileViewerInstance = viewer;

        // Open the file
        logger.debug('appInit', 'Opening file in FileViewer:', filePath);
        await viewer.openFile(filePath, lineNumber, enableGitDiff);
        logger.debug('appInit', 'File opened successfully in FileViewer');

        // Get the filename for the title
        const pathUtils = require('./utils/PathUtils');
        const fileName = pathUtils.basename(filePath);

        logger.debug('appInit', 'Adding tab to pane:', { paneId, filePath, fileName, container: fileViewerContent.container, lineNumber });

        // Add as a tab to the pane
        this.paneManager.addTab(paneId, filePath, fileName, fileViewerContent.container, 'file-viewer', lineNumber);

        logger.debug('appInit', '✓ File opened in pane as tab successfully');
        logger.debug('appInit', 'Container in DOM:', fileViewerContent.container.parentElement !== null);
        logger.debug('appInit', 'Container display:', fileViewerContent.container.style.display);
        logger.debug('appInit', '========================================');
    }

    /**
     * Open a commit view in a new tab
     */
    async openCommitView(commit, repositoryPath) {
        logger.debug('appInit', '========== OPENING COMMIT VIEW ==========');
        logger.debug('appInit', 'Commit hash:', commit.hash);
        logger.debug('appInit', 'Repository path:', repositoryPath);

        // Get active pane
        const activePane = this.paneManager?.getActivePane();
        if (!activePane) {
            logger.error('appInit', 'No active pane found');
            return;
        }

        // Create commit view container
        const commitViewContainer = document.createElement('div');
        commitViewContainer.className = 'commit-view-container';
        commitViewContainer.dataset.commitHash = commit.hash;
        commitViewContainer.style.cssText = `
            width: 100%;
            height: 100%;
            display: flex;
            flex-direction: column;
        `;

        // Create CommitView instance
        logger.debug('appInit', 'Creating CommitView instance');
        const commitView = new CommitView(commitViewContainer, commit, repositoryPath);

        // Store reference for debugging
        commitViewContainer._commitViewInstance = commitView;

        // Get commit title for tab
        const commitTitle = `Commit ${commit.hash.substring(0, 7)}`;

        logger.debug('appInit', 'Adding commit view tab to pane');

        // Add as a tab to the pane using the commit hash as unique ID
        this.paneManager.addTab(
            activePane.id,
            `commit://${commit.hash}`, // Use commit:// protocol for unique ID
            commitTitle,
            commitViewContainer,
            'commit-view',
            null
        );

        logger.debug('appInit', '✓ Commit view opened successfully');
        logger.debug('appInit', '========================================');
    }

    /**
     * Save current workspace layout
     */
    saveWorkspaceLayout() {
        const activeWorkspace = this.workspaceManager.getActiveWorkspace();
        if (!activeWorkspace) return;

        const layout = this.paneManager.serializeLayout();
        this.workspaceManager.updatePaneLayout(activeWorkspace.id, layout);

        logger.debug('appInit', 'Workspace layout saved');
    }

    /**
     * Restore workspace layout
     *
     * CRITICAL FOR TERMINAL PERSISTENCE:
     * This method should ONLY deserialize layout when panes don't exist yet (first load).
     * On workspace switches, panes are already in memory (just hidden), so we skip
     * deserialization to avoid recreating terminals and causing duplication.
     */
    async restoreWorkspaceLayout(workspace) {
        logger.debug('appInit', 'Restoring workspace layout for:', workspace.name);

        // CRITICAL CHECK: Do the workspace panes already exist in memory?
        // If yes, they're just hidden and we should NOT deserialize (which would recreate them)
        const panesAlreadyExist = workspace.paneIds && workspace.paneIds.length > 0 &&
            workspace.paneIds.some(paneId => this.paneManager.panes.has(paneId));

        if (panesAlreadyExist) {
            logger.debug('appInit', '✓ SKIP LAYOUT DESERIALIZATION - Panes already exist in memory (just hidden)');
            logger.debug('appInit', `Workspace has ${workspace.paneIds.length} panes that are already created`);
            logger.debug('appInit', 'WorkspaceManager.showWorkspacePanes() will handle showing them');
            // Panes are already created and in the DOM, just hidden via CSS
            // WorkspaceManager.showWorkspacePanes() will set display='flex' to show them
            // This preserves terminals with their PTY connections intact
            return;
        }

        logger.debug('appInit', 'Panes do NOT exist yet - will deserialize layout from scratch');

        if (!workspace.paneLayout) {
            logger.debug('appInit', 'No layout to restore, creating fresh layout');
            // No saved layout, create a fresh one with empty state
            this.paneManager.container.innerHTML = '';
            this.paneManager.panes.clear();
            this.paneManager.rootPane = null;
            this.paneManager.activePane = null;

            const rootPane = this.paneManager.createRootPane();
            this.paneManager.container.appendChild(rootPane.element);
            this.paneManager.rootPane = rootPane;
            this.paneManager.setActivePane(rootPane.id);

            // Show empty state
            const emptyState = document.createElement('div');
            emptyState.style.cssText = 'display: flex; align-items: center; justify-content: center; height: 100%; width: 100%; color: #888;';
            emptyState.textContent = 'Select a file from the sidebar to view its contents';
            rootPane.contentContainer.appendChild(emptyState);

            return;
        }

        // Restore the saved layout (ONLY on first load when panes don't exist)
        logger.debug('appInit', 'Deserializing layout - creating panes from scratch');
        await this.paneManager.deserializeLayout(workspace.paneLayout);

        logger.debug('appInit', 'Workspace layout restored');
    }

    /**
     * Setup icon sidebar buttons
     */
    setupIconSidebar() {
        const iconFiles = document.getElementById('icon-files');
        const iconGit = document.getElementById('icon-git');
        const iconSSH = document.getElementById('icon-ssh');
        const iconBrowser = document.getElementById('icon-browser');
        const iconTerminal = document.getElementById('icon-terminal');

        logger.debug('appInit', 'Icon Terminal element:', iconTerminal);

        if (iconFiles) {
            iconFiles.addEventListener('click', () => {
                logger.debug('appInit', 'Files icon clicked');

                // Set active state
                iconFiles.classList.add('active');
                if (iconGit) iconGit.classList.remove('active');
                if (iconSSH) iconSSH.classList.remove('active');
                if (iconBrowser) iconBrowser.classList.remove('active');

                // Hide Git panel if visible
                eventBus.emit('git:hide-panel');

                // Hide SSH panel if visible
                eventBus.emit('ssh:hide-panel');
            });
        }

        if (iconGit) {
            iconGit.addEventListener('click', () => {
                logger.debug('appInit', 'Git icon clicked');

                // Toggle active state
                if (iconFiles) iconFiles.classList.remove('active');
                iconGit.classList.add('active');
                if (iconSSH) iconSSH.classList.remove('active');
                if (iconBrowser) iconBrowser.classList.remove('active');

                // Hide SSH panel if visible
                eventBus.emit('ssh:hide-panel');

                // Toggle Git panel
                eventBus.emit('git:toggle-panel');
            });
        }

        if (iconSSH) {
            iconSSH.addEventListener('click', () => {
                logger.debug('appInit', 'SSH icon clicked');

                // Toggle active state
                if (iconFiles) iconFiles.classList.remove('active');
                if (iconGit) iconGit.classList.remove('active');
                iconSSH.classList.add('active');
                if (iconBrowser) iconBrowser.classList.remove('active');

                // Hide Git panel if visible
                eventBus.emit('git:hide-panel');

                // Toggle SSH panel
                eventBus.emit('ssh:toggle-panel');
            });
        }

        if (iconBrowser) {
            iconBrowser.addEventListener('click', async () => {
                logger.debug('appInit', 'Browser icon clicked');

                // Toggle active state
                if (iconFiles) iconFiles.classList.remove('active');
                if (iconGit) iconGit.classList.remove('active');
                if (iconSSH) iconSSH.classList.remove('active');
                iconBrowser.classList.add('active');

                // Open browser in pane
                await this.openBrowserInPane();

                // Hide Git panel if visible
                eventBus.emit('git:hide-panel');

                // Hide SSH panel if visible
                eventBus.emit('ssh:hide-panel');
            });
        }

        if (iconTerminal) {
            logger.debug('appInit', 'Attaching click handler to terminal icon...');
            iconTerminal.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                logger.debug('appInit', 'Terminal icon clicked');

                // Toggle active state
                if (iconFiles) iconFiles.classList.remove('active');
                if (iconGit) iconGit.classList.remove('active');
                if (iconSSH) iconSSH.classList.remove('active');
                if (iconBrowser) iconBrowser.classList.remove('active');
                iconTerminal.classList.add('active');

                // Open terminal in pane
                await this.openTerminalInPane();

                // Hide Git panel if visible
                eventBus.emit('git:hide-panel');

                // Hide SSH panel if visible
                eventBus.emit('ssh:hide-panel');
            });
            logger.debug('appInit', '✓ Terminal icon click handler attached');
        } else {
            logger.warn('appInit', 'Terminal icon element not found!');
        }
    }

    /**
     * Setup SSH menu action handlers
     * @param {SSHPanel} sshPanel - SSH panel instance
     */
    setupSSHMenuHandlers(sshPanel) {
        // Handle new connection action
        eventBus.on('ssh:new-connection', () => {
            logger.debug('ssh', 'New connection menu action triggered');
            sshPanel.showAddConnectionDialog();
        });

        // Handle quick connect action
        eventBus.on('ssh:quick-connect', () => {
            logger.debug('ssh', 'Quick connect menu action triggered');
            this.showQuickConnectDialog();
        });

        // Handle disconnect all action
        eventBus.on('ssh:disconnect-all', async () => {
            logger.debug('ssh', 'Disconnect all menu action triggered');
            try {
                if (window.sshService && window.sshService.isInitialized()) {
                    const connections = await window.sshService.getConnections();
                    const connectedConnections = connections.filter(conn => conn.state === 'connected');

                    if (connectedConnections.length === 0) {
                        await modal.alert('No Connections', 'No active SSH connections to disconnect.');
                        return;
                    }

                    const confirmed = await modal.confirm(
                        'Disconnect All',
                        `Are you sure you want to disconnect ${connectedConnections.length} SSH connection(s)?`
                    );
                    if (confirmed) {
                        for (const conn of connectedConnections) {
                            await window.sshService.disconnect(conn.id);
                        }
                        logger.info('ssh', `Disconnected ${connectedConnections.length} SSH connections`);
                    }
                } else {
                    await modal.alert('Service Unavailable', 'SSH service not available.');
                }
            } catch (error) {
                logger.error('ssh', 'Failed to disconnect all SSH connections:', error);
                await modal.alert('Disconnect Error', 'Failed to disconnect SSH connections: ' + error.message);
            }
        });

        // Handle health check action
        eventBus.on('ssh:health-check', async () => {
            logger.debug('ssh', 'Health check menu action triggered');
            try {
                if (window.sshService && window.sshService.isInitialized()) {
                    const status = await window.sshService.getHealthStatus();
                    const message = `Total connections: ${status.total}\nHealthy: ${status.healthy}\nUnhealthy: ${status.unhealthy}`;
                    await modal.alert('SSH Health Status', message);
                } else {
                    await modal.alert('Service Unavailable', 'SSH service not available.');
                }
            } catch (error) {
                logger.error('ssh', 'Failed to get SSH health status:', error);
                await modal.alert('Health Check Error', 'Failed to get SSH health status: ' + error.message);
            }
        });

        // Handle SSH settings action
        eventBus.on('ssh:settings', async () => {
            logger.debug('ssh', 'SSH settings menu action triggered');
            await modal.alert('Coming Soon', 'SSH Settings functionality coming soon!');
        });

        logger.debug('ssh', 'SSH menu handlers setup complete');
    }

    /**
     * Show quick connect dialog
     */
    async showQuickConnectDialog() {
        try {
            // Get host
            const host = await modal.prompt('SSH Quick Connect', 'Enter SSH host (e.g., user@hostname):');
            if (!host || !host.trim()) return;

            const parts = host.includes('@') ? host.split('@') : ['', host];
            let username = parts[0];
            const hostname = parts[1] || host;

            // Get username if not provided in host
            if (!username) {
                username = await modal.prompt('SSH Quick Connect', 'Enter username:');
            }

            if (!username || !hostname) {
                await modal.alert('Invalid Input', 'Invalid host format. Please use user@hostname or provide username separately.');
                return;
            }

            // Get port
            const portStr = await modal.prompt('SSH Quick Connect', 'Enter port (default: 22):', '22');
            const port = parseInt(portStr) || 22;

            // Get password
            const password = await modal.prompt('SSH Quick Connect', 'Enter password (leave empty for key authentication):');

            const connectionConfig = {
                name: `Quick Connect - ${hostname}`,
                host: hostname,
                username: username,
                port: port
            };

            if (password && password.trim()) {
                connectionConfig.password = password;
            }

            // Create and connect
            await this.createAndConnectSSH(connectionConfig);
        } catch (error) {
            logger.error('ssh', 'Error in quick connect dialog:', error);
            await modal.alert('Connection Error', 'Failed to process quick connect: ' + error.message);
        }
    }

    /**
     * Create and connect SSH connection
     * @param {Object} connectionConfig - SSH connection configuration
     */
    async createAndConnectSSH(connectionConfig) {
        try {
            if (!window.sshService || !window.sshService.isInitialized()) {
                await modal.alert('Service Unavailable', 'SSH service not available.');
                return;
            }

            logger.info('ssh', 'Creating quick connect SSH connection:', connectionConfig.name);

            const connectionId = await window.sshService.createConnection(connectionConfig);
            logger.info('ssh', 'SSH connection created with ID:', connectionId);

            await window.sshService.connect(connectionId);
            logger.info('ssh', 'SSH connection established successfully');

            // Create or get workspace for this SSH connection
            const sshPath = `ssh://${connectionConfig.host}`;
            const workspace = await this.workspaceManager.getOrCreateWorkspaceForPath(sshPath);

            // Store SSH connection ID in workspace
            workspace.sshConnectionId = connectionId;
            this.workspaceManager.saveWorkspaces();
            logger.info('ssh', `SSH connection ${connectionId} associated with workspace ${workspace.id}`);

            // Switch to SSH workspace
            await this.workspaceManager.setActiveWorkspace(workspace.id);
            logger.info('ssh', `Switched to SSH workspace: ${workspace.name}`);

            // Treat SSH connection like opening a folder - transition to main IDE
            // Use explorer:open-folder to trigger the opening (not explorer:directory-opened)
            eventBus.emit('explorer:open-folder', {
                path: sshPath,
                type: 'ssh',
                connectionId: connectionId,
                connectionConfig: connectionConfig
            });

            logger.info('ssh', `SSH workspace opened for ${connectionConfig.host}`);
        } catch (error) {
            logger.error('ssh', 'Failed to create/connect SSH:', error);
            await modal.alert('Connection Failed', 'Failed to connect to SSH server: ' + error.message);
        }
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', async () => {
        const app = new Application();
        await app.init();
    });
} else {
    // DOM already loaded
    (async () => {
        const app = new Application();
        await app.init();
    })();
}

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

// Import components
const MenuBar = require('./components/MenuBar');
const FileExplorer = require('./components/FileExplorer');
const FileViewer = require('./components/FileViewer');
const WelcomeScreen = require('./components/WelcomeScreen');
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

/**
 * Application Bootstrap
 */
class Application {
    constructor() {
        this.initialized = false;
        this.browserInstance = null;
        this.browserContainer = null;
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

            // 3.5. Initialize Git services
            await this.initializeGitServices();
            logger.info('appInit', '✓ Git services initialized');

            // 4. Setup global event handlers
            this.setupGlobalHandlers();
            logger.info('appInit', '✓ Global handlers setup');

            // 5. Initialize UI components
            this.initializeComponents();
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
    initializeComponents() {
        // Get DOM elements
        const welcomeContainer = document.getElementById('welcome-container');
        const appContainer = document.getElementById('app-container');
        const menuBarContainer = document.getElementById('menu-bar');
        const fileTreeContainer = document.getElementById('file-tree');
        const paneContainer = document.getElementById('pane-container');

        // Create and register WelcomeScreen
        const welcomeScreen = new WelcomeScreen(welcomeContainer, config, fileSystemService);
        uiManager.registerComponent('welcomeScreen', welcomeScreen);

        // Create and register MenuBar
        const menuBar = new MenuBar(menuBarContainer, fileSystemService);
        uiManager.registerComponent('menuBar', menuBar);

        // Create and register WorkspacePanel
        const workspacePanel = new WorkspacePanel();
        uiManager.registerComponent('workspacePanel', workspacePanel);

        // Create and register FileExplorer
        const explorer = new FileExplorer(fileTreeContainer, fileSystemService, config);
        uiManager.registerComponent('fileExplorer', explorer);

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
            const sshPanel = new SSHPanel();
            uiManager.registerComponent('sshPanel', sshPanel);

            logger.info('appInit', '✓ SSH UI components registered');
        } catch (error) {
            logger.warn('appInit', 'Failed to initialize SSH UI components:', error.message);
        }

        // Initialize PaneManager
        this.paneManager = new PaneManager(paneContainer);
        const rootPane = this.paneManager.init();
        logger.info('appInit', '✓ PaneManager initialized with root pane:', rootPane.id);

        // Show empty state in root pane
        const emptyState = document.createElement('div');
        emptyState.style.cssText = 'display: flex; align-items: center; justify-content: center; height: 100%; width: 100%; color: #888;';
        emptyState.textContent = 'Select a file from the sidebar to view its contents';
        rootPane.contentContainer.appendChild(emptyState);

        // Update root pane title
        const titleElement = rootPane.element.querySelector('.pane-title');
        if (titleElement) {
            titleElement.textContent = 'File Viewer';
        }

        // Setup welcome screen show/hide logic
        this.setupWelcomeScreen(welcomeContainer, appContainer);
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
        // Handle shortcut: open folder
        eventBus.on('shortcut:open-folder', async () => {
            const homeDir = await fileSystemService.getHomeDirectory();
            if (homeDir) {
                const explorer = uiManager.getComponent('fileExplorer');
                if (explorer) {
                    await explorer.openDirectory(homeDir);
                }
            }
        });

        // Handle shortcut: refresh
        eventBus.on('shortcut:refresh', () => {
            eventBus.emit('explorer:refresh');
        });

        // Handle browser toggle
        eventBus.on('browser:toggle', () => {
            this.toggleBrowser();
        });

        // Handle request to open file in specific pane
        eventBus.on('pane:request-file-open', async (data) => {
            await this.openFileInPane(data.paneId, data.filePath);
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

        eventBus.on('tab:closed', () => {
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
        });

        // Log all events in debug mode
        if (config.get('debug', false)) {
            eventBus.setDebug(true);
        }
    }

    /**
     * Setup welcome screen show/hide logic
     */
    setupWelcomeScreen(welcomeContainer, appContainer) {
        logger.info('appInit', 'Setting up welcome screen show/hide logic');
        logger.debug('appInit', 'welcomeContainer:', welcomeContainer);
        logger.debug('appInit', 'appContainer:', appContainer);

        // Listen for folder open events
        eventBus.on('explorer:directory-opened', (data) => {
            logger.debug('appInit', '===== RECEIVED explorer:directory-opened EVENT =====');
            logger.debug('appInit', 'Event data:', data);
            logger.debug('appInit', 'Hiding welcome screen and showing IDE');
            logger.debug('appInit', 'welcomeContainer before:', welcomeContainer.style.display);
            logger.debug('appInit', 'appContainer before:', appContainer.style.display);

            welcomeContainer.style.display = 'none';
            appContainer.style.display = 'block';

            logger.debug('appInit', 'welcomeContainer after:', welcomeContainer.style.display);
            logger.debug('appInit', 'appContainer after:', appContainer.style.display);
            logger.debug('appInit', '===== FINISHED SHOWING IDE =====');
        });
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
                    alert('Please open a folder first');
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
                    alert('Please open a folder first');
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
     * Toggle browser panel
     */
    toggleBrowser() {
        logger.debug('appInit', 'Toggle browser called');

        if (!this.browserInstance) {
            logger.debug('appInit', 'Creating browser...');

            // Create container (positioned after sidebar: 48px icon + 280px sidebar = 328px)
            this.browserContainer = document.createElement('div');
            this.browserContainer.id = 'browser-panel';
            this.browserContainer.style.cssText = 'position: fixed; top: 32px; left: 328px; right: 0; bottom: 0; z-index: 100; background-color: #1e1e1e;';
            document.body.appendChild(this.browserContainer);

            // Create browser instance
            this.browserInstance = new Browser(this.browserContainer);
            logger.info('appInit', '✓ Browser created');
        } else {
            logger.debug('appInit', 'Destroying browser...');

            // Destroy browser instance
            if (this.browserInstance) {
                this.browserInstance.destroy();
                this.browserInstance = null;
            }

            // Remove container
            if (this.browserContainer) {
                this.browserContainer.remove();
                this.browserContainer = null;
            }

            logger.info('appInit', '✓ Browser destroyed');
        }
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
     */
    async restoreWorkspaceLayout(workspace) {
        logger.debug('appInit', 'Restoring workspace layout for:', workspace.name);

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

        // Restore the saved layout
        await this.paneManager.deserializeLayout(workspace.paneLayout);

        logger.debug('appInit', 'Workspace layout restored');
    }

    /**
     * Setup icon sidebar buttons
     */
    setupIconSidebar() {
        const iconFiles = document.getElementById('icon-files');
        const iconGit = document.getElementById('icon-git');
        const iconBrowser = document.getElementById('icon-browser');

        if (iconFiles) {
            iconFiles.addEventListener('click', () => {
                logger.debug('appInit', 'Files icon clicked');

                // Set active state
                iconFiles.classList.add('active');
                if (iconGit) iconGit.classList.remove('active');
                if (iconBrowser) iconBrowser.classList.remove('active');

                // Close browser if open
                if (this.browserInstance) {
                    this.toggleBrowser();
                }

                // Hide Git panel if visible
                eventBus.emit('git:hide-panel');
            });
        }

        if (iconGit) {
            iconGit.addEventListener('click', () => {
                logger.debug('appInit', 'Git icon clicked');

                // Toggle active state
                if (iconFiles) iconFiles.classList.remove('active');
                iconGit.classList.add('active');
                if (iconBrowser) iconBrowser.classList.remove('active');

                // Close browser if open
                if (this.browserInstance) {
                    this.toggleBrowser();
                }

                // Toggle Git panel
                eventBus.emit('git:toggle-panel');
            });
        }

        if (iconBrowser) {
            iconBrowser.addEventListener('click', () => {
                logger.debug('appInit', 'Browser icon clicked');

                // Toggle active state
                if (iconFiles) iconFiles.classList.remove('active');
                if (iconGit) iconGit.classList.remove('active');
                iconBrowser.classList.add('active');

                // Toggle browser
                if (!this.browserInstance) {
                    this.toggleBrowser();
                }

                // Hide Git panel if visible
                eventBus.emit('git:hide-panel');
            });
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

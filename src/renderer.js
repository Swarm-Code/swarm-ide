/**
 * Main Renderer Entry Point
 *
 * Bootstraps the application by initializing all modules, components,
 * and wiring everything together through the EventBus.
 */

console.log('[Renderer] ========================================');
console.log('[Renderer] Starting to load renderer.js...');
console.log('[Renderer] ========================================');

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
const PaneManager = require('./services/PaneManager');
const workspaceManager = require('./services/WorkspaceManager');
const browserProfileManager = require('./services/BrowserProfileManager');

// Import utilities
const performanceMonitor = require('./utils/PerformanceMonitor');

// Make performance monitor globally available
window.performanceMonitor = performanceMonitor;
console.log('[Renderer] ✓ Performance monitoring enabled');

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
            console.log('[App] ========================================');
            console.log('[App] Initializing Swarm IDE...');
            console.log('[App] window.electronAPI:', window.electronAPI);

            // 1. Load configuration
            config.load();
            console.log('[App] ✓ Configuration loaded');

            // 2. Initialize FileSystemService with Electron API
            fileSystemService.initialize(window.electronAPI);
            console.log('[App] ✓ FileSystemService initialized');

            // 2.5. Initialize SQLiteService with Electron API
            sqliteService.initialize(window.electronAPI);
            console.log('[App] ✓ SQLiteService initialized');

            // 2.6. Initialize WorkspaceManager
            await this.workspaceManager.init();
            console.log('[App] ✓ WorkspaceManager initialized');

            // 2.7. Initialize BrowserProfileManager
            await this.browserProfileManager.init();
            console.log('[App] ✓ BrowserProfileManager initialized');

            // 3. Initialize UIManager
            uiManager.initialize();
            console.log('[App] ✓ UIManager initialized');

            // 4. Setup global event handlers
            this.setupGlobalHandlers();
            console.log('[App] ✓ Global handlers setup');

            // 5. Initialize UI components
            this.initializeComponents();
            console.log('[App] ✓ Components initialized');

            // 6. Apply theme
            const theme = config.get('theme', 'dark');
            uiManager.applyTheme(theme);
            console.log('[App] ✓ Theme applied:', theme);

            // 7. Setup open folder button
            this.setupFolderButton();
            console.log('[App] ✓ Folder button setup complete');

            // 8. Setup explorer toolbar buttons
            this.setupExplorerToolbar();
            console.log('[App] ✓ Explorer toolbar setup complete');

            // 9. Setup icon sidebar
            this.setupIconSidebar();
            console.log('[App] ✓ Icon sidebar setup complete');

            // 10. Check for initial folder from command line
            const initialFolder = await window.electronAPI.getInitialFolder();
            if (initialFolder) {
                console.log('[App] Opening initial folder from command line:', initialFolder);
                try {
                    const explorer = uiManager.getComponent('fileExplorer');
                    if (explorer) {
                        await explorer.openDirectory(initialFolder);
                    }
                } catch (error) {
                    console.error('[App] Error opening initial folder:', error);
                }
            }

            this.initialized = true;
            console.log('[App] ========================================');
            console.log('[App] ✓✓✓ Swarm IDE initialized successfully ✓✓✓');
            console.log('[App] ========================================');

            eventBus.emit('app:initialized');
        } catch (error) {
            console.error('[App] ❌ Initialization error:', error);
            console.error('[App] Stack trace:', error.stack);
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

        // Initialize PaneManager
        this.paneManager = new PaneManager(paneContainer);
        const rootPane = this.paneManager.init();
        console.log('[App] ✓ PaneManager initialized with root pane:', rootPane.id);

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

        console.log('[App] Created FileViewer content structure with instanceId:', instanceId);

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
                await this.openFileInPane(activePane.id, data.path, data.line);
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
            console.log('[App] Workspace activated:', data.workspaceId);
            await this.restoreWorkspaceLayout(data.workspace);
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
        console.log('[App] Setting up welcome screen show/hide logic');
        console.log('[App] welcomeContainer:', welcomeContainer);
        console.log('[App] appContainer:', appContainer);

        // Listen for folder open events
        eventBus.on('explorer:directory-opened', (data) => {
            console.log('[App] ===== RECEIVED explorer:directory-opened EVENT =====');
            console.log('[App] Event data:', data);
            console.log('[App] Hiding welcome screen and showing IDE');
            console.log('[App] welcomeContainer before:', welcomeContainer.style.display);
            console.log('[App] appContainer before:', appContainer.style.display);

            welcomeContainer.style.display = 'none';
            appContainer.style.display = 'block';

            console.log('[App] welcomeContainer after:', welcomeContainer.style.display);
            console.log('[App] appContainer after:', appContainer.style.display);
            console.log('[App] ===== FINISHED SHOWING IDE =====');
        });
    }

    /**
     * Setup folder selection button
     */
    setupFolderButton() {
        console.log('[App] Setting up folder button...');
        const folderButton = document.getElementById('select-folder');
        console.log('[App] Folder button element:', folderButton);

        if (folderButton) {
            console.log('[App] Folder button found, adding click listener');
            folderButton.addEventListener('click', async () => {
                console.log('[App] Folder button clicked!');
                try {
                    // Open folder selection dialog
                    console.log('[App] Calling fileSystemService.selectFolder()...');
                    const result = await fileSystemService.selectFolder();
                    console.log('[App] selectFolder result:', result);

                    if (!result.canceled && result.path) {
                        console.log('[App] Folder selected:', result.path);
                        const explorer = uiManager.getComponent('fileExplorer');
                        console.log('[App] FileExplorer component:', explorer);

                        if (explorer) {
                            console.log('[App] Opening directory:', result.path);
                            await explorer.openDirectory(result.path);
                            console.log('[App] Directory opened successfully');
                        } else {
                            console.error('[App] FileExplorer component not found!');
                        }
                    } else {
                        console.log('[App] Folder selection cancelled or no path returned');
                    }
                } catch (error) {
                    console.error('[App] Error in folder button click handler:', error);
                }
            });
        } else {
            console.error('[App] Folder button element not found!');
        }
    }

    /**
     * Setup explorer toolbar buttons
     */
    setupExplorerToolbar() {
        const explorer = uiManager.getComponent('fileExplorer');
        if (!explorer) {
            console.error('[App] FileExplorer component not found for toolbar setup!');
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
        console.log('[App] Toggle browser called');

        if (!this.browserInstance) {
            console.log('[App] Creating browser...');

            // Create container (positioned after sidebar: 48px icon + 280px sidebar = 328px)
            this.browserContainer = document.createElement('div');
            this.browserContainer.id = 'browser-panel';
            this.browserContainer.style.cssText = 'position: fixed; top: 32px; left: 328px; right: 0; bottom: 0; z-index: 100; background-color: #1e1e1e;';
            document.body.appendChild(this.browserContainer);

            // Create browser instance
            this.browserInstance = new Browser(this.browserContainer);
            console.log('[App] ✓ Browser created');
        } else {
            console.log('[App] Destroying browser...');

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

            console.log('[App] ✓ Browser destroyed');
        }
    }

    /**
     * Open a file in a specific pane
     */
    async openFileInPane(paneId, filePath, lineNumber = null) {
        console.log('[App] ========== OPENING FILE IN PANE ==========');
        console.log('[App] paneId:', paneId);
        console.log('[App] filePath:', filePath);
        console.log('[App] lineNumber:', lineNumber);

        const pane = this.paneManager.getPane(paneId);
        if (!pane) {
            console.error('[App] Pane not found:', paneId);
            return;
        }

        // Create file viewer content structure for this tab
        const fileViewerContent = this.createFileViewerContent();
        console.log('[App] FileViewer content structure created');
        console.log('[App] Container element:', fileViewerContent.container);
        console.log('[App] Container instanceId:', fileViewerContent.instanceId);
        console.log('[App] Viewer element:', fileViewerContent.viewer);

        // Create a new FileViewer instance for this tab
        console.log('[App] Creating new FileViewer instance for file:', filePath);
        const viewer = new FileViewer(fileViewerContent.viewer, fileViewerContent.header, fileSystemService, sqliteService);
        console.log('[App] FileViewer instance created:', viewer);

        // Store the viewer instance reference in the container for debugging
        fileViewerContent.container.dataset.filePath = filePath;
        fileViewerContent.container._fileViewerInstance = viewer;

        // Open the file
        console.log('[App] Opening file in FileViewer:', filePath);
        await viewer.openFile(filePath, lineNumber);
        console.log('[App] File opened successfully in FileViewer');

        // Get the filename for the title
        const pathUtils = require('./utils/PathUtils');
        const fileName = pathUtils.basename(filePath);

        console.log('[App] Adding tab to pane:', { paneId, filePath, fileName, container: fileViewerContent.container, lineNumber });

        // Add as a tab to the pane
        this.paneManager.addTab(paneId, filePath, fileName, fileViewerContent.container, 'file-viewer', lineNumber);

        console.log('[App] ✓ File opened in pane as tab successfully');
        console.log('[App] Container in DOM:', fileViewerContent.container.parentElement !== null);
        console.log('[App] Container display:', fileViewerContent.container.style.display);
        console.log('[App] ========================================');
    }

    /**
     * Save current workspace layout
     */
    saveWorkspaceLayout() {
        const activeWorkspace = this.workspaceManager.getActiveWorkspace();
        if (!activeWorkspace) return;

        const layout = this.paneManager.serializeLayout();
        this.workspaceManager.updatePaneLayout(activeWorkspace.id, layout);

        console.log('[App] Workspace layout saved');
    }

    /**
     * Restore workspace layout
     */
    async restoreWorkspaceLayout(workspace) {
        console.log('[App] Restoring workspace layout for:', workspace.name);

        if (!workspace.paneLayout) {
            console.log('[App] No layout to restore, creating fresh layout');
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

        console.log('[App] Workspace layout restored');
    }

    /**
     * Setup icon sidebar buttons
     */
    setupIconSidebar() {
        const iconFiles = document.getElementById('icon-files');
        const iconBrowser = document.getElementById('icon-browser');

        if (iconFiles) {
            iconFiles.addEventListener('click', () => {
                console.log('[App] Files icon clicked');

                // Set active state
                iconFiles.classList.add('active');
                if (iconBrowser) iconBrowser.classList.remove('active');

                // Close browser if open
                if (this.browserInstance) {
                    this.toggleBrowser();
                }
            });
        }

        if (iconBrowser) {
            iconBrowser.addEventListener('click', () => {
                console.log('[App] Browser icon clicked');

                // Toggle active state
                if (iconFiles) iconFiles.classList.remove('active');
                iconBrowser.classList.add('active');

                // Toggle browser
                if (!this.browserInstance) {
                    this.toggleBrowser();
                }
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

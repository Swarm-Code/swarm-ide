/**
 * Browser - Integrated web browser component with tabs and logging
 *
 * Provides full-featured browser with:
 * - Multiple tabs with Chromium rendering
 * - Navigation controls (back/forward/reload/home)
 * - Address bar with URL input
 * - Console and network logging
 * - Credential management (future)
 *
 * Usage:
 *   const browser = new Browser(containerElement);
 */

const eventBus = require('../modules/EventBus');
const logger = require('../utils/Logger');

class Browser {
    constructor(container, paneId, tabId) {
        this.container = container;
        this.paneId = paneId;
        this.tabId = tabId;
        this.tabs = [];
        this.activeTabId = null;
        this.currentUrl = 'https://google.com';
        this.canGoBack = false;
        this.canGoForward = false;
        this.resizeObserver = null;
        this.isVisible = true;
        this.overlayIsVisible = false; // Track if modal/settings is open

        this.init();
        this.setupTabVisibilityHandlers();
    }

    /**
     * Initialize the browser component
     */
    async init() {
        this.render();
        this.setupEventListeners();

        // Create initial tab
        await this.createTab(this.currentUrl);
    }

    /**
     * Render the browser UI
     */
    render() {
        this.container.innerHTML = `
            <div class="browser-container">
                <!-- Toolbar -->
                <div class="browser-toolbar">
                    <!-- Navigation buttons -->
                    <div class="browser-nav-buttons">
                        <button class="browser-btn browser-back" title="Back" disabled>
                            ←
                        </button>
                        <button class="browser-btn browser-forward" title="Forward" disabled>
                            →
                        </button>
                        <button class="browser-btn browser-reload" title="Reload">
                            ⟳
                        </button>
                        <button class="browser-btn browser-home" title="Home">
                            🏠
                        </button>
                    </div>

                    <!-- Address bar -->
                    <div class="browser-address-bar">
                        <span class="browser-security-indicator">🔒</span>
                        <input
                            type="text"
                            class="browser-url-input"
                            placeholder="Enter URL or search..."
                            value="${this.currentUrl}"
                        />
                    </div>

                    <!-- Action buttons -->
                    <div class="browser-action-buttons">
                        <button class="browser-btn browser-devtools" title="DevTools">
                            🔧
                        </button>
                        <button class="browser-btn browser-logs" title="Toggle Logs">
                            📋
                        </button>
                    </div>
                </div>

                <!-- Tab bar (future) -->
                <div class="browser-tab-bar" style="display: none;">
                    <!-- Tabs will be added here -->
                </div>

                <!-- Browser view container -->
                <div class="browser-view-container">
                    <div class="browser-loading">
                        Loading browser...
                    </div>
                </div>

                <!-- Logs panel (future) -->
                <div class="browser-logs-panel" style="display: none;">
                    <div class="browser-logs-header">
                        <span>Browser Logs</span>
                        <button class="browser-logs-close">✕</button>
                    </div>
                    <div class="browser-logs-content">
                        <!-- Logs will be added here -->
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Back button
        const backBtn = this.container.querySelector('.browser-back');
        backBtn.addEventListener('click', () => this.goBack());

        // Forward button
        const forwardBtn = this.container.querySelector('.browser-forward');
        forwardBtn.addEventListener('click', () => this.goForward());

        // Reload button
        const reloadBtn = this.container.querySelector('.browser-reload');
        reloadBtn.addEventListener('click', () => this.reload());

        // Home button
        const homeBtn = this.container.querySelector('.browser-home');
        homeBtn.addEventListener('click', () => this.navigateToUrl('https://google.com'));

        // URL input
        const urlInput = this.container.querySelector('.browser-url-input');
        urlInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                let url = urlInput.value.trim();

                // Add protocol if missing
                if (!url.startsWith('http://') && !url.startsWith('https://')) {
                    // Check if it looks like a URL
                    if (url.includes('.') && !url.includes(' ')) {
                        url = 'https://' + url;
                    } else {
                        // Treat as search query
                        url = 'https://www.google.com/search?q=' + encodeURIComponent(url);
                    }
                }

                this.navigateToUrl(url);
            }
        });

        // DevTools button
        const devtoolsBtn = this.container.querySelector('.browser-devtools');
        devtoolsBtn.addEventListener('click', () => this.toggleDevTools());

        // Logs button
        const logsBtn = this.container.querySelector('.browser-logs');
        logsBtn.addEventListener('click', () => this.toggleLogs());
    }

    /**
     * Create a new browser tab
     */
    async createTab(url = 'about:blank') {

        try {
            // Generate tab ID
            const tabId = 'tab-' + Date.now();

            // Create BrowserView via IPC
            const bounds = this.calculateBrowserBounds();
            const result = await window.electronAPI.browserCreateView(tabId, bounds);

            if (result.success) {
                // Store tab
                this.tabs.push({
                    id: tabId,
                    url: url,
                    title: 'New Tab',
                    active: true
                });

                this.activeTabId = tabId;

                // Navigate to URL
                if (url !== 'about:blank') {
                    await this.navigateToUrl(url);
                }

                // Hide loading indicator
                const loading = this.container.querySelector('.browser-loading');
                if (loading) loading.style.display = 'none';

                // Setup resize observer for pane changes
                this.setupResizeObserver();

                return tabId;
            } else {
                logger.error('browserNav', 'Failed to create view:', result.error);
                return null;
            }
        } catch (error) {
            logger.error('browserNav', 'Error creating tab:', error);
            return null;
        }
    }

    /**
     * Calculate browser view bounds
     */
    calculateBrowserBounds() {
        const container = this.container.querySelector('.browser-view-container');
        if (!container) {
            return { x: 0, y: 80, width: 800, height: 600 };
        }

        const rect = container.getBoundingClientRect();
        return {
            x: Math.round(rect.left),
            y: Math.round(rect.top),
            width: Math.round(rect.width),
            height: Math.round(rect.height)
        };
    }

    /**
     * Setup tab visibility handlers
     */
    setupTabVisibilityHandlers() {
        // Listen for tab switches in our pane
        eventBus.on('tab:switched', (data) => {
            logger.debug('browserNav', 'tab:switched event received:', {
                eventPaneId: data.paneId,
                eventTabId: data.tabId,
                browserPaneId: this.paneId,
                browserTabId: this.tabId,
                isOurPane: data.paneId === this.paneId
            });

            if (data.paneId !== this.paneId) {
                logger.debug('browserNav', 'Event for different pane, ignoring');
                return;
            }

            if (data.tabId === this.tabId) {
                // Our tab became active - show and update bounds
                logger.debug('browserNav', 'Browser tab became active, showing BrowserView');
                this.showBrowserView();
            } else {
                // Another tab became active - hide
                logger.debug('browserNav', 'Another tab became active, hiding BrowserView');
                this.hideBrowserView();
            }
        });

        // Listen for overlays (modals, settings) that should hide browser
        eventBus.on('overlay:shown', () => {
            this.overlayIsVisible = true;
            this.hideBrowserView();
        });

        eventBus.on('overlay:hidden', () => {
            this.overlayIsVisible = false;
            // Restore browser visibility if it was visible before overlay
            if (!this.isVisible) {
                this.showBrowserView();
            }
        });
    }

    /**
     * Show BrowserView and update bounds
     */
    async showBrowserView() {
        logger.debug('browserNav', 'showBrowserView() called:', {
            isVisible: this.isVisible,
            activeTabId: this.activeTabId,
            overlayIsVisible: this.overlayIsVisible
        });

        if (this.isVisible || !this.activeTabId || this.overlayIsVisible) {
            logger.debug('browserNav', 'Skipping show - already visible or blocked');
            return;
        }

        this.isVisible = true;
        const bounds = this.calculateBrowserBounds();

        logger.debug('browserNav', 'Showing BrowserView with bounds:', bounds);

        try {
            await window.electronAPI.browserUpdateBounds(this.activeTabId, bounds);
            logger.debug('browserNav', 'BrowserView shown successfully');
        } catch (error) {
            logger.error('browserNav', 'Error showing browser view:', error);
        }
    }

    /**
     * Hide BrowserView by moving it off-screen
     */
    async hideBrowserView() {
        logger.debug('browserNav', 'hideBrowserView() called:', {
            isVisible: this.isVisible,
            activeTabId: this.activeTabId
        });

        if (!this.isVisible || !this.activeTabId) {
            logger.debug('browserNav', 'Skipping hide - already hidden or no tab');
            return;
        }

        this.isVisible = false;

        logger.debug('browserNav', 'Hiding BrowserView by moving off-screen');

        try {
            // Move BrowserView off-screen (negative coordinates)
            await window.electronAPI.browserUpdateBounds(this.activeTabId, {
                x: -10000,
                y: -10000,
                width: 1,
                height: 1
            });
            logger.debug('browserNav', 'BrowserView hidden successfully');
        } catch (error) {
            logger.error('browserNav', 'Error hiding browser view:', error);
        }
    }

    /**
     * Setup resize observer for pane changes
     */
    setupResizeObserver() {
        const browserViewContainer = this.container.querySelector('.browser-view-container');
        if (!browserViewContainer) {
            return;
        }

        // Disconnect existing observer if any
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
        }

        // Create new ResizeObserver - NO DEBOUNCING for immediate updates
        this.resizeObserver = new ResizeObserver((entries) => {
            if (!this.activeTabId || !this.isVisible || this.overlayIsVisible) return;

            const bounds = this.calculateBrowserBounds();

            // Update BrowserView immediately
            window.electronAPI.browserUpdateBounds(this.activeTabId, bounds)
                .catch(error => {
                    logger.error('browserNav', 'Error updating bounds:', error);
                });
        });

        // Start observing
        this.resizeObserver.observe(browserViewContainer);
    }

    /**
     * Navigate to URL
     */
    async navigateToUrl(url) {
        if (!this.activeTabId) {
            logger.error('browserNav', 'No active tab');
            return;
        }

        try {
            const result = await window.electronAPI.browserNavigate(this.activeTabId, url);

            if (result.success) {
                this.currentUrl = url;

                // Update address bar
                const urlInput = this.container.querySelector('.browser-url-input');
                if (urlInput) urlInput.value = url;
            } else {
                logger.error('browserNav', 'Navigation failed:', result.error);
            }
        } catch (error) {
            logger.error('browserNav', 'Navigation error:', error);
        }
    }

    /**
     * Go back in history
     */
    async goBack() {
        if (!this.activeTabId) return;

        try {
            await window.electronAPI.browserGoBack(this.activeTabId);
        } catch (error) {
            logger.error('browserNav', 'Go back error:', error);
        }
    }

    /**
     * Go forward in history
     */
    async goForward() {
        if (!this.activeTabId) return;

        try {
            await window.electronAPI.browserGoForward(this.activeTabId);
        } catch (error) {
            logger.error('browserNav', 'Go forward error:', error);
        }
    }

    /**
     * Reload current page
     */
    async reload() {
        if (!this.activeTabId) return;

        try {
            await window.electronAPI.browserReload(this.activeTabId);
        } catch (error) {
            logger.error('browserNav', 'Reload error:', error);
        }
    }

    /**
     * Toggle DevTools
     */
    async toggleDevTools() {
        if (!this.activeTabId) return;

        try {
            await window.electronAPI.browserToggleDevTools(this.activeTabId);
        } catch (error) {
            logger.error('browserNav', 'Toggle DevTools error:', error);
        }
    }

    /**
     * Toggle logs panel
     */
    toggleLogs() {

        const panel = this.container.querySelector('.browser-logs-panel');
        if (panel) {
            const isVisible = panel.style.display !== 'none';
            panel.style.display = isVisible ? 'none' : 'block';
        }
    }

    /**
     * Update navigation buttons state
     */
    updateNavigationState(canGoBack, canGoForward) {
        this.canGoBack = canGoBack;
        this.canGoForward = canGoForward;

        const backBtn = this.container.querySelector('.browser-back');
        const forwardBtn = this.container.querySelector('.browser-forward');

        if (backBtn) backBtn.disabled = !canGoBack;
        if (forwardBtn) forwardBtn.disabled = !canGoForward;
    }

    /**
     * Update URL in address bar
     */
    updateUrl(url) {
        this.currentUrl = url;
        const urlInput = this.container.querySelector('.browser-url-input');
        if (urlInput) urlInput.value = url;
    }

    /**
     * Destroy the browser - complete cleanup
     */
    async destroy() {
        logger.debug('browserNav', 'Destroying browser instance');

        // Disconnect resize observer
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
            this.resizeObserver = null;
        }

        // Destroy all BrowserView tabs
        for (const tab of this.tabs) {
            try {
                logger.debug('browserNav', 'Destroying BrowserView:', tab.id);
                await window.electronAPI.browserDestroyView(tab.id);
            } catch (error) {
                logger.error('browserNav', 'Error destroying tab:', error);
            }
        }

        // Clear all state
        this.tabs = [];
        this.activeTabId = null;
        this.isVisible = false;
        this.container.innerHTML = '';

        logger.debug('browserNav', 'Browser instance destroyed');
    }
}

module.exports = Browser;

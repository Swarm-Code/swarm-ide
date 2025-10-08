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

class Browser {
    constructor(container) {
        this.container = container;
        this.tabs = [];
        this.activeTabId = null;
        this.currentUrl = 'https://google.com';
        this.canGoBack = false;
        this.canGoForward = false;

        this.init();
    }

    /**
     * Initialize the browser component
     */
    async init() {
        console.log('[Browser] Initializing browser component');
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

        console.log('[Browser] UI rendered');
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

        console.log('[Browser] Event listeners attached');
    }

    /**
     * Create a new browser tab
     */
    async createTab(url = 'about:blank') {
        console.log('[Browser] Creating new tab with URL:', url);

        try {
            // Generate tab ID
            const tabId = 'tab-' + Date.now();

            // Create BrowserView via IPC
            const bounds = this.calculateBrowserBounds();
            const result = await window.electronAPI.browserCreateView(tabId, bounds);

            if (result.success) {
                console.log('[Browser] BrowserView created:', tabId);

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

                return tabId;
            } else {
                console.error('[Browser] Failed to create view:', result.error);
                return null;
            }
        } catch (error) {
            console.error('[Browser] Error creating tab:', error);
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
     * Navigate to URL
     */
    async navigateToUrl(url) {
        console.log('[Browser] Navigating to:', url);

        if (!this.activeTabId) {
            console.error('[Browser] No active tab');
            return;
        }

        try {
            const result = await window.electronAPI.browserNavigate(this.activeTabId, url);

            if (result.success) {
                this.currentUrl = url;

                // Update address bar
                const urlInput = this.container.querySelector('.browser-url-input');
                if (urlInput) urlInput.value = url;

                console.log('[Browser] Navigation successful');
            } else {
                console.error('[Browser] Navigation failed:', result.error);
            }
        } catch (error) {
            console.error('[Browser] Navigation error:', error);
        }
    }

    /**
     * Go back in history
     */
    async goBack() {
        console.log('[Browser] Going back');

        if (!this.activeTabId) return;

        try {
            await window.electronAPI.browserGoBack(this.activeTabId);
        } catch (error) {
            console.error('[Browser] Go back error:', error);
        }
    }

    /**
     * Go forward in history
     */
    async goForward() {
        console.log('[Browser] Going forward');

        if (!this.activeTabId) return;

        try {
            await window.electronAPI.browserGoForward(this.activeTabId);
        } catch (error) {
            console.error('[Browser] Go forward error:', error);
        }
    }

    /**
     * Reload current page
     */
    async reload() {
        console.log('[Browser] Reloading page');

        if (!this.activeTabId) return;

        try {
            await window.electronAPI.browserReload(this.activeTabId);
        } catch (error) {
            console.error('[Browser] Reload error:', error);
        }
    }

    /**
     * Toggle DevTools
     */
    async toggleDevTools() {
        console.log('[Browser] Toggling DevTools');

        if (!this.activeTabId) return;

        try {
            await window.electronAPI.browserToggleDevTools(this.activeTabId);
        } catch (error) {
            console.error('[Browser] Toggle DevTools error:', error);
        }
    }

    /**
     * Toggle logs panel
     */
    toggleLogs() {
        console.log('[Browser] Toggling logs panel');

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
     * Destroy the browser
     */
    async destroy() {
        console.log('[Browser] Destroying browser');

        // Destroy all tabs
        for (const tab of this.tabs) {
            try {
                await window.electronAPI.browserDestroyView(tab.id);
            } catch (error) {
                console.error('[Browser] Error destroying tab:', error);
            }
        }

        this.tabs = [];
        this.activeTabId = null;
        this.container.innerHTML = '';
    }
}

module.exports = Browser;

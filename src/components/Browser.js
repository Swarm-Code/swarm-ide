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
const browserProfileManager = require('../services/BrowserProfileManager');

class Browser {
    constructor(container, paneId, tabId, profileId = null) {
        this.container = container;
        this.paneId = paneId;
        this.tabId = tabId;
        this.profileId = profileId; // Browser profile for cookie isolation
        this.tabs = [];
        this.activeTabId = null;
        this.currentUrl = 'https://google.com';
        this.canGoBack = false;
        this.canGoForward = false;
        this.resizeObserver = null;
        this.isVisible = false; // CRITICAL FIX: Start as false, will be set to true when createTab completes
        this.overlayIsVisible = false; // Track if modal/settings is open
        this.lastKnownBounds = null; // CRITICAL FIX #6: Cache for bounds when tab is hidden

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

                    <!-- Profile selector -->
                    <div class="browser-profile-selector">
                        <button class="browser-profile-btn" title="Switch Browser Profile">
                            <span class="browser-profile-avatar">👤</span>
                            <span class="browser-profile-name">Profile</span>
                            <span class="browser-profile-dropdown-icon">▼</span>
                        </button>
                        <div class="browser-profile-dropdown" style="display: none;">
                            <div class="browser-profile-dropdown-header">
                                <span>Browser Profiles</span>
                            </div>
                            <div class="browser-profile-list">
                                <!-- Profiles will be populated here -->
                            </div>
                            <div class="browser-profile-dropdown-footer">
                                <button class="browser-profile-manage-btn">
                                    ⚙️ Manage Profiles
                                </button>
                            </div>
                        </div>
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

        // Profile selector button
        const profileBtn = this.container.querySelector('.browser-profile-btn');
        profileBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleProfileDropdown();
        });

        // Profile manage button
        const manageBtn = this.container.querySelector('.browser-profile-manage-btn');
        manageBtn.addEventListener('click', () => {
            this.openProfileManager();
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            const dropdown = this.container.querySelector('.browser-profile-dropdown');
            if (dropdown && dropdown.style.display === 'block') {
                if (!e.target.closest('.browser-profile-selector')) {
                    dropdown.style.display = 'none';
                }
            }
        });

        // Initialize profile display
        this.updateProfileDisplay();
        this.populateProfileDropdown();
    }

    /**
     * Create a new browser tab
     */
    async createTab(url = 'about:blank') {

        try {
            // Generate tab ID
            const tabId = 'tab-' + Date.now();

            // Create BrowserView via IPC with profile isolation
            const bounds = this.calculateBrowserBounds();
            const result = await window.electronAPI.browserCreateView(tabId, bounds, this.profileId);

            if (result.success) {
                // Store tab
                this.tabs.push({
                    id: tabId,
                    url: url,
                    title: 'New Tab',
                    active: true
                });

                this.activeTabId = tabId;

                // CRITICAL FIX: Mark browser as visible now that the tab is created
                this.isVisible = true;

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
        // CRITICAL FIX: Use the PANE CONTENT CONTAINER, not browser-view-container
        // This ensures browser renders at the exact same level as text editors
        const paneContent = this.container.closest('.pane-content');

        if (!paneContent) {
            logger.error('browserNav', 'Could not find pane-content container!');
            return this.lastKnownBounds || { x: 0, y: 80, width: 800, height: 600 };
        }

        // CRITICAL FIX #6: Check if pane content is hidden (display: none)
        // When tabs are switched, hidden tabs have display: none and getBoundingClientRect returns zeros
        const isHidden = paneContent.style.display === 'none' ||
                         paneContent.offsetParent === null ||
                         paneContent.clientWidth === 0 ||
                         paneContent.clientHeight === 0;

        if (isHidden) {
            logger.warn('browserNav', 'Pane content is hidden, using cached bounds or defaults', {
                paneId: this.paneId,
                tabId: this.tabId,
                display: paneContent.style.display,
                offsetParent: paneContent.offsetParent,
                clientWidth: paneContent.clientWidth,
                clientHeight: paneContent.clientHeight
            });
            // Return cached bounds if we have them, otherwise return sensible defaults
            return this.lastKnownBounds || { x: 0, y: 80, width: 800, height: 600 };
        }

        const rect = paneContent.getBoundingClientRect();
        let availableHeight = Math.round(rect.height);

        // CRITICAL FIX: Always check for visible terminal panel and status bar
        // Don't rely on events - directly query the DOM
        let bottomReservedSpace = 0;

        // Check for terminal panel
        const terminalPanel = document.querySelector('.terminal-panel');
        if (terminalPanel && terminalPanel.style.display !== 'none') {
            const terminalHeight = parseInt(terminalPanel.style.height, 10) || 320;
            bottomReservedSpace += terminalHeight;
            logger.debug('browserNav', '⚠️ TERMINAL PANEL DETECTED:', terminalHeight);
        }

        // Check for status bar (always present)
        const statusBar = document.querySelector('.status-bar');
        if (statusBar) {
            const statusBarRect = statusBar.getBoundingClientRect();
            const statusBarHeight = Math.round(statusBarRect.height);
            bottomReservedSpace += statusBarHeight;
            logger.debug('browserNav', '⚠️ STATUS BAR DETECTED:', statusBarHeight);
        }

        const debugData = {
            usingPaneContent: true,
            containerHeight: Math.round(rect.height),
            containerTop: Math.round(rect.top),
            containerBottom: Math.round(rect.top + rect.height),
            bottomReservedSpace: bottomReservedSpace,
            windowHeight: window.innerHeight
        };
        logger.debug('browserNav', '📐 calculateBrowserBounds() - Using PANE CONTENT:', JSON.stringify(debugData));

        // CRITICAL FIX: Subtract reserved bottom space (terminal + status bar)
        // Calculate where the reserved area starts from the top
        if (bottomReservedSpace > 0) {
            const reservedAreaTop = window.innerHeight - bottomReservedSpace;
            const containerBottom = rect.top + rect.height;

            logger.debug('browserNav', '🔍 Bottom overlap check:', JSON.stringify({
                reservedAreaTop,
                containerBottom,
                bottomReservedSpace,
                willOverlap: containerBottom > reservedAreaTop
            }));

            // If container extends into reserved area, trim the height
            if (containerBottom > reservedAreaTop) {
                availableHeight = Math.round(reservedAreaTop - rect.top);
                logger.debug('browserNav', '✂️ Trimming browser height to avoid overlap:', JSON.stringify({
                    originalHeight: Math.round(rect.height),
                    trimmedHeight: availableHeight,
                    reservedAreaTop,
                    containerBottom,
                    bottomReservedSpace
                }));
            }
        }

        const finalBounds = {
            x: Math.round(rect.left),
            y: Math.round(rect.top),
            width: Math.round(rect.width),
            height: Math.max(0, availableHeight) // Ensure non-negative height
        };

        // CRITICAL FIX #6: Cache valid bounds for use when container is hidden
        this.lastKnownBounds = finalBounds;

        logger.debug('browserNav', '📦 Final bounds (cached):', finalBounds);

        return finalBounds;
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
            logger.debug('browserNav', 'Overlay shown, hiding BrowserView');
            this.overlayIsVisible = true;
            this.hideBrowserView();
        });

        eventBus.on('overlay:hidden', () => {
            logger.debug('browserNav', 'Overlay hidden, potentially restoring BrowserView');
            this.overlayIsVisible = false;
            // Restore browser visibility if it was visible before overlay
            if (!this.isVisible) {
                this.showBrowserView();
            }
        });

        // CRITICAL FIX: Listen for panel:shown/hidden events (git, ssh, etc.)
        // BrowserViews render ABOVE HTML, so they must be hidden when panels open
        eventBus.on('panel:shown', (data) => {
            logger.info('browserNav', `Panel shown: ${data.panel}, hiding BrowserView to prevent overlap`);
            this.overlayIsVisible = true; // Treat panels like overlays
            this.hideBrowserView();
        });

        eventBus.on('panel:hidden', (data) => {
            logger.info('browserNav', `Panel hidden: ${data.panel}, restoring BrowserView if appropriate`);
            this.overlayIsVisible = false;
            // Only restore if this is our active tab
            if (this.isVisible) {
                logger.debug('browserNav', 'Browser tab is active, restoring BrowserView');
                this.showBrowserView();
            } else {
                logger.debug('browserNav', 'Browser tab is not active, keeping BrowserView hidden');
            }
        });

        // CRITICAL FIX: Listen for terminal panel shown/hidden/resized to adjust browser bounds
        // BrowserView is a native Electron overlay that doesn't respect CSS z-index
        // Terminal panel emits 'terminal-panel:shown' on show AND during resize
        eventBus.on('terminal-panel:shown', (data) => {
            logger.debug('browserNav', '📏 Terminal panel shown/resized, adjusting browser bounds. Height:', data?.height);

            // Update bounds if browser is visible (directly queries DOM, so no need to store height)
            if (this.isVisible && this.activeTabId) {
                const bounds = this.calculateBrowserBounds();
                logger.debug('browserNav', '🔄 Updating browser bounds for terminal resize:', JSON.stringify(bounds));
                window.electronAPI.browserUpdateBounds(this.activeTabId, bounds)
                    .catch(error => {
                        logger.error('browserNav', 'Error updating bounds for terminal:', error);
                    });
            }
        });

        eventBus.on('terminal-panel:hidden', () => {
            logger.debug('browserNav', '📏 Terminal panel hidden, restoring browser bounds');

            // Update bounds if browser is visible (directly queries DOM, will detect absence)
            if (this.isVisible && this.activeTabId) {
                const bounds = this.calculateBrowserBounds();
                logger.debug('browserNav', '🔄 Updating browser bounds after terminal hide:', JSON.stringify(bounds));
                window.electronAPI.browserUpdateBounds(this.activeTabId, bounds)
                    .catch(error => {
                        logger.error('browserNav', 'Error restoring bounds after terminal:', error);
                    });
            }
        });
    }

    /**
     * Show BrowserView and update bounds
     */
    async showBrowserView() {
        logger.debug('browserNav', '🔴 showBrowserView() called:', {
            isVisible: this.isVisible,
            activeTabId: this.activeTabId,
            overlayIsVisible: this.overlayIsVisible
        });

        if (this.isVisible || !this.activeTabId || this.overlayIsVisible) {
            logger.debug('browserNav', 'Skipping show - already visible or blocked');
            return;
        }

        this.isVisible = true;

        // Calculate bounds (will directly query DOM for terminal/status bar)
        const bounds = this.calculateBrowserBounds();

        logger.debug('browserNav', '🔴 Showing BrowserView with bounds:', bounds);

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
     * CRITICAL FIX: Observe pane-content, not browser-view-container
     * When terminal resizes, pane-content changes size, triggering browser update
     */
    setupResizeObserver() {
        // Watch the pane-content element (changes size when terminal/panes resize)
        const paneContent = this.container.closest('.pane-content');
        if (!paneContent) {
            logger.error('browserNav', 'Could not find pane-content for ResizeObserver');
            return;
        }

        // Disconnect existing observer if any
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
        }

        // Create new ResizeObserver - NO DEBOUNCING for immediate updates
        this.resizeObserver = new ResizeObserver((entries) => {
            if (!this.activeTabId || !this.isVisible || this.overlayIsVisible) return;

            logger.debug('browserNav', '📐 ResizeObserver triggered - pane-content size changed');

            const bounds = this.calculateBrowserBounds();

            // Update BrowserView immediately
            window.electronAPI.browserUpdateBounds(this.activeTabId, bounds)
                .catch(error => {
                    logger.error('browserNav', 'Error updating bounds:', error);
                });
        });

        // Start observing the pane-content element
        logger.debug('browserNav', '👁️ Starting ResizeObserver on pane-content');
        this.resizeObserver.observe(paneContent);
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
     * Update pane and tab context after tab move
     * CRITICAL: Called when tab is moved to a different pane
     */
    async updatePaneContext(newPaneId, newTabId) {
        logger.debug('browserNav', 'Updating pane context:', {
            oldPaneId: this.paneId,
            newPaneId: newPaneId,
            oldTabId: this.tabId,
            newTabId: newTabId
        });

        this.paneId = newPaneId;
        this.tabId = newTabId;

        // Force bounds update to ensure browser renders in new location
        if (this.activeTabId && this.isVisible) {
            const bounds = this.calculateBrowserBounds();
            logger.debug('browserNav', 'Updating bounds after pane move:', bounds);

            try {
                await window.electronAPI.browserUpdateBounds(this.activeTabId, bounds);
                logger.debug('browserNav', 'Bounds updated successfully after pane move');
            } catch (error) {
                logger.error('browserNav', 'Error updating bounds after pane move:', error);
            }
        }
    }

    /**
     * Toggle profile dropdown visibility
     */
    toggleProfileDropdown() {
        const dropdown = this.container.querySelector('.browser-profile-dropdown');
        if (dropdown) {
            const isVisible = dropdown.style.display === 'block';
            dropdown.style.display = isVisible ? 'none' : 'block';

            if (!isVisible) {
                // Refresh profile list when opening
                this.populateProfileDropdown();
            }
        }
    }

    /**
     * Update profile display with current profile info
     */
    updateProfileDisplay() {
        const profileNameSpan = this.container.querySelector('.browser-profile-name');
        const profileAvatarSpan = this.container.querySelector('.browser-profile-avatar');

        if (profileNameSpan && profileAvatarSpan) {
            const profile = this.profileId ? browserProfileManager.getProfile(this.profileId) : browserProfileManager.getActiveProfile();

            if (profile) {
                profileNameSpan.textContent = profile.name;
                profileAvatarSpan.textContent = profile.avatar || '👤';
            } else {
                profileNameSpan.textContent = 'Default';
                profileAvatarSpan.textContent = '👤';
            }
        }
    }

    /**
     * Populate profile dropdown with available profiles
     */
    populateProfileDropdown() {
        const profileList = this.container.querySelector('.browser-profile-list');
        if (!profileList) return;

        // Get all profiles
        const profiles = browserProfileManager.getAllProfiles();
        const activeProfileId = this.profileId || browserProfileManager.getActiveProfile()?.id;

        // Clear existing list
        profileList.innerHTML = '';

        // Add profile items
        profiles.forEach(profile => {
            const profileItem = document.createElement('div');
            profileItem.className = 'browser-profile-item';
            if (profile.id === activeProfileId) {
                profileItem.classList.add('active');
            }

            profileItem.innerHTML = `
                <span class="browser-profile-item-avatar">${profile.avatar || '👤'}</span>
                <div class="browser-profile-item-info">
                    <div class="browser-profile-item-name">${profile.name}</div>
                    <div class="browser-profile-item-desc">${profile.description || 'No description'}</div>
                </div>
                ${profile.id === activeProfileId ? '<span class="browser-profile-item-check">✓</span>' : ''}
            `;

            profileItem.addEventListener('click', () => {
                this.switchProfile(profile.id);
            });

            profileList.appendChild(profileItem);
        });
    }

    /**
     * Switch to a different browser profile
     */
    async switchProfile(profileId) {
        logger.debug('browserNav', 'Switching to profile:', profileId);

        // Close dropdown
        const dropdown = this.container.querySelector('.browser-profile-dropdown');
        if (dropdown) {
            dropdown.style.display = 'none';
        }

        // Update profileId
        this.profileId = profileId;

        // Set as active profile
        browserProfileManager.setActiveProfile(profileId);

        // Update display
        this.updateProfileDisplay();

        // Close all existing tabs (they use old profile)
        for (const tab of [...this.tabs]) {
            await this.closeTab(tab.id);
        }

        // Create new tab with new profile
        await this.createTab('https://google.com');

        logger.debug('browserNav', '✓ Switched to profile:', profileId);

        eventBus.emit('notification:show', {
            type: 'info',
            message: `Switched to profile: ${browserProfileManager.getProfile(profileId)?.name}`
        });
    }

    /**
     * Open profile manager modal
     */
    openProfileManager() {
        logger.debug('browserNav', 'Opening profile manager (not yet implemented)');

        // Close dropdown
        const dropdown = this.container.querySelector('.browser-profile-dropdown');
        if (dropdown) {
            dropdown.style.display = 'none';
        }

        // TODO: Implement ProfileManagerModal
        eventBus.emit('notification:show', {
            type: 'info',
            message: 'Profile manager coming soon!'
        });
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

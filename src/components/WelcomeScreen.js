/**
 * WelcomeScreen - Initial screen shown when no folder is open
 *
 * Displays:
 * - Welcome message and branding
 * - Recent folders/projects
 * - Quick action buttons
 *
 * Usage:
 *   const welcome = new WelcomeScreen(container, config, eventBus);
 */

const eventBus = require('../modules/EventBus');
const pathUtils = require('../utils/PathUtils');
const logger = require('../utils/Logger');

class WelcomeScreen {
    constructor(container, config, fileSystemService) {
        this.container = container;
        this.config = config;
        this.fs = fileSystemService;

        this.render();
        this.setupEventListeners();
    }

    /**
     * Render the welcome screen
     */
    render() {
        const recentFolders = this.config.get('recentFolders', []);

        this.container.innerHTML = `
            <div class="welcome-screen">
                <div class="welcome-content">
                    <div class="welcome-header">
                        <h1 class="welcome-title">SWARM IDE</h1>
                        <p class="welcome-subtitle">A modular, extensible code editor</p>
                    </div>

                    <div class="welcome-main">
                        <!-- Quick Actions Grid -->
                        <div class="welcome-actions-grid">
                            <div class="action-group local-group">
                                <h3 class="action-group-title">Local</h3>
                                <button class="action-card" id="welcome-open-folder">
                                    <span class="action-icon">📁</span>
                                    <span class="action-title">Open Folder</span>
                                    <kbd class="action-shortcut">Ctrl+O</kbd>
                                </button>
                            </div>

                            <div class="action-group remote-group">
                                <h3 class="action-group-title">Remote</h3>
                                <button class="action-card" id="welcome-ssh-connect">
                                    <span class="action-icon">🔗</span>
                                    <span class="action-title">Quick Connect</span>
                                    <kbd class="action-shortcut">SSH</kbd>
                                </button>
                                <button class="action-card" id="welcome-ssh-panel">
                                    <span class="action-icon">⚡</span>
                                    <span class="action-title">SSH Manager</span>
                                    <kbd class="action-shortcut">Ctrl+Shift+S</kbd>
                                </button>
                            </div>
                        </div>

                        ${recentFolders.length > 0 ? `
                            <!-- Recent Projects -->
                            <div class="welcome-recent">
                                <h3 class="recent-title">Recent Projects</h3>
                                <div class="recent-grid">
                                    ${recentFolders.slice(0, 6).map(folder => `
                                        <button class="recent-card" data-path="${this.escapeHtml(folder)}">
                                            <span class="recent-icon">📂</span>
                                            <div class="recent-info">
                                                <div class="recent-name">${this.escapeHtml(this.getFolderName(folder))}</div>
                                                <div class="recent-path">${this.escapeHtml(this.getShortPath(folder))}</div>
                                            </div>
                                        </button>
                                    `).join('')}
                                </div>
                            </div>
                        ` : `
                            <div class="welcome-empty">
                                <div class="empty-icon">🚀</div>
                                <p class="empty-text">Start by opening a folder or connecting to an SSH server</p>
                            </div>
                        `}
                    </div>
                </div>
            </div>
        `;

        this.addCompactStyles();
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Open folder button
        const openFolderBtn = this.container.querySelector('#welcome-open-folder');
        if (openFolderBtn) {
            logger.debug('appInit', 'Open folder button found, adding click listener');
            openFolderBtn.addEventListener('click', async () => {
                logger.debug('appInit', 'Open folder button clicked!');
                const result = await this.fs.selectFolder();
                logger.debug('appInit', 'selectFolder result:', result);
                if (!result.canceled && result.path) {
                    logger.debug('appInit', 'Emitting explorer:open-folder with path:', result.path);
                    eventBus.emit('explorer:open-folder', { path: result.path });
                } else {
                    logger.debug('appInit', 'Folder selection cancelled or no path');
                }
            });
        } else {
            logger.error('appInit', 'Open folder button NOT found!');
        }

        // SSH Connect button
        const sshConnectBtn = this.container.querySelector('#welcome-ssh-connect');
        if (sshConnectBtn) {
            logger.debug('appInit', 'SSH Connect button found, adding click listener');
            sshConnectBtn.addEventListener('click', () => {
                logger.debug('appInit', 'SSH Connect button clicked!');
                eventBus.emit('ssh:quick-connect');
            });
        } else {
            logger.error('appInit', 'SSH Connect button NOT found!');
        }

        // SSH Panel button
        const sshPanelBtn = this.container.querySelector('#welcome-ssh-panel');
        if (sshPanelBtn) {
            logger.debug('appInit', 'SSH Panel button found, adding click listener');
            sshPanelBtn.addEventListener('click', () => {
                logger.debug('appInit', 'SSH Panel button clicked!');
                eventBus.emit('ssh:toggle-panel');
            });
        } else {
            logger.error('appInit', 'SSH Panel button NOT found!');
        }

        // Recent folder items
        const recentItems = this.container.querySelectorAll('.welcome-recent-item');
        recentItems.forEach(item => {
            item.addEventListener('click', () => {
                const path = item.dataset.path;
                eventBus.emit('explorer:open-folder', { path });
            });
        });
    }

    /**
     * Get folder name from path
     * @param {string} folderPath - Full folder path
     * @returns {string} Folder name
     */
    getFolderName(folderPath) {
        return pathUtils.basename(folderPath) || folderPath;
    }

    /**
     * Escape HTML
     * @param {string} text - Text to escape
     * @returns {string} Escaped text
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Hide the welcome screen
     */
    hide() {
        if (this.container) {
            this.container.style.display = 'none';
        }
    }

    /**
     * Show the welcome screen
     */
    show() {
        if (this.container) {
            this.container.style.display = 'block';
            // Re-render to update recent folders
            this.render();
            this.setupEventListeners();
        }
    }

    /**
     * Cleanup
     */
    destroy() {
        this.container.innerHTML = '';
    }
}

module.exports = WelcomeScreen;

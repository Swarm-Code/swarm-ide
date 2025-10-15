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

                    <div class="welcome-section">
                        <h2 class="welcome-section-title">Start</h2>
                        <div class="welcome-actions">
                            <button class="welcome-action-btn" id="welcome-open-folder">
                                <span class="welcome-action-icon">📁</span>
                                <div class="welcome-action-content">
                                    <div class="welcome-action-title">Open Folder</div>
                                    <div class="welcome-action-desc">Open a folder to start browsing files</div>
                                </div>
                            </button>
                            <button class="welcome-action-btn" id="welcome-ssh-connect">
                                <span class="welcome-action-icon">🔗</span>
                                <div class="welcome-action-content">
                                    <div class="welcome-action-title">SSH Connect</div>
                                    <div class="welcome-action-desc">Connect to a remote server via SSH</div>
                                </div>
                            </button>
                            <button class="welcome-action-btn" id="welcome-ssh-panel">
                                <span class="welcome-action-icon">⚡</span>
                                <div class="welcome-action-content">
                                    <div class="welcome-action-title">SSH Manager</div>
                                    <div class="welcome-action-desc">Manage your SSH connections</div>
                                </div>
                            </button>
                        </div>
                    </div>

                    ${recentFolders.length > 0 ? `
                        <div class="welcome-section">
                            <h2 class="welcome-section-title">Recent</h2>
                            <div class="welcome-recent-list">
                                ${recentFolders.slice(0, 8).map(folder => `
                                    <div class="welcome-recent-item" data-path="${this.escapeHtml(folder)}">
                                        <span class="welcome-recent-icon">📂</span>
                                        <div class="welcome-recent-content">
                                            <div class="welcome-recent-name">${this.escapeHtml(this.getFolderName(folder))}</div>
                                            <div class="welcome-recent-path">${this.escapeHtml(folder)}</div>
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    ` : ''}

                    <div class="welcome-footer">
                        <div class="welcome-help">
                            <p>Press <kbd>Ctrl+O</kbd> to open a folder • <kbd>Ctrl+Shift+S</kbd> for SSH connections</p>
                        </div>
                    </div>
                </div>
            </div>
        `;
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
            logger.info('appInit', 'SSH Panel button found, adding click listener');
            sshPanelBtn.addEventListener('click', () => {
                logger.info('appInit', '🔗 SSH PANEL BUTTON CLICKED!');
                logger.info('appInit', 'Emitting ssh:toggle-panel event...');
                eventBus.emit('ssh:toggle-panel');
                logger.info('appInit', 'ssh:toggle-panel event emitted successfully');
            });
        } else {
            logger.error('appInit', 'SSH Panel button NOT found!');
            logger.error('appInit', 'Available buttons in container:');
            const allButtons = this.container.querySelectorAll('button');
            allButtons.forEach((btn, index) => {
                logger.error('appInit', `Button ${index}:`, btn.id, btn.className, btn.textContent.substring(0, 50));
            });
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

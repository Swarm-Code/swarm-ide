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
        const recentItems = this.container.querySelectorAll('.recent-card');
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
     * Get shortened path for display
     * @param {string} folderPath - Full folder path
     * @returns {string} Shortened path
     */
    getShortPath(folderPath) {
        const parts = folderPath.split('/');
        if (parts.length > 3) {
            return `.../${parts.slice(-2).join('/')}`;
        }
        return folderPath;
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
     * Add compact gestalt-based styles
     */
    addCompactStyles() {
        if (document.getElementById('welcome-compact-styles')) {
            return; // Styles already added
        }

        const style = document.createElement('style');
        style.id = 'welcome-compact-styles';
        style.textContent = `
            .welcome-screen {
                display: flex;
                align-items: center;
                justify-content: center;
                height: 100vh;
                background: linear-gradient(135deg, #1e1e1e 0%, #2d2d30 100%);
                color: #cccccc;
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            }

            .welcome-content {
                max-width: 800px;
                width: 90%;
                text-align: center;
            }

            .welcome-header {
                margin-bottom: 40px;
            }

            .welcome-title {
                font-size: 3rem;
                font-weight: 300;
                margin: 0 0 8px 0;
                background: linear-gradient(45deg, #007acc, #00d4ff);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                background-clip: text;
            }

            .welcome-subtitle {
                font-size: 1.1rem;
                color: #969696;
                margin: 0;
                font-weight: 300;
            }

            .welcome-main {
                display: flex;
                flex-direction: column;
                gap: 32px;
            }

            /* Actions Grid - Gestalt Proximity & Similarity */
            .welcome-actions-grid {
                display: grid;
                grid-template-columns: 1fr 2fr;
                gap: 24px;
                margin-bottom: 16px;
            }

            .action-group {
                background: rgba(255, 255, 255, 0.05);
                border-radius: 12px;
                padding: 20px;
                border: 1px solid rgba(255, 255, 255, 0.1);
                backdrop-filter: blur(10px);
            }

            .action-group-title {
                font-size: 0.9rem;
                font-weight: 600;
                color: #00d4ff;
                margin: 0 0 16px 0;
                text-transform: uppercase;
                letter-spacing: 1px;
                text-align: left;
            }

            .action-card {
                display: flex;
                align-items: center;
                justify-content: space-between;
                width: 100%;
                padding: 12px 16px;
                background: rgba(255, 255, 255, 0.08);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 8px;
                color: #cccccc;
                cursor: pointer;
                transition: all 0.2s ease;
                margin-bottom: 8px;
                font-family: inherit;
                text-align: left;
            }

            .action-card:last-child {
                margin-bottom: 0;
            }

            .action-card:hover {
                background: rgba(0, 212, 255, 0.1);
                border-color: rgba(0, 212, 255, 0.3);
                transform: translateY(-1px);
            }

            .action-icon {
                font-size: 1.2rem;
                margin-right: 12px;
            }

            .action-title {
                flex: 1;
                font-weight: 500;
                font-size: 0.95rem;
            }

            .action-shortcut {
                background: rgba(255, 255, 255, 0.1);
                padding: 2px 6px;
                border-radius: 4px;
                font-size: 0.7rem;
                border: 1px solid rgba(255, 255, 255, 0.2);
                color: #969696;
                font-family: 'Monaco', 'Menlo', monospace;
            }

            /* Recent Projects - Gestalt Closure & Figure/Ground */
            .welcome-recent {
                text-align: left;
            }

            .recent-title {
                font-size: 1.1rem;
                font-weight: 600;
                color: #cccccc;
                margin: 0 0 16px 0;
            }

            .recent-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
                gap: 12px;
            }

            .recent-card {
                display: flex;
                align-items: center;
                padding: 12px;
                background: rgba(255, 255, 255, 0.05);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 8px;
                cursor: pointer;
                transition: all 0.2s ease;
                text-align: left;
                font-family: inherit;
                color: inherit;
            }

            .recent-card:hover {
                background: rgba(255, 255, 255, 0.1);
                border-color: rgba(0, 212, 255, 0.3);
                transform: translateY(-1px);
            }

            .recent-icon {
                font-size: 1.1rem;
                margin-right: 10px;
                opacity: 0.8;
            }

            .recent-info {
                flex: 1;
                min-width: 0;
            }

            .recent-name {
                font-weight: 500;
                font-size: 0.9rem;
                color: #cccccc;
                margin-bottom: 2px;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }

            .recent-path {
                font-size: 0.75rem;
                color: #969696;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }

            /* Empty State */
            .welcome-empty {
                padding: 40px 20px;
                text-align: center;
                opacity: 0.6;
            }

            .empty-icon {
                font-size: 3rem;
                margin-bottom: 16px;
            }

            .empty-text {
                color: #969696;
                font-size: 0.95rem;
                margin: 0;
            }

            /* Responsive Design */
            @media (max-width: 768px) {
                .welcome-actions-grid {
                    grid-template-columns: 1fr;
                    gap: 16px;
                }

                .recent-grid {
                    grid-template-columns: 1fr;
                }

                .welcome-title {
                    font-size: 2.5rem;
                }

                .action-card {
                    padding: 14px 16px;
                }
            }
        `;
        document.head.appendChild(style);
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

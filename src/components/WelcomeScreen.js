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
const workspaceManager = require('../services/WorkspaceManager');

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
        const lastWorkspace = workspaceManager.getLastWorkspace();

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
                            ${lastWorkspace ? `
                                <button class="welcome-action-btn welcome-action-btn-primary" id="welcome-restore-workspace">
                                    <span class="welcome-action-icon">⏮️</span>
                                    <div class="welcome-action-content">
                                        <div class="welcome-action-title">Open Previous Workspace</div>
                                        <div class="welcome-action-desc">${this.escapeHtml(lastWorkspace.name || 'Untitled')} - ${this.escapeHtml(lastWorkspace.rootPath || 'No path')}</div>
                                    </div>
                                </button>
                            ` : ''}
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
        console.log('======================================');
        console.log('WelcomeScreen: setupEventListeners() CALLED');
        console.log('Container:', this.container);
        console.log('======================================');

        // Open folder button
        const openFolderBtn = this.container.querySelector('#welcome-open-folder');
        console.log('Open folder button element:', openFolderBtn);
        if (openFolderBtn) {
            console.log('✅ Open folder button FOUND, adding click listener');
            logger.debug('appInit', 'Open folder button found, adding click listener');
            openFolderBtn.addEventListener('click', async () => {
                console.log('[WelcomeScreen] ╔══════════════════════════════════════════╗');
                console.log('[WelcomeScreen] ║  🎯 OPEN FOLDER BUTTON CLICKED!        ║');
                console.log('[WelcomeScreen] ╚══════════════════════════════════════════╝');
                logger.info('appInit', '🎯 Open folder button clicked!');

                console.log('[WelcomeScreen] Step 1: Calling this.fs.selectFolder()...');
                const result = await this.fs.selectFolder();

                console.log('[WelcomeScreen] Step 2: selectFolder() returned');
                console.log('[WelcomeScreen] result:', result);
                console.log('[WelcomeScreen] result.canceled:', result.canceled);
                console.log('[WelcomeScreen] result.path:', result.path);
                console.log('[WelcomeScreen] result.path type:', typeof result.path);
                logger.info('appInit', 'selectFolder result:', result);

                if (!result.canceled && result.path) {
                    console.log('[WelcomeScreen] ✅ Folder selected successfully!');
                    console.log('[WelcomeScreen] 📢 EMITTING explorer:open-folder EVENT');
                    console.log('[WelcomeScreen] Event data:', { path: result.path });
                    logger.info('appInit', '📢 Emitting explorer:open-folder with path:', result.path);

                    eventBus.emit('explorer:open-folder', { path: result.path });

                    console.log('[WelcomeScreen] ✅ explorer:open-folder EVENT EMITTED');
                } else {
                    console.warn('[WelcomeScreen] ⚠️ Folder selection cancelled or no path provided');
                    console.warn('[WelcomeScreen] Reason: canceled =', result.canceled, ', path =', result.path);
                    logger.warn('appInit', 'Folder selection cancelled or no path. canceled:', result.canceled, 'path:', result.path);
                }
            });
            console.log('✅ Open folder button click listener ADDED');
        } else {
            console.error('❌ Open folder button NOT found!');
            logger.error('appInit', 'Open folder button NOT found!');
        }

        // SSH Connect button
        const sshConnectBtn = this.container.querySelector('#welcome-ssh-connect');
        console.log('SSH Connect button element:', sshConnectBtn);
        if (sshConnectBtn) {
            console.log('✅ SSH Connect button FOUND, adding click listener');
            logger.debug('appInit', 'SSH Connect button found, adding click listener');
            sshConnectBtn.addEventListener('click', () => {
                console.log('🔗🔗🔗 SSH CONNECT BUTTON CLICKED! 🔗🔗🔗');
                console.log('About to emit ssh:quick-connect event');
                logger.debug('appInit', 'SSH Connect button clicked!');
                eventBus.emit('ssh:quick-connect');
                console.log('ssh:quick-connect event emitted');
            });
            console.log('✅ SSH Connect button click listener ADDED');
        } else {
            console.error('❌ SSH Connect button NOT found!');
            logger.error('appInit', 'SSH Connect button NOT found!');
        }

        // SSH Panel button (SSH Manager)
        const sshPanelBtn = this.container.querySelector('#welcome-ssh-panel');
        console.log('SSH Panel button element:', sshPanelBtn);
        if (sshPanelBtn) {
            console.log('✅ SSH Panel button FOUND, adding click listener');
            logger.info('appInit', 'SSH Panel button found, adding click listener');
            sshPanelBtn.addEventListener('click', () => {
                console.log('⚡⚡⚡ SSH MANAGER BUTTON CLICKED! ⚡⚡⚡');
                console.log('About to emit ssh:show-welcome-screen event');
                logger.info('appInit', '🔗 SSH MANAGER BUTTON CLICKED!');
                logger.info('appInit', 'Emitting ssh:show-welcome-screen event...');
                eventBus.emit('ssh:show-welcome-screen');
                console.log('ssh:show-welcome-screen event emitted');
                logger.info('appInit', 'ssh:show-welcome-screen event emitted successfully');
            });
            console.log('✅ SSH Panel button click listener ADDED');
        } else {
            console.error('❌ SSH Panel button NOT found!');
            logger.error('appInit', 'SSH Panel button NOT found!');
            logger.error('appInit', 'Available buttons in container:');
            const allButtons = this.container.querySelectorAll('button');
            console.log('All buttons found:', allButtons.length);
            allButtons.forEach((btn, index) => {
                console.log(`Button ${index}:`, {
                    id: btn.id,
                    className: btn.className,
                    text: btn.textContent.substring(0, 50)
                });
                logger.error('appInit', `Button ${index}:`, btn.id, btn.className, btn.textContent.substring(0, 50));
            });
        }

        // Restore workspace button
        const restoreWorkspaceBtn = this.container.querySelector('#welcome-restore-workspace');
        console.log('Restore workspace button element:', restoreWorkspaceBtn);
        if (restoreWorkspaceBtn) {
            console.log('✅ Restore workspace button FOUND, adding click listener');
            logger.info('appInit', 'Restore workspace button found, adding click listener');
            restoreWorkspaceBtn.addEventListener('click', async () => {
                console.log('⏮️⏮️⏮️ RESTORE WORKSPACE BUTTON CLICKED! ⏮️⏮️⏮️');
                logger.info('appInit', '⏮️ Restoring previous workspace...');
                const success = await workspaceManager.restoreLastWorkspace();
                if (success) {
                    logger.info('appInit', '✅ Workspace restored successfully');
                } else {
                    logger.warn('appInit', '⚠️ Failed to restore workspace');
                }
            });
            console.log('✅ Restore workspace button click listener ADDED');
        }

        // Recent folder items
        const recentItems = this.container.querySelectorAll('.welcome-recent-item');
        console.log('Recent folder items found:', recentItems.length);
        recentItems.forEach(item => {
            item.addEventListener('click', () => {
                const path = item.dataset.path;
                console.log('Recent folder clicked:', path);
                eventBus.emit('explorer:open-folder', { path });
            });
        });

        console.log('======================================');
        console.log('WelcomeScreen: setupEventListeners() COMPLETE');
        console.log('======================================');
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

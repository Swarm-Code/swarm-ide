/**
 * StatusBar - VS Code-style bottom status bar
 *
 * Displays:
 * - Left: Current file path, line/column info, Git branch info
 * - Right: Quick action buttons (Quick Open, Search, Find & Replace)
 *
 * Usage:
 *   const statusBar = new StatusBar();
 */

const eventBus = require('../modules/EventBus');
const workspaceManager = require('../services/WorkspaceManager');

// Git integration
let gitStore = null;
let gitBranchService = null;

// Lazy load Git services
function getGitServices() {
    if (!gitStore) {
        try {
            const gitService = require('../services/GitService').getInstance();
            const { GitBranchService } = require('../services/GitBranchService');
            gitStore = require('../modules/GitStore').getInstance();
            gitBranchService = new GitBranchService(gitService);
        } catch (error) {
            console.warn('[StatusBar] Git services not available:', error.message);
        }
    }
    return { gitStore, gitBranchService };
}

class StatusBar {
    constructor() {
        this.bar = null;
        this.leftSection = null;
        this.rightSection = null;
        this.currentFile = null;
        this.lineInfo = null;
        this.gitInfo = null;
        this.currentBranch = null;
        this.branchTracking = null;
        this.workspaceInfo = null;

        this.render();
        this.setupEventListeners();
    }

    /**
     * Render the status bar
     */
    render() {
        // Create status bar container
        this.bar = document.createElement('div');
        this.bar.className = 'status-bar';
        this.bar.style.display = 'none'; // Hide initially on welcome screen

        // Left section - file info
        this.leftSection = document.createElement('div');
        this.leftSection.className = 'status-bar-left';

        const fileInfo = document.createElement('span');
        fileInfo.className = 'status-bar-file-info';
        fileInfo.textContent = 'No file open';

        this.leftSection.appendChild(fileInfo);

        // Git Source Control button
        this.gitButton = document.createElement('button');
        this.gitButton.className = 'status-bar-btn status-bar-git-btn';
        this.gitButton.title = 'Source Control (Ctrl+Shift+G)';
        this.gitButton.style.display = 'none'; // Hide initially until Git repo detected
        const gitIcon = document.createElement('img');
        gitIcon.src = 'assets/icons/git.svg';
        gitIcon.alt = 'Git';
        gitIcon.className = 'status-bar-icon';
        this.gitButton.appendChild(gitIcon);
        this.gitButton.addEventListener('click', () => {
            eventBus.emit('git:toggle-panel');
        });

        this.leftSection.appendChild(this.gitButton);

        // Git info section (branch name, tracking info)
        this.gitInfo = document.createElement('span');
        this.gitInfo.className = 'status-bar-git-info';
        this.gitInfo.style.display = 'none'; // Hide initially
        this.gitInfo.title = 'Click to switch branches';
        this.gitInfo.addEventListener('click', () => {
            this.showBranchSwitcher();
        });

        this.leftSection.appendChild(this.gitInfo);

        // Workspace info section (workspace name, project count)
        this.workspaceInfo = document.createElement('span');
        this.workspaceInfo.className = 'status-bar-workspace-info';
        this.workspaceInfo.style.display = 'none'; // Hide initially
        this.workspaceInfo.title = 'Click to switch workspaces';
        this.workspaceInfo.addEventListener('click', () => {
            this.showWorkspaceSwitcher();
        });

        this.leftSection.appendChild(this.workspaceInfo);

        // Right section - action buttons
        this.rightSection = document.createElement('div');
        this.rightSection.className = 'status-bar-right';

        // Quick Open button
        const quickOpenBtn = document.createElement('button');
        quickOpenBtn.className = 'status-bar-btn';
        quickOpenBtn.title = 'Quick Open (Ctrl+P)';
        const quickOpenIcon = document.createElement('img');
        quickOpenIcon.src = 'assets/icons/search.svg';
        quickOpenIcon.alt = 'Quick Open';
        quickOpenIcon.className = 'status-bar-icon';
        const quickOpenText = document.createElement('span');
        quickOpenText.textContent = 'Quick Open';
        quickOpenBtn.appendChild(quickOpenIcon);
        quickOpenBtn.appendChild(quickOpenText);
        quickOpenBtn.addEventListener('click', () => {
            eventBus.emit('quickopen:show');
        });

        // Global Search button
        const searchBtn = document.createElement('button');
        searchBtn.className = 'status-bar-btn';
        searchBtn.title = 'Search in Files (Ctrl+Shift+F)';
        const searchIcon = document.createElement('img');
        searchIcon.src = 'assets/icons/folder.svg';
        searchIcon.alt = 'Search';
        searchIcon.className = 'status-bar-icon';
        const searchText = document.createElement('span');
        searchText.textContent = 'Search';
        searchBtn.appendChild(searchIcon);
        searchBtn.appendChild(searchText);
        searchBtn.addEventListener('click', () => {
            eventBus.emit('globalsearch:show');
        });

        // Find & Replace button
        const replaceBtn = document.createElement('button');
        replaceBtn.className = 'status-bar-btn';
        replaceBtn.title = 'Find & Replace (Ctrl+Shift+H)';
        const replaceIcon = document.createElement('img');
        replaceIcon.src = 'assets/icons/find-replace.svg';
        replaceIcon.alt = 'Replace';
        replaceIcon.className = 'status-bar-icon';
        const replaceText = document.createElement('span');
        replaceText.textContent = 'Replace';
        replaceBtn.appendChild(replaceIcon);
        replaceBtn.appendChild(replaceText);
        replaceBtn.addEventListener('click', () => {
            eventBus.emit('findreplace:show');
        });

        this.rightSection.appendChild(quickOpenBtn);
        this.rightSection.appendChild(searchBtn);
        this.rightSection.appendChild(replaceBtn);

        // Assemble status bar
        this.bar.appendChild(this.leftSection);
        this.bar.appendChild(this.rightSection);

        // Append to body
        document.body.appendChild(this.bar);
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Show status bar when directory is opened (IDE becomes active)
        eventBus.on('explorer:directory-opened', () => {
            this.show();
            this.initGitInfo();
            this.updateWorkspaceInfo();
        });

        // Listen for file opened events
        eventBus.on('file:opened', (data) => {
            this.updateFileInfo(data.path);
        });

        // Listen for cursor position changes (if you implement this in TextEditor)
        eventBus.on('editor:cursor-changed', (data) => {
            this.updateLineInfo(data.line, data.column);
        });

        // Listen for Git state changes
        eventBus.on('git:branch-switched', (data) => {
            this.updateGitInfo(data);
        });

        eventBus.on('git:status-changed', (data) => {
            this.updateGitInfo(data);
        });

        eventBus.on('git:repository-changed', () => {
            this.initGitInfo();
        });

        // Listen for workspace changes
        eventBus.on('workspace:activated', (data) => {
            this.updateWorkspaceInfo(data.workspace);
        });

        eventBus.on('workspace:created', () => {
            this.updateWorkspaceInfo();
        });
    }

    /**
     * Update file info display
     * @param {string} filePath - Current file path
     */
    updateFileInfo(filePath) {
        this.currentFile = filePath;
        const fileInfo = this.leftSection.querySelector('.status-bar-file-info');

        if (filePath) {
            const fileName = filePath.split('/').pop();
            fileInfo.textContent = fileName;
            fileInfo.title = filePath;
        } else {
            fileInfo.textContent = 'No file open';
            fileInfo.title = '';
        }
    }

    /**
     * Update line/column info
     * @param {number} line - Line number (1-based)
     * @param {number} column - Column number (1-based)
     */
    updateLineInfo(line, column) {
        this.lineInfo = { line, column };

        // Check if line info span exists
        let lineInfoSpan = this.leftSection.querySelector('.status-bar-line-info');

        if (!lineInfoSpan) {
            lineInfoSpan = document.createElement('span');
            lineInfoSpan.className = 'status-bar-line-info';
            this.leftSection.appendChild(lineInfoSpan);
        }

        lineInfoSpan.textContent = ` Ln ${line}, Col ${column}`;
    }

    /**
     * Initialize Git info
     */
    async initGitInfo() {
        try {
            const { gitStore } = getGitServices();
            if (!gitStore) return;

            const repoPath = await gitStore.getCurrentRepository();
            if (!repoPath) {
                this.hideGitInfo();
                return;
            }

            await this.updateGitInfo();
        } catch (error) {
            console.error('[StatusBar] Failed to initialize Git info:', error);
            this.hideGitInfo();
        }
    }

    /**
     * Update Git info display
     * @param {Object} data - Optional Git state data
     */
    async updateGitInfo(data) {
        try {
            const { gitStore, gitBranchService } = getGitServices();
            if (!gitStore || !gitBranchService) return;

            // Get current branch
            const currentBranch = data?.branch || await gitStore.getCurrentBranch();
            if (!currentBranch) {
                this.hideGitInfo();
                return;
            }

            this.currentBranch = currentBranch;

            // Get branch tracking info (ahead/behind counts)
            const branches = await gitBranchService.getLocalBranches();
            const branchInfo = branches.find(b => b.name === currentBranch);

            let displayText = `⎇ ${currentBranch}`;

            if (branchInfo && branchInfo.upstream) {
                const ahead = branchInfo.ahead || 0;
                const behind = branchInfo.behind || 0;

                if (ahead > 0 || behind > 0) {
                    const tracking = [];
                    if (ahead > 0) tracking.push(`↑${ahead}`);
                    if (behind > 0) tracking.push(`↓${behind}`);
                    displayText += ` ${tracking.join(' ')}`;
                }
            }

            // Get modified files count
            const status = await gitStore.getStatus();
            const modifiedCount = status?.modifiedFiles?.length || 0;
            const stagedCount = status?.stagedFiles?.length || 0;

            if (modifiedCount > 0 || stagedCount > 0) {
                displayText += ` (${modifiedCount + stagedCount})`;
            }

            this.gitInfo.textContent = displayText;
            this.gitInfo.style.display = 'inline';

            // Show Git button when repository is detected
            if (this.gitButton) {
                this.gitButton.style.display = 'inline-flex';
            }

            console.log('[StatusBar] Git info updated:', displayText);
        } catch (error) {
            console.error('[StatusBar] Failed to update Git info:', error);
        }
    }

    /**
     * Hide Git info section
     */
    hideGitInfo() {
        if (this.gitInfo) {
            this.gitInfo.style.display = 'none';
        }
        if (this.gitButton) {
            this.gitButton.style.display = 'none';
        }
    }

    /**
     * Show branch switcher menu
     */
    showBranchSwitcher() {
        console.log('[StatusBar] Showing branch switcher');
        // Emit event to show Git branch menu
        eventBus.emit('git:show-branch-menu');
    }

    /**
     * Update workspace info display
     * @param {Object} workspace - Optional workspace object
     */
    updateWorkspaceInfo(workspace) {
        const activeWorkspace = workspace || workspaceManager.getActiveWorkspace();

        if (!activeWorkspace) {
            if (this.workspaceInfo) {
                this.workspaceInfo.style.display = 'none';
            }
            return;
        }

        const workspaceCount = workspaceManager.getAllWorkspaces().length;
        let displayText = `📁 ${activeWorkspace.name}`;

        if (workspaceCount > 1) {
            displayText += ` (${workspaceCount} workspaces)`;
        }

        if (this.workspaceInfo) {
            this.workspaceInfo.textContent = displayText;
            this.workspaceInfo.style.display = 'inline';
        }

        console.log('[StatusBar] Workspace info updated:', displayText);
    }

    /**
     * Show workspace switcher menu
     */
    async showWorkspaceSwitcher() {
        console.log('[StatusBar] Showing workspace switcher');

        const workspaces = workspaceManager.getAllWorkspaces();
        const activeWorkspace = workspaceManager.getActiveWorkspace();

        if (workspaces.length === 0) {
            console.log('[StatusBar] No workspaces available');
            return;
        }

        // Create a simple modal to show workspace list
        const modal = require('./Modal');

        // Build workspace list HTML
        const workspaceList = workspaces.map(ws => {
            const isActive = activeWorkspace && ws.id === activeWorkspace.id;
            const indicator = isActive ? '✓ ' : '  ';
            const pathInfo = ws.rootPath ? ` (${ws.rootPath})` : '';
            return `${indicator}${ws.name}${pathInfo}`;
        }).join('\n');

        const choice = await modal.prompt(
            'Switch Workspace',
            `Select workspace:\n\n${workspaceList}\n\nEnter workspace number (1-${workspaces.length}):`,
            '1'
        );

        if (choice) {
            const index = parseInt(choice) - 1;
            if (index >= 0 && index < workspaces.length) {
                const selectedWorkspace = workspaces[index];
                await workspaceManager.setActiveWorkspace(selectedWorkspace.id);
                console.log('[StatusBar] Switched to workspace:', selectedWorkspace.name);
            }
        }
    }

    /**
     * Show the status bar
     */
    show() {
        if (this.bar) {
            this.bar.style.display = 'flex';
        }
    }

    /**
     * Hide the status bar
     */
    hide() {
        if (this.bar) {
            this.bar.style.display = 'none';
        }
    }

    /**
     * Cleanup
     */
    destroy() {
        if (this.bar) {
            this.bar.remove();
        }
        eventBus.off('explorer:directory-opened');
        eventBus.off('file:opened');
        eventBus.off('editor:cursor-changed');
        eventBus.off('git:branch-switched');
        eventBus.off('git:status-changed');
        eventBus.off('git:repository-changed');
        eventBus.off('workspace:activated');
        eventBus.off('workspace:created');
    }
}

// Export singleton instance
const statusBar = new StatusBar();
module.exports = statusBar;

/**
 * GitBranchMenu - Branch switcher menu
 *
 * Displays:
 * - Local branches list
 * - Remote branches list
 * - Current branch indicator
 * - Ahead/behind counts
 * - Branch checkout/create/delete actions
 *
 * Usage:
 *   const gitBranchMenu = new GitBranchMenu();
 */

const eventBus = require('../modules/EventBus');

// Git integration
let gitBranchService = null;
let gitStore = null;

// Lazy load Git services
function getGitServices() {
    if (!gitBranchService) {
        try {
            const gitService = require('../services/GitService').getInstance();
            const { GitBranchService } = require('../services/GitBranchService');
            gitStore = require('../modules/GitStore').getInstance();
            gitBranchService = new GitBranchService(gitService);
        } catch (error) {
            console.warn('[GitBranchMenu] Git services not available:', error.message);
        }
    }
    return { gitBranchService, gitStore };
}

class GitBranchMenu {
    constructor() {
        this.menu = null;
        this.localBranchesList = null;
        this.remoteBranchesList = null;
        this.isVisible = false;
        this.localBranches = [];
        this.remoteBranches = [];
        this.currentBranch = null;

        this.render();
        this.setupEventListeners();
    }

    /**
     * Render the branch menu
     */
    render() {
        // Create menu container
        this.menu = document.createElement('div');
        this.menu.className = 'git-branch-menu';
        this.menu.style.display = 'none'; // Hidden by default

        // Menu header
        const header = document.createElement('div');
        header.className = 'git-branch-menu-header';

        const title = document.createElement('h4');
        title.textContent = 'Switch Branch';

        const closeBtn = document.createElement('button');
        closeBtn.className = 'git-branch-menu-close';
        closeBtn.innerHTML = '×';
        closeBtn.title = 'Close';
        closeBtn.addEventListener('click', () => this.hide());

        header.appendChild(title);
        header.appendChild(closeBtn);

        // Create new branch section
        const createSection = document.createElement('div');
        createSection.className = 'git-branch-create-section';

        const createInput = document.createElement('input');
        createInput.type = 'text';
        createInput.className = 'git-branch-create-input';
        createInput.placeholder = 'Enter new branch name...';

        const createBtn = document.createElement('button');
        createBtn.className = 'git-branch-create-btn';
        createBtn.textContent = 'Create Branch';
        createBtn.addEventListener('click', () => {
            const branchName = createInput.value.trim();
            if (branchName) {
                this.createBranch(branchName);
                createInput.value = '';
            }
        });

        // Create branch on Enter key
        createInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                createBtn.click();
            }
        });

        createSection.appendChild(createInput);
        createSection.appendChild(createBtn);

        // Local branches section
        const localSection = document.createElement('div');
        localSection.className = 'git-branch-section';

        const localHeader = document.createElement('div');
        localHeader.className = 'git-branch-section-header';
        localHeader.textContent = 'Local Branches';

        this.localBranchesList = document.createElement('div');
        this.localBranchesList.className = 'git-branches-list';

        localSection.appendChild(localHeader);
        localSection.appendChild(this.localBranchesList);

        // Remote branches section
        const remoteSection = document.createElement('div');
        remoteSection.className = 'git-branch-section';

        const remoteHeader = document.createElement('div');
        remoteHeader.className = 'git-branch-section-header';
        remoteHeader.textContent = 'Remote Branches';

        this.remoteBranchesList = document.createElement('div');
        this.remoteBranchesList.className = 'git-branches-list';

        remoteSection.appendChild(remoteHeader);
        remoteSection.appendChild(this.remoteBranchesList);

        // Assemble menu
        this.menu.appendChild(header);
        this.menu.appendChild(createSection);
        this.menu.appendChild(localSection);
        this.menu.appendChild(remoteSection);

        // Append to body
        document.body.appendChild(this.menu);

        // Click outside to close
        document.addEventListener('click', (e) => {
            if (this.isVisible && !this.menu.contains(e.target)) {
                this.hide();
            }
        });
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Listen for branch menu show event
        eventBus.on('git:show-branch-menu', () => {
            this.show();
        });

        // Listen for branch switched event
        eventBus.on('git:branch-switched', () => {
            this.loadBranches();
        });
    }

    /**
     * Load branches from Git
     */
    async loadBranches() {
        try {
            const { gitBranchService, gitStore } = getGitServices();
            if (!gitBranchService || !gitStore) return;

            console.log('[GitBranchMenu] Loading branches');

            // Get current branch
            this.currentBranch = await gitStore.getCurrentBranch();

            // Get all branches
            const branches = await gitBranchService.getAllBranches();

            // Separate local and remote branches
            this.localBranches = branches.filter(b => !b.isRemote);
            this.remoteBranches = branches.filter(b => b.isRemote);

            // Render branches
            this.renderLocalBranches();
            this.renderRemoteBranches();
        } catch (error) {
            console.error('[GitBranchMenu] Failed to load branches:', error);
            this.showError('Failed to load branches');
        }
    }

    /**
     * Render local branches list
     */
    renderLocalBranches() {
        this.localBranchesList.innerHTML = '';

        if (this.localBranches.length === 0) {
            const emptyMsg = document.createElement('div');
            emptyMsg.className = 'git-empty-message';
            emptyMsg.textContent = 'No local branches';
            this.localBranchesList.appendChild(emptyMsg);
            return;
        }

        this.localBranches.forEach(branch => {
            const branchItem = this.createBranchItem(branch);
            this.localBranchesList.appendChild(branchItem);
        });
    }

    /**
     * Render remote branches list
     */
    renderRemoteBranches() {
        this.remoteBranchesList.innerHTML = '';

        if (this.remoteBranches.length === 0) {
            const emptyMsg = document.createElement('div');
            emptyMsg.className = 'git-empty-message';
            emptyMsg.textContent = 'No remote branches';
            this.remoteBranchesList.appendChild(emptyMsg);
            return;
        }

        this.remoteBranches.forEach(branch => {
            const branchItem = this.createBranchItem(branch);
            this.remoteBranchesList.appendChild(branchItem);
        });
    }

    /**
     * Create branch item element
     * @param {Object} branch - Branch object
     * @returns {HTMLElement} Branch item element
     */
    createBranchItem(branch) {
        const item = document.createElement('div');
        item.className = 'git-branch-item';

        // Highlight current branch
        if (branch.isCurrent || branch.name === this.currentBranch) {
            item.classList.add('current');
        }

        // Branch name section
        const nameSection = document.createElement('div');
        nameSection.className = 'git-branch-name-section';

        // Current branch indicator
        if (branch.isCurrent || branch.name === this.currentBranch) {
            const indicator = document.createElement('span');
            indicator.className = 'git-branch-current-indicator';
            indicator.textContent = '●';
            nameSection.appendChild(indicator);
        }

        // Branch name
        const name = document.createElement('span');
        name.className = 'git-branch-name';
        name.textContent = branch.name;
        nameSection.appendChild(name);

        // Tracking info (ahead/behind counts)
        if (branch.upstream && (branch.ahead > 0 || branch.behind > 0)) {
            const tracking = document.createElement('span');
            tracking.className = 'git-branch-tracking';

            const parts = [];
            if (branch.ahead > 0) {
                parts.push(`↑${branch.ahead}`);
            }
            if (branch.behind > 0) {
                parts.push(`↓${branch.behind}`);
            }

            tracking.textContent = parts.join(' ');
            nameSection.appendChild(tracking);
        }

        // Action buttons
        const actions = document.createElement('div');
        actions.className = 'git-branch-actions';

        // Checkout button (only for non-current branches)
        if (!branch.isCurrent && branch.name !== this.currentBranch) {
            const checkoutBtn = document.createElement('button');
            checkoutBtn.className = 'git-branch-action-btn';
            checkoutBtn.title = 'Checkout';
            checkoutBtn.textContent = '✓';
            checkoutBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.checkoutBranch(branch.name);
            });
            actions.appendChild(checkoutBtn);
        }

        // Delete button (only for non-current local branches)
        if (!branch.isCurrent && branch.name !== this.currentBranch && !branch.isRemote) {
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'git-branch-action-btn git-branch-delete-btn';
            deleteBtn.title = 'Delete';
            deleteBtn.textContent = '×';
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.deleteBranch(branch.name);
            });
            actions.appendChild(deleteBtn);
        }

        item.appendChild(nameSection);
        item.appendChild(actions);

        // Click to checkout (only for non-current branches)
        if (!branch.isCurrent && branch.name !== this.currentBranch) {
            item.style.cursor = 'pointer';
            item.addEventListener('click', () => {
                this.checkoutBranch(branch.name);
            });
        }

        return item;
    }

    /**
     * Create a new branch
     * @param {string} branchName - New branch name
     */
    async createBranch(branchName) {
        try {
            const { gitBranchService } = getGitServices();
            if (!gitBranchService) return;

            console.log('[GitBranchMenu] Creating branch:', branchName);
            await gitBranchService.createBranch(branchName);

            this.showSuccess(`Branch '${branchName}' created successfully`);
            await this.loadBranches();
        } catch (error) {
            console.error('[GitBranchMenu] Failed to create branch:', error);
            this.showError('Failed to create branch: ' + error.message);
        }
    }

    /**
     * Checkout a branch
     * @param {string} branchName - Branch name to checkout
     */
    async checkoutBranch(branchName) {
        try {
            const { gitBranchService } = getGitServices();
            if (!gitBranchService) return;

            console.log('[GitBranchMenu] Checking out branch:', branchName);
            await gitBranchService.checkoutBranch(branchName);

            this.showSuccess(`Switched to branch '${branchName}'`);
            this.hide();

            // Emit event
            eventBus.emit('git:branch-switched', { branch: branchName });
        } catch (error) {
            console.error('[GitBranchMenu] Failed to checkout branch:', error);
            this.showError('Failed to checkout branch: ' + error.message);
        }
    }

    /**
     * Delete a branch
     * @param {string} branchName - Branch name to delete
     */
    async deleteBranch(branchName) {
        if (!confirm(`Are you sure you want to delete branch '${branchName}'? This cannot be undone.`)) {
            return;
        }

        try {
            const { gitBranchService } = getGitServices();
            if (!gitBranchService) return;

            console.log('[GitBranchMenu] Deleting branch:', branchName);
            await gitBranchService.deleteBranch(branchName);

            this.showSuccess(`Branch '${branchName}' deleted successfully`);
            await this.loadBranches();
        } catch (error) {
            console.error('[GitBranchMenu] Failed to delete branch:', error);
            this.showError('Failed to delete branch: ' + error.message);
        }
    }

    /**
     * Show error message
     * @param {string} message - Error message
     */
    showError(message) {
        // Create toast notification
        const toast = document.createElement('div');
        toast.className = 'git-toast git-toast-error';
        toast.textContent = message;
        document.body.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('fade-out');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    /**
     * Show success message
     * @param {string} message - Success message
     */
    showSuccess(message) {
        // Create toast notification
        const toast = document.createElement('div');
        toast.className = 'git-toast git-toast-success';
        toast.textContent = message;
        document.body.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('fade-out');
            setTimeout(() => toast.remove(), 300);
        }, 2000);
    }

    /**
     * Show the menu
     */
    show() {
        if (!this.menu) return;
        this.menu.style.display = 'block';
        this.isVisible = true;
        this.loadBranches();

        // Position menu near the status bar Git info
        const gitInfo = document.querySelector('.status-bar-git-info');
        if (gitInfo) {
            const rect = gitInfo.getBoundingClientRect();
            this.menu.style.left = rect.left + 'px';
            this.menu.style.bottom = (window.innerHeight - rect.top + 5) + 'px';
        }
    }

    /**
     * Hide the menu
     */
    hide() {
        if (!this.menu) return;
        this.menu.style.display = 'none';
        this.isVisible = false;
    }

    /**
     * Toggle menu visibility
     */
    toggle() {
        if (this.isVisible) {
            this.hide();
        } else {
            this.show();
        }
    }

    /**
     * Cleanup
     */
    destroy() {
        if (this.menu) {
            this.menu.remove();
        }
        eventBus.off('git:show-branch-menu');
        eventBus.off('git:branch-switched');
    }
}

module.exports = GitBranchMenu;

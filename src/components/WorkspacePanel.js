/**
 * WorkspacePanel - Sliding panel for workspace management
 *
 * Provides UI for creating, switching, and deleting workspaces.
 * Slides in from the right side when opened.
 */

const eventBus = require('../modules/EventBus');
const workspaceManager = require('../services/WorkspaceManager');
const logger = require('../utils/Logger');

class WorkspacePanel {
    constructor() {
        this.isOpen = false;
        this.panel = null;
        this.workspaceManager = workspaceManager;
        this.createDialogOpen = false;

        this.init();
    }

    /**
     * Initialize the panel
     */
    init() {
        this.createPanelElement();
        this.setupEventListeners();
        logger.debug('workspaceLoad', 'Initialized');
    }

    /**
     * Create panel DOM structure
     */
    createPanelElement() {
        // Create panel container
        this.panel = document.createElement('div');
        this.panel.className = 'workspace-panel';
        this.panel.id = 'workspace-panel';

        // Create header
        const header = document.createElement('div');
        header.className = 'workspace-panel-header';

        const title = document.createElement('h3');
        title.className = 'workspace-panel-title';
        title.textContent = 'Workspaces';

        const closeBtn = document.createElement('button');
        closeBtn.className = 'workspace-panel-close';
        closeBtn.innerHTML = '✕';
        closeBtn.onclick = () => this.close();

        header.appendChild(title);
        header.appendChild(closeBtn);

        // Create workspace list container
        this.listContainer = document.createElement('div');
        this.listContainer.className = 'workspace-list';

        // Create workspace button
        const createBtn = document.createElement('button');
        createBtn.className = 'workspace-create-btn';
        createBtn.innerHTML = '➕ Create Workspace';
        createBtn.onclick = () => this.showCreateDialog();

        // Assemble panel
        this.panel.appendChild(header);
        this.panel.appendChild(this.listContainer);
        this.panel.appendChild(createBtn);

        // Add to document
        document.body.appendChild(this.panel);

        // Render initial workspace list
        this.renderWorkspaceList();
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Listen for toggle event
        eventBus.on('workspace:toggle-panel', () => {
            this.toggle();
        });

        // Listen for workspace changes to refresh list
        eventBus.on('workspace:created', () => {
            this.renderWorkspaceList();
        });

        eventBus.on('workspace:deleted', () => {
            this.renderWorkspaceList();
        });

        eventBus.on('workspace:activated', () => {
            this.renderWorkspaceList();
        });

        // Click outside to close
        document.addEventListener('click', (e) => {
            if (this.isOpen && !this.panel.contains(e.target) && !e.target.closest('#workspace-button')) {
                this.close();
            }
        });
    }

    /**
     * Render workspace list
     */
    renderWorkspaceList() {
        this.listContainer.innerHTML = '';

        const workspaces = this.workspaceManager.getAllWorkspaces();
        const activeWorkspace = this.workspaceManager.getActiveWorkspace();

        if (workspaces.length === 0) {
            const emptyState = document.createElement('div');
            emptyState.className = 'workspace-empty-state';
            emptyState.textContent = 'No workspaces yet';
            this.listContainer.appendChild(emptyState);
            return;
        }

        workspaces.forEach(workspace => {
            const item = this.createWorkspaceItem(workspace, activeWorkspace?.id === workspace.id);
            this.listContainer.appendChild(item);
        });
    }

    /**
     * Create workspace item element
     *
     * Displays workspace with counts of terminals and open files to help users
     * understand what's in each workspace and verify persistence.
     *
     * Terminal Persistence Indicator:
     * - Shows count of terminals that will remain running when workspace is hidden
     * - Users can see at a glance how many background processes each workspace has
     * - Count refreshes when switching to reflect current state
     */
    createWorkspaceItem(workspace, isActive) {
        const item = document.createElement('div');
        item.className = 'workspace-item' + (isActive ? ' active' : '');
        item.dataset.workspaceId = workspace.id;
        item.title = 'Click to switch workspace - terminals and editors persist when hidden';

        // Workspace info
        const info = document.createElement('div');
        info.className = 'workspace-item-info';

        const name = document.createElement('div');
        name.className = 'workspace-item-name';
        name.textContent = workspace.name;

        // Create stats/description area
        const statContainer = document.createElement('div');
        statContainer.className = 'workspace-item-stats';
        statContainer.style.cssText = 'display: flex; gap: 12px; margin-top: 4px; font-size: 12px; color: #999;';

        // Terminal count - highlight to show persistence
        const terminalCount = workspace.terminalIds?.length || 0;
        const terminalStat = document.createElement('span');
        terminalStat.innerHTML = `📟 ${terminalCount} ${terminalCount === 1 ? 'terminal' : 'terminals'}`;
        terminalStat.title = `${terminalCount} terminal(s) will keep running when workspace is hidden`;
        statContainer.appendChild(terminalStat);

        // File count
        const fileCount = workspace.fileCount || 0;
        const fileStat = document.createElement('span');
        fileStat.innerHTML = `📄 ${fileCount} ${fileCount === 1 ? 'file' : 'files'}`;
        fileStat.title = 'Open files in this workspace';
        statContainer.appendChild(fileStat);

        const desc = document.createElement('div');
        desc.className = 'workspace-item-desc';
        desc.textContent = workspace.description || 'No description';

        info.appendChild(name);
        info.appendChild(statContainer);
        info.appendChild(desc);

        // Actions container
        const actions = document.createElement('div');
        actions.className = 'workspace-item-actions';
        actions.style.cssText = 'display: flex; gap: 8px; opacity: 0; transition: opacity 0.2s;';

        // Delete button (only if not last workspace)
        if (this.workspaceManager.getAllWorkspaces().length > 1) {
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'workspace-item-delete';
            deleteBtn.innerHTML = '🗑️';
            deleteBtn.title = 'Delete Workspace';
            deleteBtn.onclick = (e) => {
                e.stopPropagation();
                this.confirmDelete(workspace);
            };
            actions.appendChild(deleteBtn);
        }

        // Show actions on hover
        item.addEventListener('mouseenter', () => {
            actions.style.opacity = '1';
        });
        item.addEventListener('mouseleave', () => {
            actions.style.opacity = '0';
        });

        // Click to switch workspace
        item.onclick = () => {
            if (!isActive) {
                this.switchWorkspace(workspace.id);
            }
        };

        item.appendChild(info);
        item.appendChild(actions);

        return item;
    }

    /**
     * Switch to a workspace
     *
     * TERMINAL PERSISTENCE GUARANTEED:
     * When switching workspaces:
     * 1. Current workspace's panes are hidden (display: none) not destroyed
     * 2. All terminals in hidden workspace keep running commands
     * 3. New workspace's panes are shown (display: flex)
     * 4. All terminals immediately show accumulated output
     *
     * Users can confidently switch workspaces knowing:
     * - Long-running build commands continue in background
     * - Server processes keep running
     * - Any background jobs keep executing
     * - All output is preserved and visible when returning
     */
    switchWorkspace(workspaceId) {
        logger.debug('workspaceLoad', 'Switching to workspace:', workspaceId);

        const success = this.workspaceManager.setActiveWorkspace(workspaceId);

        if (success) {
            // Refresh the list to update active state
            this.renderWorkspaceList();

            // Emit event so MenuBar can update
            eventBus.emit('workspace:switched', { workspaceId });

            // Close panel after switching
            this.close();

            logger.debug('workspaceLoad', 'Workspace switched successfully');
        } else {
            logger.error('workspaceLoad', 'Failed to switch workspace');
        }
    }

    /**
     * Show create workspace dialog
     */
    showCreateDialog() {
        if (this.createDialogOpen) return;
        this.createDialogOpen = true;

        // CRITICAL FIX: Emit overlay:shown to hide BrowserViews
        eventBus.emit('overlay:shown', { source: 'workspace-dialog' });
        logger.debug('workspaceLoad', 'Workspace dialog overlay shown, emitted overlay:shown event');

        // Create dialog overlay
        const overlay = document.createElement('div');
        overlay.className = 'workspace-dialog-overlay';
        overlay.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 10001; display: flex; align-items: center; justify-content: center;';

        // Create dialog
        const dialog = document.createElement('div');
        dialog.className = 'workspace-dialog';
        dialog.style.cssText = 'background: #2d2d30; border: 1px solid #3e3e42; border-radius: 8px; padding: 24px; width: 400px; max-width: 90vw;';

        // Dialog title
        const title = document.createElement('h3');
        title.textContent = 'Create Workspace';
        title.style.cssText = 'margin: 0 0 20px 0; font-size: 16px; color: #ffffff;';

        // Name input
        const nameLabel = document.createElement('label');
        nameLabel.textContent = 'Name';
        nameLabel.style.cssText = 'display: block; margin-bottom: 6px; font-size: 13px; color: #cccccc;';

        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.placeholder = 'My Workspace';
        nameInput.value = 'My Workspace';
        nameInput.style.cssText = 'width: 100%; padding: 8px 12px; background: #1e1e1e; border: 1px solid #3e3e42; border-radius: 4px; color: #d4d4d4; font-size: 13px; margin-bottom: 16px;';

        // Description input
        const descLabel = document.createElement('label');
        descLabel.textContent = 'Description (optional)';
        descLabel.style.cssText = 'display: block; margin-bottom: 6px; font-size: 13px; color: #cccccc;';

        const descInput = document.createElement('textarea');
        descInput.placeholder = 'Workspace description...';
        descInput.rows = 3;
        descInput.style.cssText = 'width: 100%; padding: 8px 12px; background: #1e1e1e; border: 1px solid #3e3e42; border-radius: 4px; color: #d4d4d4; font-size: 13px; margin-bottom: 16px; resize: vertical; font-family: inherit;';

        // Template select
        const templateLabel = document.createElement('label');
        templateLabel.textContent = 'Template';
        templateLabel.style.cssText = 'display: block; margin-bottom: 6px; font-size: 13px; color: #cccccc;';

        const templateSelect = document.createElement('select');
        templateSelect.style.cssText = 'width: 100%; padding: 8px 12px; background: #1e1e1e; border: 1px solid #3e3e42; border-radius: 4px; color: #d4d4d4; font-size: 13px; margin-bottom: 20px;';

        const templates = this.workspaceManager.getTemplates();
        templates.forEach(template => {
            const option = document.createElement('option');
            option.value = template.id;
            option.textContent = `${template.name} - ${template.description}`;
            templateSelect.appendChild(option);
        });

        // Buttons
        const buttonContainer = document.createElement('div');
        buttonContainer.style.cssText = 'display: flex; gap: 12px; justify-content: flex-end;';

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancel';
        cancelBtn.style.cssText = 'padding: 8px 16px; background: #3e3e42; border: none; border-radius: 4px; color: #cccccc; cursor: pointer; font-size: 13px;';
        cancelBtn.onclick = () => {
            overlay.remove();
            this.createDialogOpen = false;

            // CRITICAL FIX: Emit overlay:hidden to restore BrowserViews
            eventBus.emit('overlay:hidden', { source: 'workspace-dialog' });
            logger.debug('workspaceLoad', 'Workspace dialog overlay hidden, emitted overlay:hidden event');
        };

        const createBtn = document.createElement('button');
        createBtn.textContent = 'Create';
        createBtn.style.cssText = 'padding: 8px 16px; background: #0e639c; border: none; border-radius: 4px; color: #ffffff; cursor: pointer; font-size: 13px; font-weight: 500;';
        createBtn.onclick = () => {
            const name = nameInput.value.trim();
            const description = descInput.value.trim();
            const template = templateSelect.value;

            if (!name) {
                alert('Please enter a workspace name');
                return;
            }

            // Create workspace
            const workspace = this.workspaceManager.createWorkspace(name, description, template);
            logger.debug('workspaceLoad', 'Created workspace:', workspace.name);

            // Close dialog
            overlay.remove();
            this.createDialogOpen = false;

            // CRITICAL FIX: Emit overlay:hidden to restore BrowserViews
            eventBus.emit('overlay:hidden', { source: 'workspace-dialog' });
            logger.debug('workspaceLoad', 'Workspace dialog overlay hidden, emitted overlay:hidden event');

            // Switch to new workspace
            this.switchWorkspace(workspace.id);
        };

        buttonContainer.appendChild(cancelBtn);
        buttonContainer.appendChild(createBtn);

        // Assemble dialog
        dialog.appendChild(title);
        dialog.appendChild(nameLabel);
        dialog.appendChild(nameInput);
        dialog.appendChild(descLabel);
        dialog.appendChild(descInput);
        dialog.appendChild(templateLabel);
        dialog.appendChild(templateSelect);
        dialog.appendChild(buttonContainer);

        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        // Focus name input
        nameInput.focus();
        nameInput.select();

        // Close on overlay click
        overlay.onclick = (e) => {
            if (e.target === overlay) {
                overlay.remove();
                this.createDialogOpen = false;

                // CRITICAL FIX: Emit overlay:hidden to restore BrowserViews
                eventBus.emit('overlay:hidden', { source: 'workspace-dialog' });
                logger.debug('workspaceLoad', 'Workspace dialog overlay hidden (clicked outside), emitted overlay:hidden event');
            }
        };
    }

    /**
     * Confirm workspace deletion
     */
    confirmDelete(workspace) {
        const confirmed = confirm(`Delete workspace "${workspace.name}"?\n\nThis cannot be undone.`);

        if (confirmed) {
            logger.debug('workspaceLoad', 'Deleting workspace:', workspace.name);
            const success = this.workspaceManager.deleteWorkspace(workspace.id);

            if (success) {
                logger.debug('workspaceLoad', 'Workspace deleted successfully');
            } else {
                alert('Cannot delete workspace. At least one workspace must exist.');
            }
        }
    }

    /**
     * Toggle panel open/closed
     */
    toggle() {
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    }

    /**
     * Open panel
     */
    open() {
        this.panel.classList.add('open');
        this.isOpen = true;
        this.renderWorkspaceList();

        // CRITICAL FIX: Emit workspace-panel:shown event to resize BrowserViews
        // Workspace panel is a 350px sidebar, so browser should shrink, not hide completely
        eventBus.emit('workspace-panel:shown', { width: 350 });
        logger.debug('workspaceLoad', 'Workspace panel shown, emitted workspace-panel:shown event');

        logger.debug('workspaceLoad', 'Opened');
    }

    /**
     * Close panel
     */
    close() {
        this.panel.classList.remove('open');
        this.isOpen = false;

        // CRITICAL FIX: Emit workspace-panel:hidden event to restore BrowserView size
        eventBus.emit('workspace-panel:hidden');
        logger.debug('workspaceLoad', 'Workspace panel hidden, emitted workspace-panel:hidden event');

        logger.debug('workspaceLoad', 'Closed');
    }

    /**
     * Cleanup
     */
    destroy() {
        if (this.panel) {
            this.panel.remove();
        }
    }
}

module.exports = WorkspacePanel;

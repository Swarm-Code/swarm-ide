/**
 * MenuBar - Top menu bar component with dropdown menus
 *
 * Provides application menu system with File, Edit, View, etc.
 * Handles keyboard navigation and emits events through EventBus.
 *
 * Usage:
 *   const menuBar = new MenuBar(containerElement, fileSystemService);
 */

const eventBus = require('../modules/EventBus');
const settingsPanel = require('./SettingsPanel');
const workspaceManager = require('../services/WorkspaceManager');

class MenuBar {
    constructor(container, fileSystemService) {
        this.container = container;
        this.fs = fileSystemService;
        this.activeMenu = null;
        this.menus = this.getMenuDefinitions();
        this.workspaceManager = workspaceManager;

        this.init();
    }

    /**
     * Initialize the component
     */
    init() {
        this.render();
        this.setupEventListeners();
        this.setupWorkspaceListeners();
        console.log('[MenuBar] Initialized');
    }

    /**
     * Setup workspace event listeners
     */
    setupWorkspaceListeners() {
        // Update workspace name when workspace switches
        eventBus.on('workspace:switched', () => {
            this.updateWorkspaceName();
        });

        eventBus.on('workspace:activated', () => {
            this.updateWorkspaceName();
        });
    }

    /**
     * Update workspace name display
     */
    updateWorkspaceName() {
        const workspaceButton = document.getElementById('workspace-button');
        if (workspaceButton) {
            const activeWorkspace = this.workspaceManager.getActiveWorkspace();
            const workspaceName = activeWorkspace ? activeWorkspace.name : 'No Workspace';
            workspaceButton.innerHTML = `<img src="assets/icons/folder.svg" alt="Workspace" class="workspace-icon"><span class="workspace-name">${workspaceName}</span>`;
        }
    }

    /**
     * Get menu definitions
     * @returns {Array} Menu definitions
     */
    getMenuDefinitions() {
        return [
            {
                label: 'File',
                items: [
                    { label: 'Open Folder...', action: 'file:open-folder', shortcut: 'Ctrl+O' },
                    { label: 'Open File...', action: 'file:open-file', shortcut: 'Ctrl+Shift+O' },
                    { type: 'separator' },
                    { label: 'Save', action: 'file:save', shortcut: 'Ctrl+S', disabled: true },
                    { label: 'Save As...', action: 'file:save-as', shortcut: 'Ctrl+Shift+S', disabled: true },
                    { type: 'separator' },
                    { label: 'Close File', action: 'file:close', shortcut: 'Ctrl+W' },
                    { label: 'Close Folder', action: 'file:close-folder' },
                    { type: 'separator' },
                    { label: 'Exit', action: 'app:quit', shortcut: 'Ctrl+Q' }
                ]
            },
            {
                label: 'Edit',
                items: [
                    { label: 'Undo', action: 'edit:undo', shortcut: 'Ctrl+Z', disabled: true },
                    { label: 'Redo', action: 'edit:redo', shortcut: 'Ctrl+Y', disabled: true },
                    { type: 'separator' },
                    { label: 'Cut', action: 'edit:cut', shortcut: 'Ctrl+X', disabled: true },
                    { label: 'Copy', action: 'edit:copy', shortcut: 'Ctrl+C', disabled: true },
                    { label: 'Paste', action: 'edit:paste', shortcut: 'Ctrl+V', disabled: true },
                    { type: 'separator' },
                    { label: 'Find', action: 'edit:find', shortcut: 'Ctrl+F', disabled: true },
                    { label: 'Replace', action: 'edit:replace', shortcut: 'Ctrl+H', disabled: true }
                ]
            },
            {
                label: 'View',
                items: [
                    { label: 'Toggle Sidebar', action: 'view:toggle-sidebar', shortcut: 'Ctrl+B' },
                    { label: 'Toggle Browser', action: 'view:toggle-browser', shortcut: 'Ctrl+Shift+B' },
                    { label: 'Toggle Diagnostics', action: 'view:toggle-diagnostics', shortcut: 'Ctrl+Shift+M' },
                    { type: 'separator' },
                    { label: 'Zoom In', action: 'view:zoom-in', shortcut: 'Ctrl+=' },
                    { label: 'Zoom Out', action: 'view:zoom-out', shortcut: 'Ctrl+-' },
                    { label: 'Reset Zoom', action: 'view:zoom-reset', shortcut: 'Ctrl+0' }
                ]
            },
            {
                label: 'Help',
                items: [
                    { label: 'Documentation', action: 'help:docs' },
                    { label: 'About', action: 'help:about' }
                ]
            }
        ];
    }

    /**
     * Render the menu bar
     */
    render() {
        this.container.innerHTML = '';
        this.container.className = 'menu-bar';

        this.menus.forEach((menu, index) => {
            const menuItem = this.createMenuItem(menu, index);
            this.container.appendChild(menuItem);
        });

        // Add workspace switcher button
        const workspaceButton = document.createElement('button');
        workspaceButton.id = 'workspace-button';
        workspaceButton.className = 'workspace-switcher';
        const activeWorkspace = this.workspaceManager.getActiveWorkspace();
        const workspaceName = activeWorkspace ? activeWorkspace.name : 'No Workspace';
        workspaceButton.innerHTML = `<img src="assets/icons/folder.svg" alt="Workspace" class="workspace-icon"><span class="workspace-name">${workspaceName}</span>`;
        workspaceButton.title = 'Switch Workspace';
        workspaceButton.addEventListener('click', () => {
            console.log('[MenuBar] Workspace button clicked');
            eventBus.emit('workspace:toggle-panel');
        });
        this.container.appendChild(workspaceButton);

        // Add settings button
        const settingsButton = document.createElement('button');
        settingsButton.id = 'settings-button';
        settingsButton.className = 'settings-button';
        settingsButton.innerHTML = '<img src="assets/icons/settings.svg" alt="Settings" class="settings-icon">Settings';
        settingsButton.title = 'Open Settings';
        settingsButton.addEventListener('click', () => {
            console.log('[MenuBar] Settings button clicked');
            settingsPanel.toggle();
        });
        this.container.appendChild(settingsButton);
    }

    /**
     * Create a menu item
     * @param {Object} menu - Menu definition
     * @param {number} index - Menu index
     * @returns {HTMLElement} Menu item element
     */
    createMenuItem(menu, index) {
        const menuItem = document.createElement('div');
        menuItem.className = 'menu-item';
        menuItem.dataset.menuIndex = index;

        const label = document.createElement('span');
        label.className = 'menu-label';
        label.textContent = menu.label;

        const dropdown = this.createDropdown(menu.items);

        menuItem.appendChild(label);
        menuItem.appendChild(dropdown);

        return menuItem;
    }

    /**
     * Create dropdown menu
     * @param {Array} items - Menu items
     * @returns {HTMLElement} Dropdown element
     */
    createDropdown(items) {
        const dropdown = document.createElement('div');
        dropdown.className = 'menu-dropdown';

        items.forEach(item => {
            if (item.type === 'separator') {
                const separator = document.createElement('div');
                separator.className = 'menu-separator';
                dropdown.appendChild(separator);
            } else {
                const dropdownItem = this.createDropdownItem(item);
                dropdown.appendChild(dropdownItem);
            }
        });

        return dropdown;
    }

    /**
     * Create dropdown item
     * @param {Object} item - Item definition
     * @returns {HTMLElement} Dropdown item element
     */
    createDropdownItem(item) {
        const dropdownItem = document.createElement('div');
        dropdownItem.className = 'menu-dropdown-item';

        if (item.disabled) {
            dropdownItem.classList.add('disabled');
        }

        const label = document.createElement('span');
        label.className = 'menu-item-label';
        label.textContent = item.label;

        dropdownItem.appendChild(label);

        if (item.shortcut) {
            const shortcut = document.createElement('span');
            shortcut.className = 'menu-item-shortcut';
            shortcut.textContent = item.shortcut;
            dropdownItem.appendChild(shortcut);
        }

        if (!item.disabled) {
            dropdownItem.dataset.action = item.action;
        }

        return dropdownItem;
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Menu item hover
        this.container.addEventListener('mouseenter', (e) => {
            const menuItem = e.target.closest('.menu-item');
            if (menuItem) {
                this.openMenu(menuItem);
            }
        }, true);

        // Menu item click
        this.container.addEventListener('click', (e) => {
            const menuItem = e.target.closest('.menu-item');
            if (menuItem) {
                const isOpen = menuItem.classList.contains('active');
                this.closeAllMenus();
                if (!isOpen) {
                    this.openMenu(menuItem);
                }
            }

            // Dropdown item click
            const dropdownItem = e.target.closest('.menu-dropdown-item');
            if (dropdownItem && !dropdownItem.classList.contains('disabled')) {
                const action = dropdownItem.dataset.action;
                if (action) {
                    this.handleAction(action);
                    this.closeAllMenus();
                }
            }
        });

        // Click outside to close
        document.addEventListener('click', (e) => {
            if (!this.container.contains(e.target)) {
                this.closeAllMenus();
            }
        });

        // ESC key to close
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeAllMenus();
            }
        });
    }

    /**
     * Open a menu
     * @param {HTMLElement} menuItem - Menu item element
     */
    openMenu(menuItem) {
        // Close all other menus first
        this.container.querySelectorAll('.menu-item').forEach(item => {
            if (item !== menuItem) {
                item.classList.remove('active');
            }
        });

        menuItem.classList.add('active');
        this.activeMenu = menuItem;
    }

    /**
     * Close all menus
     */
    closeAllMenus() {
        this.container.querySelectorAll('.menu-item').forEach(item => {
            item.classList.remove('active');
        });
        this.activeMenu = null;
    }

    /**
     * Handle menu action
     * @param {string} action - Action identifier
     */
    async handleAction(action) {
        console.log('[MenuBar] Action:', action);

        switch (action) {
            case 'file:open-folder':
                const folderResult = await this.fs.selectFolder();
                if (!folderResult.canceled && folderResult.path) {
                    eventBus.emit('explorer:open-folder', { path: folderResult.path });
                }
                break;

            case 'file:open-file':
                // TODO: Implement file picker
                eventBus.emit('file:open-dialog');
                break;

            case 'file:close':
                eventBus.emit('file:close-current');
                break;

            case 'file:close-folder':
                eventBus.emit('explorer:close-folder');
                break;

            case 'view:toggle-sidebar':
                eventBus.emit('ui:toggle-sidebar');
                break;

            case 'view:toggle-browser':
                eventBus.emit('browser:toggle');
                break;

            case 'view:toggle-diagnostics':
                eventBus.emit('ui:toggle-diagnostics');
                break;

            case 'app:quit':
                // This would need to be handled by main process
                eventBus.emit('app:quit-request');
                break;

            default:
                console.log('[MenuBar] Unhandled action:', action);
                eventBus.emit('menu:action', { action });
        }
    }

    /**
     * Cleanup
     */
    destroy() {
        this.container.innerHTML = '';
    }
}

module.exports = MenuBar;

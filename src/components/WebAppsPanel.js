/**
 * WebAppsPanel - Sidebar UI component for web apps
 * 
 * Self-contained component that:
 * - Renders list of web apps in sidebar above file tree
 * - Handles click to open web app
 * - Provides context menu for edit/delete/copy URL
 * - Listens to store changes and auto-updates
 */

const eventBus = require('../modules/EventBus');
const { getInstance: getManagerInstance } = require('../modules/WebAppsManager');
const ContextMenu = require('./ContextMenu');
const logger = require('../utils/Logger');

class WebAppsPanel {
    constructor(container) {
        this.container = container;
        this.manager = null;
        this.panel = null;
        this.section = null;
        this.header = null;
        this.list = null;
        this.collapsed = false;
        this.contextMenu = null;
        this.draggedItem = null;
        this.dragOverItem = null;

        this.init();
    }

    /**
     * Initialize the component
     */
    async init() {
        try {
            // Get manager instance
            this.manager = await getManagerInstance();
            this.collapsed = this.manager.isSectionCollapsed();

            // Setup event listeners
            this.setupEventListeners();

            // Render initial UI
            this.render();

            logger.info('webApps', '✓ WebAppsPanel initialized');
        } catch (error) {
            logger.error('webApps', 'Failed to initialize WebAppsPanel:', error.message);
        }
    }

    /**
     * Setup event listeners for store changes
     */
    setupEventListeners() {
        // Listen for web app additions
        eventBus.on('webapp:added', (app) => {
            logger.debug('webApps', 'WebAppsPanel: webapp:added event');
            this.render();
        });

        // Listen for web app updates
        eventBus.on('webapp:updated', (app) => {
            logger.debug('webApps', 'WebAppsPanel: webapp:updated event');
            this.render();
        });

        // Listen for web app deletions
        eventBus.on('webapp:deleted', (app) => {
            logger.debug('webApps', 'WebAppsPanel: webapp:deleted event');
            this.render();
        });

        // Listen for web app reordering
        eventBus.on('webapp:reordered', () => {
            logger.debug('webApps', 'WebAppsPanel: webapp:reordered event');
            this.render();
        });

        // Listen for section toggle
        eventBus.on('webapp:sectionToggled', (data) => {
            logger.debug('webApps', 'WebAppsPanel: webapp:sectionToggled event');
            this.collapsed = data.collapsed;
            this.updateCollapseState();
        });
    }

    /**
     * Render the entire panel
     */
    render() {
        try {
            // Clear container
            this.container.innerHTML = '';

            // Create main section
            this.section = document.createElement('div');
            this.section.className = 'web-apps-section';

            // Create header
            this.header = document.createElement('div');
            this.header.className = 'web-apps-header';

            // Collapse toggle button
            const collapseBtn = document.createElement('button');
            collapseBtn.className = 'web-apps-collapse-btn';
            collapseBtn.title = 'Toggle Applications section';
            collapseBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16">
                <path fill="currentColor" d="M7 10l5 5 5-5z"/>
            </svg>`;
            collapseBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.toggleCollapse();
            });

            // Title
            const title = document.createElement('span');
            title.className = 'web-apps-title';
            title.textContent = '📱 APPLICATIONS';

            // Add app button
            const addBtn = document.createElement('button');
            addBtn.className = 'web-apps-add-btn';
            addBtn.title = 'Add Web App (Ctrl+Alt+A)';
            addBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16">
                <path fill="currentColor" d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
            </svg>`;
            addBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.openAddDialog();
            });

            // Assemble header
            this.header.appendChild(collapseBtn);
            this.header.appendChild(title);
            this.header.appendChild(addBtn);

            // Create list container
            this.list = document.createElement('div');
            this.list.className = 'web-apps-list';

            // Add web apps to list
            const apps = this.manager.getAll();
            if (apps.length === 0) {
                // Empty state
                const emptyState = document.createElement('div');
                emptyState.className = 'web-apps-empty';
                emptyState.textContent = 'No web apps yet. Add one to get started!';
                this.list.appendChild(emptyState);
            } else {
                // Add each app
                for (const app of apps) {
                    const item = this.createAppItem(app);
                    this.list.appendChild(item);
                }
            }

            // Assemble section
            this.section.appendChild(this.header);
            this.section.appendChild(this.list);

            // Apply collapse state
            if (this.collapsed) {
                this.section.classList.add('collapsed');
            }

            // Add to container
            this.container.appendChild(this.section);

            logger.debug('webApps', 'WebAppsPanel rendered');
        } catch (error) {
            logger.error('webApps', 'Error rendering WebAppsPanel:', error.message);
        }
    }

    /**
     * Create a single web app item element
     */
    createAppItem(app) {
        const item = document.createElement('div');
        item.className = 'web-app-item';
        item.draggable = true;
        item.dataset.appId = app.id;

        // Icon
        const icon = document.createElement('img');
        icon.className = 'web-app-icon';
        icon.src = app.icon || 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZmlsbD0iIzAwNzhENCIgZD0iTTEyIDJDNi40OCAyIDIgNi40OCAyIDEyczQuNDggMTAgMTAgMTAgMTAtNC40OCAxMC0xMFMxNy41MiAyIDEyIDJ6bS0yIDE1bC01LTUgMS40MS0xLjQxTDEwIDE0LjE3bDcuNTktNy41OUwxOSA4bC05IDl6Ii8+PC9zdmc+';
        icon.alt = app.name;
        icon.onerror = () => {
            // Fallback if icon fails to load
            icon.src = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZmlsbD0iIzAwNzhENCIgZD0iTTEyIDJDNi40OCAyIDIgNi40OCAyIDEyczQuNDggMTAgMTAgMTAgMTAtNC40OCAxMC0xMFMxNy41MiAyIDEyIDJ6Ii8+PC9zdmc+';
        };

        // Name
        const name = document.createElement('span');
        name.className = 'web-app-name';
        name.textContent = app.name;
        name.title = app.url;

        // Click handler - open web app
        item.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.openWebApp(app);
        });

        // Right-click handler - context menu
        item.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.showContextMenu(app, e.clientX, e.clientY);
        });

        // Drag handlers for reordering
        item.addEventListener('dragstart', (e) => {
            this.draggedItem = item;
            item.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/html', item.innerHTML);
        });

        item.addEventListener('dragend', (e) => {
            item.classList.remove('dragging');
            if (this.dragOverItem) {
                this.dragOverItem.classList.remove('drag-over');
                this.dragOverItem = null;
            }
            this.draggedItem = null;
        });

        item.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';

            if (item !== this.draggedItem) {
                this.dragOverItem = item;
                item.classList.add('drag-over');
            }
        });

        item.addEventListener('dragleave', (e) => {
            if (e.target === item) {
                item.classList.remove('drag-over');
            }
        });

        item.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();

            if (this.draggedItem && item !== this.draggedItem) {
                this.reorderApps(this.draggedItem.dataset.appId, item.dataset.appId);
            }
        });

        // Assemble item
        item.appendChild(icon);
        item.appendChild(name);

        return item;
    }

    /**
     * Reorder web apps - swap positions
     */
    async reorderApps(draggedId, targetId) {
        try {
            const apps = this.manager.getAll();
            const draggedIndex = apps.findIndex(a => a.id === draggedId);
            const targetIndex = apps.findIndex(a => a.id === targetId);

            if (draggedIndex === -1 || targetIndex === -1) return;

            // Swap
            [apps[draggedIndex], apps[targetIndex]] = [apps[targetIndex], apps[draggedIndex]];

            // Get new order
            const orderedIds = apps.map(a => a.id);

            // Update
            await this.manager.reorderWebApps(orderedIds);
            logger.debug('webApps', 'Web apps reordered');
        } catch (error) {
            logger.error('webApps', 'Error reordering web apps:', error.message);
        }
    }

    /**
     * Open a web app in browser pane
     */
    openWebApp(app) {
        logger.debug('webApps', `Opening web app: ${app.name}`);
        eventBus.emit('webapp:open', app);
    }

    /**
     * Open add web app dialog
     */
    openAddDialog() {
        logger.debug('webApps', 'Opening add web app dialog');
        eventBus.emit('webapp:add', {});
    }

    /**
     * Show context menu for web app
     */
    showContextMenu(app, x, y) {
        const items = [
            {
                label: 'Open',
                action: () => this.openWebApp(app)
            },
            {
                label: 'Edit',
                action: () => this.editWebApp(app)
            },
            {
                label: 'Copy URL',
                action: () => this.copyUrl(app.url)
            },
            {
                label: 'Open in Browser',
                action: () => this.openInSystemBrowser(app.url)
            },
            { type: 'separator' },
            {
                label: 'Delete',
                action: () => this.deleteWebApp(app),
                className: 'context-menu-danger'
            }
        ];

        if (this.contextMenu) {
            this.contextMenu.destroy();
        }

        this.contextMenu = new ContextMenu(items, x, y);
        this.contextMenu.show();
    }

    /**
     * Edit web app
     */
    editWebApp(app) {
        logger.debug('webApps', `Editing web app: ${app.name}`);
        eventBus.emit('webapp:edit', app);
    }

    /**
     * Copy URL to clipboard
     */
    async copyUrl(url) {
        try {
            if (navigator.clipboard) {
                await navigator.clipboard.writeText(url);
                logger.debug('webApps', 'URL copied to clipboard');
            }
        } catch (error) {
            logger.warn('webApps', 'Failed to copy URL:', error.message);
        }
    }

    /**
     * Open URL in system default browser
     */
    openInSystemBrowser(url) {
        try {
            if (window.electronAPI && window.electronAPI.openExternal) {
                window.electronAPI.openExternal(url);
                logger.debug('webApps', 'Opened URL in system browser:', url);
            }
        } catch (error) {
            logger.warn('webApps', 'Failed to open URL in browser:', error.message);
        }
    }

    /**
     * Delete web app with confirmation
     */
    async deleteWebApp(app) {
        try {
            // Show confirmation dialog
            const modal = require('./Modal');
            const confirmed = await modal.confirm(
                'Delete Web App',
                `Are you sure you want to delete "${app.name}"? This cannot be undone.`
            );

            if (!confirmed) return;

            // Delete
            await this.manager.deleteWebApp(app.id);
            logger.info('webApps', `Deleted web app: ${app.name}`);
        } catch (error) {
            logger.error('webApps', 'Error deleting web app:', error.message);
        }
    }

    /**
     * Toggle collapse state
     */
    async toggleCollapse() {
        try {
            await this.manager.toggleSectionCollapsed();
            logger.debug('webApps', 'Section collapse toggled');
        } catch (error) {
            logger.error('webApps', 'Error toggling section collapse:', error.message);
        }
    }

    /**
     * Update collapse state visually
     */
    updateCollapseState() {
        if (!this.section) return;

        if (this.collapsed) {
            this.section.classList.add('collapsed');
        } else {
            this.section.classList.remove('collapsed');
        }
    }

    /**
     * Cleanup
     */
    destroy() {
        eventBus.off('webapp:added');
        eventBus.off('webapp:updated');
        eventBus.off('webapp:deleted');
        eventBus.off('webapp:reordered');
        eventBus.off('webapp:sectionToggled');

        if (this.contextMenu) {
            this.contextMenu.destroy();
        }

        if (this.container) {
            this.container.innerHTML = '';
        }

        logger.info('webApps', '✓ WebAppsPanel destroyed');
    }
}

module.exports = WebAppsPanel;

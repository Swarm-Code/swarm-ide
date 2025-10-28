/**
 * ContextMenu - Right-click context menu for code editor
 *
 * Provides context menu with:
 * - LSP actions (Go to Definition, Find References, Rename)
 * - Editor actions (Cut, Copy, Paste, Format)
 * - File actions (Reveal in File Manager)
 *
 * Usage:
 *   const menu = new ContextMenu(actions);
 *   menu.show(x, y);
 */

class ContextMenu {
    // Static registry to track all active menus
    static activeMenus = new Set();

    constructor(actions = []) {
        this.actions = actions;
        this.menuElement = null;
        this.isVisible = false;

        this.createMenu();
        this.setupEventListeners();
        
        // Register this menu
        ContextMenu.activeMenus.add(this);
    }

    /**
     * Create menu element
     */
    createMenu() {
        this.menuElement = document.createElement('div');
        this.menuElement.className = 'context-menu';
        // Set essential styles for positioning
        this.menuElement.style.display = 'none';
        this.menuElement.style.position = 'fixed';
        this.menuElement.style.zIndex = '10000';
        document.body.appendChild(this.menuElement);
    }

    /**
     * Setup global event listeners
     */
    setupEventListeners() {
        // Close all menus on click outside
        this._handleOutsideClick = (e) => {
            if (this.isVisible && this.menuElement && !this.menuElement.contains(e.target)) {
                this.hide();
            }
        };

        // Close menu on Escape key
        this._handleEscapeKey = (e) => {
            if (e.key === 'Escape' && this.isVisible) {
                this.hide();
            }
        };

        // Close menu on scroll
        this._handleScroll = () => {
            if (this.isVisible) {
                this.hide();
            }
        };
    }

    /**
     * Attach event listeners when menu is shown
     */
    attachListeners() {
        if (!this._listenersAttached) {
            document.addEventListener('click', this._handleOutsideClick);
            document.addEventListener('keydown', this._handleEscapeKey);
            document.addEventListener('scroll', this._handleScroll, true);
            this._listenersAttached = true;
        }
    }

    /**
     * Detach event listeners when menu is hidden
     */
    detachListeners() {
        if (this._listenersAttached) {
            document.removeEventListener('click', this._handleOutsideClick);
            document.removeEventListener('keydown', this._handleEscapeKey);
            document.removeEventListener('scroll', this._handleScroll, true);
            this._listenersAttached = false;
        }
    }

    /**
     * Show context menu at position
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     * @param {Array} actions - Menu actions
     */
    show(x, y, actions = null) {
        console.log('[ContextMenu] show() called at:', x, y, 'with', actions ? actions.length : 0, 'actions');
        
        // Close all other menus first
        ContextMenu.closeAllMenus();
        
        if (actions) {
            this.actions = actions;
        }

        // Render menu items
        this.render();

        // Position menu
        this.menuElement.style.left = `${x}px`;
        this.menuElement.style.top = `${y}px`;
        this.menuElement.style.display = 'block';

        // Adjust position if menu goes off-screen
        this.adjustPosition();

        this.isVisible = true;
        
        // Attach event listeners
        this.attachListeners();
        
        console.log('[ContextMenu] Menu displayed successfully');
    }

    /**
     * Close all active context menus (static method)
     */
    static closeAllMenus() {
        ContextMenu.activeMenus.forEach(menu => {
            if (menu.isVisible) {
                menu.hide();
            }
        });
    }

    /**
     * Hide context menu
     */
    hide() {
        this.menuElement.style.display = 'none';
        this.isVisible = false;
        // Detach event listeners
        this.detachListeners();
    }

    /**
     * Render menu items
     */
    render() {
        this.menuElement.innerHTML = '';

        this.actions.forEach((action, index) => {
            if (action.type === 'separator') {
                const separator = document.createElement('div');
                separator.className = 'context-menu-separator';
                this.menuElement.appendChild(separator);
            } else {
                const item = this.createMenuItem(action);
                this.menuElement.appendChild(item);
            }
        });
    }

    /**
     * Create menu item element
     * @param {Object} action - Action object
     * @returns {HTMLElement} Menu item element
     */
    createMenuItem(action) {
        const item = document.createElement('div');
        item.className = 'context-menu-item';

        if (action.disabled) {
            item.classList.add('disabled');
        }

        // Label
        const label = document.createElement('span');
        label.className = 'context-menu-label';
        label.textContent = action.label;
        item.appendChild(label);

        // Keyboard shortcut
        if (action.shortcut) {
            const shortcut = document.createElement('span');
            shortcut.className = 'context-menu-shortcut';
            shortcut.textContent = action.shortcut;
            item.appendChild(shortcut);
        }

        // Click handler
        if (!action.disabled && action.onClick) {
            item.addEventListener('click', (e) => {
                console.log('[ContextMenu] Menu item clicked:', action.label);
                e.stopPropagation();
                e.preventDefault();
                // Execute action and then hide
                try {
                    action.onClick();
                } catch (error) {
                    console.error('[ContextMenu] Error executing action:', error);
                }
                this.hide();
            });
        }

        return item;
    }

    /**
     * Adjust menu position if it goes off-screen
     */
    adjustPosition() {
        const rect = this.menuElement.getBoundingClientRect();
        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;

        // Adjust horizontal position
        if (rect.right > windowWidth) {
            const newLeft = windowWidth - rect.width - 10;
            this.menuElement.style.left = `${Math.max(10, newLeft)}px`;
        }

        // Adjust vertical position
        if (rect.bottom > windowHeight) {
            const newTop = windowHeight - rect.height - 10;
            this.menuElement.style.top = `${Math.max(10, newTop)}px`;
        }
    }

    /**
     * Destroy menu
     */
    destroy() {
        // Detach listeners first
        this.detachListeners();
        
        // Remove from active menus registry
        ContextMenu.activeMenus.delete(this);
        
        // Remove from DOM
        if (this.menuElement && this.menuElement.parentNode) {
            this.menuElement.parentNode.removeChild(this.menuElement);
        }
        
        this.menuElement = null;
        this.isVisible = false;
    }
}

module.exports = ContextMenu;

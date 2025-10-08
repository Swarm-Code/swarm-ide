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
    constructor(actions = []) {
        this.actions = actions;
        this.menuElement = null;
        this.isVisible = false;

        this.createMenu();
        this.setupEventListeners();
    }

    /**
     * Create menu element
     */
    createMenu() {
        this.menuElement = document.createElement('div');
        this.menuElement.className = 'context-menu';
        this.menuElement.style.display = 'none';
        document.body.appendChild(this.menuElement);
    }

    /**
     * Setup global event listeners
     */
    setupEventListeners() {
        // Close menu on click outside
        document.addEventListener('click', (e) => {
            if (this.isVisible && !this.menuElement.contains(e.target)) {
                this.hide();
            }
        });

        // Close menu on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isVisible) {
                this.hide();
            }
        });

        // Close menu on scroll
        document.addEventListener('scroll', () => {
            if (this.isVisible) {
                this.hide();
            }
        }, true);
    }

    /**
     * Show context menu at position
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     * @param {Array} actions - Menu actions
     */
    show(x, y, actions = null) {
        console.log('[ContextMenu] show() called at:', x, y, 'with', actions ? actions.length : 0, 'actions');
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
        console.log('[ContextMenu] Menu displayed successfully');
    }

    /**
     * Hide context menu
     */
    hide() {
        this.menuElement.style.display = 'none';
        this.isVisible = false;
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
                action.onClick();
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
        if (this.menuElement && this.menuElement.parentNode) {
            this.menuElement.parentNode.removeChild(this.menuElement);
        }
        this.menuElement = null;
        this.isVisible = false;
    }
}

module.exports = ContextMenu;

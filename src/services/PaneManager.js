/**
 * PaneManager - Manages dynamic pane layout with split views
 *
 * Handles creation, splitting, closing, and resizing of panes.
 * Supports both horizontal and vertical splits with draggable handles.
 * Integrates with existing components (Browser, FileViewer, etc).
 * Provides serialization/deserialization for workspace persistence.
 */

const eventBus = require('../modules/EventBus');

// Simple UUID generator
function generateId() {
    return 'pane-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
}

// Throttle utility to prevent event flooding
function throttle(func, delay) {
    let timeoutId = null;
    let lastExec = 0;

    return function(...args) {
        const context = this;
        const now = Date.now();

        if (now - lastExec >= delay) {
            lastExec = now;
            func.apply(context, args);
        }
    };
}

class PaneManager {
    constructor(container) {
        this.container = container;
        this.panes = new Map(); // paneId → pane object
        this.rootPane = null;
        this.activePane = null;
        this.minPaneSize = 100; // Minimum pane size in pixels
        this.resizing = null; // Track current resize operation
        this.dragOverlay = null; // Drag overlay element
        this.isDragging = false; // Track drag state

        // Drag performance tracking
        this.dragMetrics = {
            startTime: 0,
            startMemory: 0,
            eventCount: 0,
            dragenterCount: 0,
            dragoverCount: 0,
            codeMirrorEvents: 0,
            lastLogTime: 0,
            initialCursorCount: 0,
            currentCursorCount: 0
        };

        // Monitor for cursor creation during drag
        this.cursorMonitor = null;

        console.log('[PaneManager] Initialized');
    }

    /**
     * Initialize the pane manager and create root pane
     */
    init() {
        // Create root pane container
        this.container.innerHTML = '';
        this.container.style.cssText = 'position: relative; width: 100%; height: 100%; overflow: hidden;';

        // Create initial root pane
        this.rootPane = this.createRootPane();

        // Setup global event listeners
        this.setupGlobalListeners();

        // Setup drag overlay
        this.setupDragOverlay();

        console.log('[PaneManager] Root pane created:', this.rootPane.id);
        return this.rootPane;
    }

    /**
     * Create root pane
     */
    createRootPane() {
        const paneId = generateId();
        const paneElement = this.createPaneElement(paneId, {
            position: 'absolute',
            top: '0',
            left: '0',
            right: '0',
            bottom: '0'
        });

        const pane = {
            id: paneId,
            element: paneElement,
            contentContainer: paneElement.querySelector('.pane-content'),
            tabBarContainer: null, // Will be set when tabs are created
            parent: null,
            children: [],
            split: null, // 'horizontal' | 'vertical'
            content: null, // Current content component
            contentType: null, // 'browser' | 'file-viewer' | 'terminal' | etc
            filePath: null, // Path of file currently open in this pane
            metadata: {}, // Additional metadata for content
            tabs: [], // Array of tab objects: { id, filePath, title, content, contentType }
            activeTabId: null // ID of currently active tab
        };

        this.panes.set(paneId, pane);
        this.container.appendChild(paneElement);
        this.activePane = pane;

        return pane;
    }

    /**
     * Create pane DOM element
     */
    createPaneElement(paneId, styles) {
        const paneElement = document.createElement('div');
        paneElement.className = 'pane';
        paneElement.dataset.paneId = paneId;

        // Apply styles
        Object.assign(paneElement.style, styles);

        // Create pane header
        const header = document.createElement('div');
        header.className = 'pane-header';
        header.draggable = true;

        const title = document.createElement('span');
        title.className = 'pane-title';
        title.textContent = 'Empty Pane';

        const actions = document.createElement('div');
        actions.className = 'pane-actions';

        const splitHBtn = document.createElement('button');
        splitHBtn.className = 'pane-action-btn';
        splitHBtn.innerHTML = '⬌';
        splitHBtn.title = 'Split Horizontal';
        splitHBtn.onclick = () => this.splitPane(paneId, 'horizontal');

        const splitVBtn = document.createElement('button');
        splitVBtn.className = 'pane-action-btn';
        splitVBtn.innerHTML = '⬍';
        splitVBtn.title = 'Split Vertical';
        splitVBtn.onclick = () => this.splitPane(paneId, 'vertical');

        const closeBtn = document.createElement('button');
        closeBtn.className = 'pane-action-btn';
        closeBtn.innerHTML = '✕';
        closeBtn.title = 'Close Pane';
        closeBtn.onclick = () => this.closePane(paneId);

        actions.appendChild(splitHBtn);
        actions.appendChild(splitVBtn);
        actions.appendChild(closeBtn);

        header.appendChild(title);
        header.appendChild(actions);

        // Create content container
        const content = document.createElement('div');
        content.className = 'pane-content';

        paneElement.appendChild(header);
        paneElement.appendChild(content);

        // Setup drag handlers
        this.setupPaneDragHandlers(header, paneId);

        // Setup click handler to set active pane
        paneElement.addEventListener('click', (e) => {
            // Don't interfere with button clicks
            if (!e.target.closest('.pane-action-btn')) {
                this.setActivePane(paneId);
            }
        });

        // Setup drag and drop handlers for files
        let currentDropZone = null;
        let isOverTabBar = false;

        // Add dragenter to catch events early
        paneElement.addEventListener('dragenter', (e) => {
            if (this.isDragging) {
                this.dragMetrics.eventCount++;
                this.dragMetrics.dragenterCount++;

                // Check if target is CodeMirror element
                const isCodeMirror = e.target.closest('.CodeMirror') !== null;
                if (isCodeMirror) {
                    this.dragMetrics.codeMirrorEvents++;

                    // Log periodically (every 500ms) to avoid spam
                    const now = performance.now();
                    if (now - this.dragMetrics.lastLogTime > 500) {
                        console.warn('[PaneManager] ⚠️ DRAG EVENT REACHING CODEMIRROR!', e.target.className);
                        console.warn('[PaneManager] CodeMirror events so far:', this.dragMetrics.codeMirrorEvents);
                        this.dragMetrics.lastLogTime = now;
                    }
                }
            }

            const hasTextData = e.dataTransfer.types.includes('text/plain') || e.dataTransfer.types.includes('application/x-file-path');
            const hasExternalFiles = e.dataTransfer.types.includes('Files');

            if (hasTextData && !hasExternalFiles) {
                e.preventDefault();
                e.stopPropagation();
            }
        });

        // Throttled logging function
        const throttledLog = throttle((msg, data) => {
            console.log(msg, data);
        }, 500); // Log at most once per 500ms

        // Throttled zone update function
        const throttledZoneUpdate = throttle((zone, paneEl) => {
            console.log('[PaneManager] Zone changed to:', zone);
            this.showDropZone(paneEl, zone);
        }, 100); // Update zone at most 10 times per second

        paneElement.addEventListener('dragover', (e) => {
            try {
                if (this.isDragging) {
                    this.dragMetrics.eventCount++;
                    this.dragMetrics.dragoverCount++;

                    // Check if target is CodeMirror element
                    const isCodeMirror = e.target.closest('.CodeMirror') !== null;
                    if (isCodeMirror) {
                        this.dragMetrics.codeMirrorEvents++;
                    }
                }

                // Only handle internal drags (from file explorer), not external file drops
                const hasTextData = e.dataTransfer.types.includes('text/plain') || e.dataTransfer.types.includes('application/x-file-path');
                const hasExternalFiles = e.dataTransfer.types.includes('Files');

                if (!hasTextData || hasExternalFiles) {
                    // This is an external file drop, let it bubble to the editor
                    return;
                }

                e.preventDefault();
                e.stopPropagation();
                e.dataTransfer.dropEffect = 'copy';

                // Show overlay on first dragover if we're in a drag operation
                if (this.isDragging && this.dragOverlay && this.dragOverlay.style.display === 'none') {
                    this.showDragOverlay();
                    console.log('[PaneManager] First dragover detected - showing overlay');
                }

                // Get the current pane state
                const currentPane = this.panes.get(paneId);
                if (!currentPane) return;

                // If this is a split container pane (not a leaf), ignore drops
                if (currentPane.split) {
                    this.clearDropZones();
                    return;
                }

                // Check if dragging over tab bar
                const tabBar = e.target.closest('.pane-tab-bar');
                if (tabBar) {
                    // Dragging over tab bar - will open as tab
                    if (!isOverTabBar) {
                        isOverTabBar = true;
                        this.clearDropZones();
                        paneElement.classList.add('drag-over-tab');
                        currentDropZone = null;
                        console.log('[PaneManager] Dragover tab bar - will open as tab');
                    }
                    return;
                }

                if (isOverTabBar) {
                    isOverTabBar = false;
                    paneElement.classList.remove('drag-over-tab');
                }

                // Check if dragging over content area
                const contentArea = e.target.closest('.pane-content');
                if (contentArea) {
                    // Determine which quadrant the cursor is in
                    const rect = contentArea.getBoundingClientRect();
                    const x = e.clientX - rect.left;
                    const y = e.clientY - rect.top;
                    const width = rect.width;
                    const height = rect.height;

                    // Calculate zones (30% edge zones for splits, larger center for tab)
                    const edgeThreshold = 0.3;
                    let zone = 'center';

                    if (x < width * edgeThreshold) {
                        zone = 'left';
                    } else if (x > width * (1 - edgeThreshold)) {
                        zone = 'right';
                    } else if (y < height * edgeThreshold) {
                        zone = 'top';
                    } else if (y > height * (1 - edgeThreshold)) {
                        zone = 'bottom';
                    }

                    // Show appropriate drop zone only if changed
                    if (zone !== currentDropZone) {
                        currentDropZone = zone;
                        this.showDropZone(paneElement, zone);
                        throttledLog('[PaneManager] Zone:', zone);
                    }
                }
            } catch (error) {
                console.error('[PaneManager] Error in dragover handler:', error);
            }
        });

        paneElement.addEventListener('dragleave', (e) => {
            // Check if actually leaving the pane
            if (!paneElement.contains(e.relatedTarget)) {
                paneElement.classList.remove('drag-over-tab');
                this.clearDropZones();
                currentDropZone = null;
                isOverTabBar = false;
            }
        });

        paneElement.addEventListener('drop', (e) => {
            try {
                console.log('[PaneManager] DROP event on pane:', paneId);

                // Check if this is an internal drag (from file explorer)
                const filePath = e.dataTransfer.getData('text/plain') || e.dataTransfer.getData('application/x-file-path');

                if (!filePath) {
                    // Not an internal drag, let it bubble
                    this.clearDropZones();
                    paneElement.classList.remove('drag-over-tab');
                    return;
                }

                e.preventDefault();
                e.stopPropagation();
                paneElement.classList.remove('drag-over-tab');

                console.log('[PaneManager] Drop detected:', { paneId, filePath, zone: currentDropZone, isOverTabBar });

            // Get current pane state
            const currentPane = this.panes.get(paneId);
            if (!currentPane || currentPane.split) {
                this.clearDropZones();
                return;
            }

            // Check if dropped on tab bar or center zone
            if (isOverTabBar || currentDropZone === 'center' || !currentDropZone) {
                // Open as tab
                console.log('[PaneManager] File dropped as tab:', paneId, filePath);
                eventBus.emit('pane:request-file-open', {
                    paneId: paneId,
                    filePath: filePath
                });
            } else {
                // Split pane and open in new split
                console.log('[PaneManager] File dropped to split pane:', paneId, currentDropZone, filePath);

                // Determine split direction based on zone
                const direction = (currentDropZone === 'left' || currentDropZone === 'right') ? 'horizontal' : 'vertical';

                // Split the pane
                this.splitPane(paneId, direction);

                // Get the newly created child panes
                const splitPane = this.panes.get(paneId);
                if (splitPane && splitPane.children.length === 2) {
                    // Determine which child to open the file in
                    const targetChild = (currentDropZone === 'left' || currentDropZone === 'top')
                        ? splitPane.children[0]
                        : splitPane.children[1];

                    // Open file in the target child
                    setTimeout(() => {
                        eventBus.emit('pane:request-file-open', {
                            paneId: targetChild.id,
                            filePath: filePath
                        });
                    }, 100);
                }
            }

                this.clearDropZones();
                currentDropZone = null;
                isOverTabBar = false;
            } catch (error) {
                console.error('[PaneManager] Error in drop handler:', error);
                this.clearDropZones();
            }
        });

        return paneElement;
    }

    /**
     * Split a pane horizontally or vertically
     */
    splitPane(paneId, direction) {
        console.log(`[PaneManager] Splitting pane ${paneId} ${direction}`);

        const pane = this.panes.get(paneId);
        if (!pane) {
            console.error('[PaneManager] Pane not found:', paneId);
            return;
        }

        // Can't split if already has children
        if (pane.children.length > 0) {
            console.warn('[PaneManager] Pane already split:', paneId);
            return;
        }

        // Get current bounds
        const bounds = pane.element.getBoundingClientRect();
        const parentBounds = pane.element.parentElement.getBoundingClientRect();

        // Calculate relative positions
        const relativeTop = pane.element.offsetTop;
        const relativeLeft = pane.element.offsetLeft;
        const width = bounds.width;
        const height = bounds.height;

        // Save existing content AND tabs before clearing
        const existingContentChildren = Array.from(pane.contentContainer.children);
        const existingContentType = pane.contentType;
        const existingTitle = pane.element.querySelector('.pane-title')?.textContent || 'Empty Pane';
        const existingTabs = pane.tabs || [];
        const existingActiveTabId = pane.activeTabId;
        const existingTabBar = pane.tabBarContainer;

        // Clear current pane content
        pane.contentContainer.innerHTML = '';
        if (existingTabBar) {
            existingTabBar.remove();
        }
        pane.tabBarContainer = null;
        pane.tabs = [];
        pane.activeTabId = null;
        pane.split = direction;

        // Create two child panes
        const child1Id = generateId();
        const child2Id = generateId();

        let child1Styles, child2Styles, handleStyles;

        if (direction === 'horizontal') {
            // Split left/right
            const splitPos = width / 2;

            child1Styles = {
                position: 'absolute',
                top: '0',
                left: '0',
                width: `${splitPos - 2}px`,
                bottom: '0'
            };

            child2Styles = {
                position: 'absolute',
                top: '0',
                left: `${splitPos + 2}px`,
                right: '0',
                bottom: '0'
            };

            handleStyles = {
                position: 'absolute',
                top: '0',
                left: `${splitPos - 2}px`,
                width: '4px',
                bottom: '0',
                cursor: 'ew-resize',
                backgroundColor: '#3e3e42',
                zIndex: 1000
            };
        } else {
            // Split top/bottom
            const splitPos = height / 2;

            child1Styles = {
                position: 'absolute',
                top: '0',
                left: '0',
                right: '0',
                height: `${splitPos - 2}px`
            };

            child2Styles = {
                position: 'absolute',
                top: `${splitPos + 2}px`,
                left: '0',
                right: '0',
                bottom: '0'
            };

            handleStyles = {
                position: 'absolute',
                top: `${splitPos - 2}px`,
                left: '0',
                right: '0',
                height: '4px',
                cursor: 'ns-resize',
                backgroundColor: '#3e3e42',
                zIndex: 1000
            };
        }

        // Create child panes
        const child1Element = this.createPaneElement(child1Id, child1Styles);
        const child2Element = this.createPaneElement(child2Id, child2Styles);

        const child1 = {
            id: child1Id,
            element: child1Element,
            contentContainer: child1Element.querySelector('.pane-content'),
            tabBarContainer: null,
            parent: pane,
            children: [],
            split: null,
            content: null,
            contentType: null,
            filePath: null,
            metadata: {},
            tabs: [],
            activeTabId: null
        };

        const child2 = {
            id: child2Id,
            element: child2Element,
            contentContainer: child2Element.querySelector('.pane-content'),
            tabBarContainer: null,
            parent: pane,
            children: [],
            split: null,
            content: null,
            contentType: null,
            filePath: null,
            metadata: {},
            tabs: [],
            activeTabId: null
        };

        // Create resize handle
        const handle = document.createElement('div');
        handle.className = 'pane-resize-handle';
        Object.assign(handle.style, handleStyles);
        handle.dataset.paneId = paneId;
        handle.dataset.direction = direction;

        // Setup resize handler
        this.setupResizeHandle(handle, child1, child2, direction);

        // Add to DOM
        pane.element.appendChild(child1Element);
        pane.element.appendChild(handle);
        pane.element.appendChild(child2Element);

        // Update pane tracking
        pane.children = [child1, child2];
        pane.handle = handle;
        this.panes.set(child1Id, child1);
        this.panes.set(child2Id, child2);

        // Store the file path if there was one
        const existingFilePath = pane.filePath;

        // Move existing content AND tabs to first child pane
        if (existingContentChildren.length > 0) {
            // Move all content children (for tabs)
            existingContentChildren.forEach(child => {
                child1.contentContainer.appendChild(child);
            });

            child1.contentType = existingContentType;
            child1.content = existingContentChildren[existingContentChildren.length - 1]; // Last visible content
            child1.filePath = existingFilePath;

            // Transfer tabs
            child1.tabs = existingTabs;
            child1.activeTabId = existingActiveTabId;

            // Transfer tab bar
            if (existingTabBar) {
                child1.element.insertBefore(existingTabBar, child1.contentContainer);
                child1.tabBarContainer = existingTabBar;

                // FIX BUG 1: Re-render tab bar so onclick handlers capture child1.id instead of parent pane.id
                // This fixes the "Pane not found" error when closing tabs after a split
                this.renderTabBar(child1);
            }

            // Update child1 title
            const child1TitleElement = child1.element.querySelector('.pane-title');
            if (child1TitleElement) {
                child1TitleElement.textContent = existingTitle;
            }

            console.log('[PaneManager] Moved existing content to child1');
        }

        // DO NOT auto-duplicate the file to child2
        // The drop handler or splitPane caller will handle opening files in child2
        // This prevents the bug where drag-dropping a file adds it as a tab instead of replacing content

        // FIX BUG 2: Set second child (new empty pane) as active so files open there
        // This fixes the issue where opening files after split adds them to child1 instead of child2
        this.setActivePane(child2Id);

        console.log('[PaneManager] Split complete:', { parent: paneId, child1: child1Id, child2: child2Id });

        eventBus.emit('pane:split', { paneId, direction, child1: child1Id, child2: child2Id });
    }

    /**
     * Close a pane
     */
    closePane(paneId) {
        console.log('[PaneManager] Closing pane:', paneId);

        const pane = this.panes.get(paneId);
        if (!pane) {
            console.error('[PaneManager] Pane not found:', paneId);
            return;
        }

        // Can't close root pane if it's the only one
        if (!pane.parent && this.panes.size === 1) {
            console.warn('[PaneManager] Cannot close last pane');
            return;
        }

        const parent = pane.parent;
        if (!parent) {
            console.warn('[PaneManager] Cannot close root pane with children');
            return;
        }

        // Find sibling
        const siblings = parent.children.filter(c => c.id !== paneId);
        if (siblings.length !== 1) {
            console.error('[PaneManager] Invalid sibling count:', siblings.length);
            return;
        }

        const sibling = siblings[0];

        // Remove pane element
        pane.element.remove();
        this.panes.delete(paneId);

        // Remove resize handle
        if (parent.handle) {
            parent.handle.remove();
            parent.handle = null;
        }

        // Promote sibling to parent's position
        sibling.element.style.position = 'absolute';
        sibling.element.style.top = '0';
        sibling.element.style.left = '0';
        sibling.element.style.right = '0';
        sibling.element.style.bottom = '0';
        sibling.element.style.width = '';
        sibling.element.style.height = '';

        parent.children = [];
        parent.split = null;
        parent.contentContainer.innerHTML = '';

        // Move sibling's content to parent
        if (sibling.children.length > 0) {
            // Sibling is split, move its structure
            parent.children = sibling.children;
            parent.split = sibling.split;
            parent.handle = sibling.handle;

            sibling.children.forEach(child => {
                child.parent = parent;
                parent.element.appendChild(child.element);
            });

            if (sibling.handle) {
                parent.element.appendChild(sibling.handle);
            }
        } else {
            // Sibling is leaf, move its content AND tabs
            parent.content = sibling.content;
            parent.contentType = sibling.contentType;
            parent.filePath = sibling.filePath;

            // Transfer tabs array and active tab
            parent.tabs = sibling.tabs || [];
            parent.activeTabId = sibling.activeTabId;

            // Transfer tab bar if it exists
            if (sibling.tabBarContainer) {
                // Remove tab bar from sibling
                sibling.tabBarContainer.remove();
                // Add to parent before content container
                parent.element.insertBefore(sibling.tabBarContainer, parent.contentContainer);
                parent.tabBarContainer = sibling.tabBarContainer;
            }

            // Move ALL children from sibling's content container (for tabs)
            while (sibling.contentContainer.firstChild) {
                parent.contentContainer.appendChild(sibling.contentContainer.firstChild);
            }
        }

        // Remove sibling
        sibling.element.remove();
        this.panes.delete(sibling.id);

        // Update active pane
        if (this.activePane?.id === paneId) {
            this.setActivePane(parent.id);
        }

        console.log('[PaneManager] Pane closed:', paneId);
        eventBus.emit('pane:closed', { paneId });
    }

    /**
     * Setup resize handle
     */
    setupResizeHandle(handle, pane1, pane2, direction) {
        let startPos = 0;
        let startSize1 = 0;
        let startSize2 = 0;

        const onMouseDown = (e) => {
            e.preventDefault();
            startPos = direction === 'horizontal' ? e.clientX : e.clientY;

            const rect1 = pane1.element.getBoundingClientRect();
            const rect2 = pane2.element.getBoundingClientRect();

            startSize1 = direction === 'horizontal' ? rect1.width : rect1.height;
            startSize2 = direction === 'horizontal' ? rect2.width : rect2.height;

            this.resizing = { handle, pane1, pane2, direction };

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);

            handle.style.backgroundColor = '#0e639c';
        };

        const onMouseMove = (e) => {
            if (!this.resizing) return;

            const currentPos = direction === 'horizontal' ? e.clientX : e.clientY;
            const delta = currentPos - startPos;

            const newSize1 = startSize1 + delta;
            const newSize2 = startSize2 - delta;

            // Enforce minimum sizes
            if (newSize1 < this.minPaneSize || newSize2 < this.minPaneSize) {
                return;
            }

            if (direction === 'horizontal') {
                pane1.element.style.width = `${newSize1}px`;
                pane1.element.style.right = '';
                pane2.element.style.left = `${newSize1 + 4}px`;
                handle.style.left = `${newSize1}px`;
            } else {
                pane1.element.style.height = `${newSize1}px`;
                pane1.element.style.bottom = '';
                pane2.element.style.top = `${newSize1 + 4}px`;
                handle.style.top = `${newSize1}px`;
            }
        };

        const onMouseUp = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);

            if (handle) {
                handle.style.backgroundColor = '#3e3e42';
            }

            this.resizing = null;
        };

        handle.addEventListener('mousedown', onMouseDown);
    }

    /**
     * Setup drag handlers for pane header
     */
    setupPaneDragHandlers(header, paneId) {
        header.addEventListener('dragstart', (e) => {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', paneId);

            // Add dragging class
            const pane = this.panes.get(paneId);
            if (pane) {
                pane.element.classList.add('dragging');
            }

            console.log('[PaneManager] Drag start:', paneId);
        });

        header.addEventListener('dragend', (e) => {
            // Remove dragging class
            const pane = this.panes.get(paneId);
            if (pane) {
                pane.element.classList.remove('dragging');
            }

            // Remove all drop zone indicators
            document.querySelectorAll('.drop-zone').forEach(el => el.remove());
        });
    }

    /**
     * Show drop zone indicator
     */
    showDropZone(paneElement, zone) {
        this.clearDropZones();

        const contentArea = paneElement.querySelector('.pane-content');
        if (!contentArea) return;

        const dropZone = document.createElement('div');
        dropZone.className = 'pane-drop-zone';
        dropZone.dataset.zone = zone;

        const rect = contentArea.getBoundingClientRect();
        const paneRect = paneElement.getBoundingClientRect();

        // Position based on zone
        switch (zone) {
            case 'left':
                dropZone.style.left = '0';
                dropZone.style.top = '0';
                dropZone.style.width = '50%';
                dropZone.style.height = '100%';
                break;
            case 'right':
                dropZone.style.right = '0';
                dropZone.style.top = '0';
                dropZone.style.width = '50%';
                dropZone.style.height = '100%';
                break;
            case 'top':
                dropZone.style.left = '0';
                dropZone.style.top = '0';
                dropZone.style.width = '100%';
                dropZone.style.height = '50%';
                break;
            case 'bottom':
                dropZone.style.left = '0';
                dropZone.style.bottom = '0';
                dropZone.style.width = '100%';
                dropZone.style.height = '50%';
                break;
            case 'center':
                dropZone.style.left = '0';
                dropZone.style.top = '0';
                dropZone.style.width = '100%';
                dropZone.style.height = '100%';
                break;
        }

        contentArea.appendChild(dropZone);
    }

    /**
     * Clear all drop zone indicators
     */
    clearDropZones() {
        document.querySelectorAll('.pane-drop-zone').forEach(zone => zone.remove());
    }

    /**
     * Setup drag overlay to prevent editor interference
     */
    setupDragOverlay() {
        // Create overlay element (hidden by default)
        this.dragOverlay = document.createElement('div');
        this.dragOverlay.className = 'pane-drag-overlay';
        this.dragOverlay.style.cssText = `
            position: fixed;
            top: 32px;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: rgba(0, 0, 0, 0.01);
            z-index: 9999;
            pointer-events: none;
            display: none;
        `;
        document.body.appendChild(this.dragOverlay);

        // Listen for drag events from file explorer
        eventBus.on('explorer:drag-start', (data) => {
            console.log('[PaneManager] ========== DRAG START ==========');
            this.isDragging = true;

            // Add class to disable editor interaction
            document.body.classList.add('dragging-file');
            console.log('[PaneManager] Added dragging-file class to body');

            // Reset and start tracking metrics
            this.dragMetrics = {
                startTime: performance.now(),
                startMemory: performance.memory ? performance.memory.usedJSHeapSize : 0,
                eventCount: 0,
                dragenterCount: 0,
                dragoverCount: 0,
                codeMirrorEvents: 0,
                lastLogTime: performance.now()
            };

            console.log('[PaneManager] Initial memory:', (this.dragMetrics.startMemory / 1048576).toFixed(2), 'MB');

            // Count initial cursors
            this.dragMetrics.initialCursorCount = document.querySelectorAll('.CodeMirror-cursor').length;
            console.log('[PaneManager] Initial cursor count:', this.dragMetrics.initialCursorCount);

            // Monitor cursor creation during drag
            this.startCursorMonitoring();

            // Don't show overlay immediately - let native drag start first
            // Show it on first dragover event instead
        });

        eventBus.on('explorer:drag-end', () => {
            // Remove class to re-enable editor interaction
            document.body.classList.remove('dragging-file');
            console.log('[PaneManager] Removed dragging-file class from body');

            // Stop cursor monitoring
            this.stopCursorMonitoring();

            const endTime = performance.now();
            const endMemory = performance.memory ? performance.memory.usedJSHeapSize : 0;
            const duration = endTime - this.dragMetrics.startTime;
            const memoryDelta = (endMemory - this.dragMetrics.startMemory) / 1048576;
            const finalCursorCount = document.querySelectorAll('.CodeMirror-cursor').length;
            const cursorDelta = finalCursorCount - this.dragMetrics.initialCursorCount;

            console.log('[PaneManager] ========== DRAG END ==========');
            console.log('[PaneManager] Duration:', duration.toFixed(2), 'ms');
            console.log('[PaneManager] Total events:', this.dragMetrics.eventCount);
            console.log('[PaneManager] DRAGENTER events:', this.dragMetrics.dragenterCount);
            console.log('[PaneManager] DRAGOVER events:', this.dragMetrics.dragoverCount);
            console.log('[PaneManager] CodeMirror events:', this.dragMetrics.codeMirrorEvents);
            console.log('[PaneManager] Memory delta:', memoryDelta.toFixed(2), 'MB');
            console.log('[PaneManager] Events/sec:', (this.dragMetrics.eventCount / (duration / 1000)).toFixed(0));
            console.log('[PaneManager] Initial cursors:', this.dragMetrics.initialCursorCount);
            console.log('[PaneManager] Final cursors:', finalCursorCount);
            console.log('[PaneManager] Cursors created:', cursorDelta);
            if (cursorDelta > 0) {
                console.warn('[PaneManager] ⚠️ WARNING: Cursors were created during drag!');
            }
            console.log('[PaneManager] ================================');

            this.hideDragOverlay();
        });

        // Setup drag handlers on overlay
        this.dragOverlay.addEventListener('dragover', (e) => {
            if (!this.isDragging) return;

            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = 'copy';

            this.handleOverlayDragOver(e);
        });

        this.dragOverlay.addEventListener('drop', (e) => {
            if (!this.isDragging) return;

            e.preventDefault();
            e.stopPropagation();

            this.handleOverlayDrop(e);
            this.hideDragOverlay();
        });

        this.dragOverlay.addEventListener('dragleave', (e) => {
            // Only hide if leaving the overlay entirely
            if (e.target === this.dragOverlay && !this.dragOverlay.contains(e.relatedTarget)) {
                this.clearDropZones();
            }
        });
    }

    /**
     * Show drag overlay
     */
    showDragOverlay() {
        this.isDragging = true;
        if (this.dragOverlay) {
            this.dragOverlay.style.display = 'block';
            // Keep pointer-events: none to not interfere with drag operation
            this.dragOverlay.style.pointerEvents = 'none';
        }
    }

    /**
     * Hide drag overlay
     */
    hideDragOverlay() {
        this.isDragging = false;
        if (this.dragOverlay) {
            this.dragOverlay.style.display = 'none';
            this.dragOverlay.style.pointerEvents = 'none';
        }
        this.clearDropZones();
    }

    /**
     * Handle drag over on overlay
     */
    handleOverlayDragOver(e) {
        // Find which pane we're over
        const x = e.clientX;
        const y = e.clientY;

        let targetPane = null;
        let targetPaneElement = null;

        // Find the topmost pane at this position
        for (const [paneId, pane] of this.panes) {
            if (pane.split) continue; // Skip container panes

            const rect = pane.element.getBoundingClientRect();
            if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
                targetPane = pane;
                targetPaneElement = pane.element;
                break;
            }
        }

        if (!targetPane || !targetPaneElement) {
            this.clearDropZones();
            return;
        }

        // Check if over tab bar
        const tabBar = targetPaneElement.querySelector('.pane-tab-bar');
        if (tabBar) {
            const tabBarRect = tabBar.getBoundingClientRect();
            if (y >= tabBarRect.top && y <= tabBarRect.bottom) {
                this.clearDropZones();
                targetPaneElement.classList.add('drag-over-tab');
                targetPane._currentDropZone = 'tab-bar';
                return;
            }
        }

        targetPaneElement.classList.remove('drag-over-tab');

        // Calculate drop zone based on position
        const rect = targetPane.contentContainer.getBoundingClientRect();
        const relX = x - rect.left;
        const relY = y - rect.top;
        const width = rect.width;
        const height = rect.height;

        const edgeThreshold = 0.3;
        let zone = 'center';

        if (relX < width * edgeThreshold) {
            zone = 'left';
        } else if (relX > width * (1 - edgeThreshold)) {
            zone = 'right';
        } else if (relY < height * edgeThreshold) {
            zone = 'top';
        } else if (relY > height * (1 - edgeThreshold)) {
            zone = 'bottom';
        }

        if (targetPane._currentDropZone !== zone) {
            targetPane._currentDropZone = zone;
            this.showDropZone(targetPaneElement, zone);
        }
    }

    /**
     * Handle drop on overlay
     */
    handleOverlayDrop(e) {
        const filePath = e.dataTransfer.getData('text/plain') || e.dataTransfer.getData('application/x-file-path');
        if (!filePath) return;

        // Find which pane we dropped on
        const x = e.clientX;
        const y = e.clientY;

        let targetPane = null;

        for (const [paneId, pane] of this.panes) {
            if (pane.split) continue;

            const rect = pane.element.getBoundingClientRect();
            if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
                targetPane = pane;
                break;
            }
        }

        if (!targetPane) return;

        const zone = targetPane._currentDropZone || 'center';
        console.log('[PaneManager] Drop on overlay:', { paneId: targetPane.id, zone, filePath });

        // Clear drop indicators
        targetPane.element.classList.remove('drag-over-tab');
        targetPane._currentDropZone = null;

        // Handle drop based on zone
        if (zone === 'tab-bar' || zone === 'center') {
            // Open as tab
            eventBus.emit('pane:request-file-open', {
                paneId: targetPane.id,
                filePath: filePath
            });
        } else {
            // Split pane
            const direction = (zone === 'left' || zone === 'right') ? 'horizontal' : 'vertical';
            this.splitPane(targetPane.id, direction);

            const splitPane = this.panes.get(targetPane.id);
            if (splitPane && splitPane.children.length === 2) {
                const targetChild = (zone === 'left' || zone === 'top')
                    ? splitPane.children[0]
                    : splitPane.children[1];

                setTimeout(() => {
                    eventBus.emit('pane:request-file-open', {
                        paneId: targetChild.id,
                        filePath: filePath
                    });
                }, 100);
            }
        }
    }

    /**
     * Setup global event listeners
     */
    setupGlobalListeners() {
        // Prevent default drag over
        this.container.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
        });

        // Handle drop
        this.container.addEventListener('drop', (e) => {
            e.preventDefault();
            const draggedPaneId = e.dataTransfer.getData('text/plain');
            console.log('[PaneManager] Drop:', draggedPaneId);
            // TODO: Implement drop logic with drop zones
        });
    }

    /**
     * Set active pane
     */
    setActivePane(paneId) {
        // Remove active class from all panes
        this.panes.forEach(pane => {
            pane.element.classList.remove('active');
        });

        // Add active class to target pane
        const pane = this.panes.get(paneId);
        if (pane) {
            pane.element.classList.add('active');
            this.activePane = pane;
            console.log('[PaneManager] Active pane:', paneId);
            eventBus.emit('pane:activated', { paneId });
        }
    }

    /**
     * Set pane content
     */
    setPaneContent(paneId, contentElement, contentType, title = 'Untitled', filePath = null, metadata = {}) {
        const pane = this.panes.get(paneId);
        if (!pane) {
            console.error('[PaneManager] Pane not found:', paneId);
            return;
        }

        // Clear existing content
        pane.contentContainer.innerHTML = '';

        // Add new content
        pane.contentContainer.appendChild(contentElement);
        pane.content = contentElement;
        pane.contentType = contentType;
        pane.filePath = filePath;
        pane.metadata = metadata;

        // Update title
        const titleElement = pane.element.querySelector('.pane-title');
        if (titleElement) {
            titleElement.textContent = title;
        }

        console.log('[PaneManager] Content set:', { paneId, contentType, title, filePath });
    }

    /**
     * Get pane by ID
     */
    getPane(paneId) {
        return this.panes.get(paneId);
    }

    /**
     * Get active pane
     */
    getActivePane() {
        return this.activePane;
    }

    /**
     * Ensure tab bar exists for a pane
     */
    ensureTabBar(pane) {
        if (pane.tabBarContainer) return;

        // Create tab bar container
        const tabBar = document.createElement('div');
        tabBar.className = 'pane-tab-bar';

        // Insert tab bar before content
        pane.element.insertBefore(tabBar, pane.contentContainer);
        pane.tabBarContainer = tabBar;
    }

    /**
     * Add a tab to a pane
     */
    addTab(paneId, filePath, title, content, contentType, lineNumber = null) {
        console.log('[PaneManager] addTab called:', { paneId, filePath, title, contentType, lineNumber });

        const pane = this.panes.get(paneId);
        if (!pane) {
            console.error('[PaneManager] Pane not found:', paneId);
            return null;
        }

        console.log('[PaneManager] Current pane state:', {
            id: pane.id,
            existingTabs: pane.tabs.length,
            currentTitle: pane.element.querySelector('.pane-title')?.textContent
        });

        // Generate tab ID
        const tabId = 'tab-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);

        // Check if file is already open in a tab
        const existingTab = pane.tabs.find(tab => tab.filePath === filePath);
        if (existingTab) {
            console.log('[PaneManager] File already open in tab, switching to it:', existingTab.id);
            // Switch to existing tab and navigate to line if specified
            this.switchTab(paneId, existingTab.id, lineNumber);
            return existingTab.id;
        }

        // Create tab object
        const tab = {
            id: tabId,
            filePath,
            title,
            content,
            contentType
        };

        console.log('[PaneManager] Creating new tab:', { tabId, title, filePath });

        // Add to tabs array
        pane.tabs.push(tab);

        // Ensure tab bar exists
        this.ensureTabBar(pane);

        // Render tab bar
        this.renderTabBar(pane);

        // Set as active tab
        console.log('[PaneManager] Switching to new tab:', tabId);
        this.switchTab(paneId, tabId);

        console.log('[PaneManager] ✓ Tab added successfully:', { paneId, tabId, title });
        eventBus.emit('tab:added', { paneId, tabId, title, filePath });
        return tabId;
    }

    /**
     * Render tab bar for a pane
     */
    renderTabBar(pane) {
        if (!pane.tabBarContainer) return;

        pane.tabBarContainer.innerHTML = '';

        pane.tabs.forEach(tab => {
            const tabElement = document.createElement('div');
            tabElement.className = 'pane-tab' + (tab.id === pane.activeTabId ? ' active' : '');
            tabElement.dataset.tabId = tab.id;

            const tabTitle = document.createElement('span');
            tabTitle.className = 'pane-tab-title';
            tabTitle.textContent = tab.title;

            const tabClose = document.createElement('button');
            tabClose.className = 'pane-tab-close';
            tabClose.innerHTML = '✕';
            tabClose.onclick = (e) => {
                e.stopPropagation();
                this.closeTab(pane.id, tab.id);
            };

            tabElement.appendChild(tabTitle);
            tabElement.appendChild(tabClose);

            tabElement.onclick = () => {
                this.switchTab(pane.id, tab.id);
            };

            pane.tabBarContainer.appendChild(tabElement);
        });
    }

    /**
     * Switch to a tab
     */
    switchTab(paneId, tabId, lineNumber = null) {
        const pane = this.panes.get(paneId);
        if (!pane) {
            console.error('[PaneManager] Pane not found:', paneId);
            return;
        }

        const tab = pane.tabs.find(t => t.id === tabId);
        if (!tab) {
            console.error('[PaneManager] Tab not found:', tabId);
            return;
        }

        console.log('[PaneManager] ========== SWITCHING TAB ==========');
        console.log('[PaneManager] Switching to tab:', { paneId, tabId, title: tab.title, filePath: tab.filePath, lineNumber });
        console.log('[PaneManager] Tab content element:', tab.content);
        console.log('[PaneManager] Tab content dataset:', tab.content.dataset);

        // CRITICAL FIX: Don't destroy DOM elements - just hide/show them
        // Hide all tab contents first and ensure they have absolute positioning
        pane.tabs.forEach(t => {
            if (t.content) {
                console.log('[PaneManager] Processing tab:', {
                    id: t.id,
                    title: t.title,
                    filePath: t.filePath,
                    contentElement: t.content,
                    isActiveTab: t.id === tabId
                });

                // Ensure absolute positioning for overlay (not stacking)
                t.content.style.position = 'absolute';
                t.content.style.top = '0';
                t.content.style.left = '0';
                t.content.style.right = '0';
                t.content.style.bottom = '0';

                if (t.content.parentElement === pane.contentContainer) {
                    t.content.style.display = 'none';
                    console.log('[PaneManager] Hiding tab:', t.title, 'filePath:', t.filePath);

                    // Log the actual DOM content preview
                    const previewElement = t.content.querySelector('.CodeMirror, pre, code, img, video');
                    if (previewElement) {
                        console.log('[PaneManager] Content preview for', t.title, ':', previewElement.className, previewElement.tagName);
                    }
                }
            }
        });

        // Ensure the active tab content is in the DOM
        if (!tab.content.parentElement) {
            console.log('[PaneManager] Adding tab content to DOM:', tab.title);
            pane.contentContainer.appendChild(tab.content);
        }

        // Ensure absolute positioning for the active tab
        tab.content.style.position = 'absolute';
        tab.content.style.top = '0';
        tab.content.style.left = '0';
        tab.content.style.right = '0';
        tab.content.style.bottom = '0';

        // Show the active tab content
        tab.content.style.display = 'flex';
        console.log('[PaneManager] Showing tab:', tab.title, 'filePath:', tab.filePath);

        // Log the actual DOM content being shown
        const activePreviewElement = tab.content.querySelector('.CodeMirror, pre, code, img, video');
        if (activePreviewElement) {
            console.log('[PaneManager] Active content preview:', activePreviewElement.className, activePreviewElement.tagName);

            // For CodeMirror, log the actual content (first 5 lines)
            if (activePreviewElement.CodeMirror) {
                const first5Lines = [];
                for (let i = 0; i < 5; i++) {
                    const line = activePreviewElement.CodeMirror.getLine(i);
                    if (line !== null && line !== undefined) {
                        first5Lines.push(`Line ${i}: ${line.substring(0, 80)}`);
                    }
                }
                console.log('[PaneManager] CodeMirror first 5 lines:', first5Lines.join(' | '));
            }
        }

        // Log a text snippet from the visible content
        const textContent = tab.content.textContent?.substring(0, 200) || '';
        console.log('[PaneManager] Visible text snippet:', textContent);

        // Update pane state
        pane.content = tab.content;
        pane.contentType = tab.contentType;
        pane.filePath = tab.filePath;
        pane.activeTabId = tabId;

        // Update tab bar
        this.renderTabBar(pane);

        // Update pane title - CRITICAL: This updates the header title
        const titleElement = pane.element.querySelector('.pane-title');
        if (titleElement) {
            console.log('[PaneManager] Updating pane title from', titleElement.textContent, 'to', tab.title);
            titleElement.textContent = tab.title;
        } else {
            console.warn('[PaneManager] ⚠️ Could not find pane title element for pane:', paneId);
        }

        console.log('[PaneManager] ✓ Switched to tab successfully:', { paneId, tabId, title: tab.title });
        console.log('[PaneManager] ========================================');
        eventBus.emit('tab:switched', { paneId, tabId, filePath: tab.filePath });

        // Navigate to line number if specified (for search results, etc.)
        // Note: CodeMirror refresh is handled by TextEditor itself, no need to duplicate here
        if (lineNumber !== null && lineNumber !== undefined) {
            // Small delay to ensure DOM is ready
            setTimeout(() => {
                console.log('[PaneManager] Navigating to line in existing tab:', lineNumber);
                // Access the FileViewer instance through the stored property
                const fileViewerInstance = tab.content._fileViewerInstance;
                if (fileViewerInstance && fileViewerInstance.textEditor) {
                    console.log('[PaneManager] Found TextEditor instance, calling goToLine');
                    fileViewerInstance.textEditor.goToLine(lineNumber);
                } else {
                    console.warn('[PaneManager] Could not access TextEditor instance for line navigation');
                }
            }, 10);
        }
    }

    /**
     * Close a tab
     */
    closeTab(paneId, tabId) {
        const pane = this.panes.get(paneId);
        if (!pane) {
            console.error('[PaneManager] Pane not found:', paneId);
            return;
        }

        const tabIndex = pane.tabs.findIndex(t => t.id === tabId);
        if (tabIndex === -1) {
            console.error('[PaneManager] Tab not found:', tabId);
            return;
        }

        // Remove tab
        const tab = pane.tabs[tabIndex];

        // Remove tab content from DOM before removing from array
        if (tab.content && tab.content.parentElement) {
            tab.content.remove();
        }

        pane.tabs.splice(tabIndex, 1);

        // If closing active tab, switch to another
        if (pane.activeTabId === tabId) {
            if (pane.tabs.length > 0) {
                // Switch to previous tab, or first tab if this was the first
                const newActiveIndex = tabIndex > 0 ? tabIndex - 1 : 0;
                this.switchTab(paneId, pane.tabs[newActiveIndex].id);
            } else {
                // No more tabs, clear content
                pane.contentContainer.innerHTML = '';
                pane.content = null;
                pane.contentType = null;
                pane.filePath = null;
                pane.activeTabId = null;

                // Remove tab bar if no tabs
                if (pane.tabBarContainer) {
                    pane.tabBarContainer.remove();
                    pane.tabBarContainer = null;
                }

                // Show empty state
                const emptyState = document.createElement('div');
                emptyState.style.cssText = 'display: flex; align-items: center; justify-content: center; height: 100%; width: 100%; color: #888;';
                emptyState.textContent = 'No files open';
                pane.contentContainer.appendChild(emptyState);

                // Update pane title
                const titleElement = pane.element.querySelector('.pane-title');
                if (titleElement) {
                    titleElement.textContent = 'Empty Pane';
                }
            }
        } else {
            // Just remove from tab bar
            this.renderTabBar(pane);
        }

        console.log('[PaneManager] Tab closed:', { paneId, tabId });
        eventBus.emit('tab:closed', { paneId, tabId, filePath: tab.filePath });
    }

    /**
     * Serialize layout to JSON
     */
    serializeLayout() {
        const serializePane = (pane) => {
            const data = {
                id: pane.id,
                contentType: pane.contentType,
                split: pane.split,
                filePath: pane.filePath,
                tabs: pane.tabs.map(tab => ({
                    id: tab.id,
                    filePath: tab.filePath,
                    title: tab.title,
                    contentType: tab.contentType
                })),
                activeTabId: pane.activeTabId,
                children: pane.children.map(child => serializePane(child))
            };

            // Add content-specific data
            if (pane.contentType) {
                data.contentData = this.serializeContentData(pane);
            }

            return data;
        };

        return serializePane(this.rootPane);
    }

    /**
     * Serialize content-specific data
     */
    serializeContentData(pane) {
        // Override this method to serialize specific content types
        return {};
    }

    /**
     * Deserialize layout from JSON
     */
    async deserializeLayout(data) {
        console.log('[PaneManager] Restoring layout:', data);

        if (!data) {
            console.warn('[PaneManager] No layout data to restore');
            return;
        }

        // Clear current layout
        this.container.innerHTML = '';
        this.panes.clear();
        this.rootPane = null;
        this.activePane = null;

        // Restore pane structure
        this.rootPane = await this.restorePane(data, null);
        if (this.rootPane) {
            this.container.appendChild(this.rootPane.element);
            this.setActivePane(this.rootPane.id);
        }

        console.log('[PaneManager] Layout restored successfully');
    }

    /**
     * Restore a pane and its children from serialized data
     */
    async restorePane(data, parent) {
        console.log('[PaneManager] Restoring pane:', data.id);

        // Determine pane styles based on whether it's root or child
        let styles = {};
        if (!parent) {
            // Root pane
            styles = {
                position: 'absolute',
                top: '0',
                left: '0',
                right: '0',
                bottom: '0'
            };
        } else if (parent.split === 'horizontal') {
            // Child of horizontal split
            styles = {
                position: 'absolute',
                top: '0',
                bottom: '0',
                width: '50%'
            };
        } else if (parent.split === 'vertical') {
            // Child of vertical split
            styles = {
                position: 'absolute',
                left: '0',
                right: '0',
                height: '50%'
            };
        }

        // Create pane element
        const paneElement = this.createPaneElement(data.id, styles);

        // Create pane object
        const pane = {
            id: data.id,
            element: paneElement,
            contentContainer: paneElement.querySelector('.pane-content'),
            tabBarContainer: null,
            parent: parent,
            children: [],
            split: data.split,
            content: null,
            contentType: data.contentType,
            filePath: data.filePath,
            metadata: {},
            tabs: [],
            activeTabId: null
        };

        this.panes.set(data.id, pane);

        // If this pane has children (is split), restore them
        if (data.split && data.children && data.children.length === 2) {
            console.log('[PaneManager] Restoring split pane with children');

            // Update pane to be a container
            pane.split = data.split;
            pane.element.classList.add('pane-container');

            // Restore children
            const child1 = await this.restorePane(data.children[0], pane);
            const child2 = await this.restorePane(data.children[1], pane);

            pane.children.push(child1, child2);

            // Position children
            if (data.split === 'horizontal') {
                child1.element.style.left = '0';
                child2.element.style.right = '0';
            } else {
                child1.element.style.top = '0';
                child2.element.style.bottom = '0';
            }

            // Add children to container
            pane.contentContainer.appendChild(child1.element);
            pane.contentContainer.appendChild(child2.element);

            // Add resize handle
            const handle = document.createElement('div');
            handle.className = 'pane-resize-handle';
            if (data.split === 'horizontal') {
                handle.style.cssText = 'position: absolute; left: 50%; top: 0; bottom: 0; width: 4px; transform: translateX(-50%); cursor: ew-resize; z-index: 100;';
            } else {
                handle.style.cssText = 'position: absolute; top: 50%; left: 0; right: 0; height: 4px; transform: translateY(-50%); cursor: ns-resize; z-index: 100;';
            }
            pane.contentContainer.appendChild(handle);
            pane.handle = handle;
            this.setupResizeHandle(handle, pane);
        } else if (data.tabs && data.tabs.length > 0) {
            // This is a leaf pane with tabs - restore them
            console.log('[PaneManager] Restoring pane with', data.tabs.length, 'tabs');

            for (const tabData of data.tabs) {
                // Request the file to be opened in this pane
                // We'll do this asynchronously to avoid blocking
                setTimeout(() => {
                    eventBus.emit('pane:request-file-open', {
                        paneId: pane.id,
                        filePath: tabData.filePath
                    });
                }, 50);
            }
        }

        return pane;
    }

    /**
     * Start monitoring cursor creation during drag
     */
    startCursorMonitoring() {
        // Check cursor count every 100ms during drag
        this.cursorMonitor = setInterval(() => {
            const currentCount = document.querySelectorAll('.CodeMirror-cursor').length;
            if (currentCount > this.dragMetrics.initialCursorCount) {
                const delta = currentCount - this.dragMetrics.initialCursorCount;
                console.warn('[PaneManager] ⚠️ CURSOR CREATED DURING DRAG! Total:', currentCount, 'Delta:', delta);
                this.dragMetrics.currentCursorCount = currentCount;
            }
        }, 100);
    }

    /**
     * Stop monitoring cursor creation
     */
    stopCursorMonitoring() {
        if (this.cursorMonitor) {
            clearInterval(this.cursorMonitor);
            this.cursorMonitor = null;
        }
    }

    /**
     * Cleanup
     */
    destroy() {
        this.stopCursorMonitoring();
        this.panes.forEach(pane => {
            pane.element.remove();
        });
        this.panes.clear();
        this.rootPane = null;
        this.activePane = null;
        console.log('[PaneManager] Destroyed');
    }
}

module.exports = PaneManager;

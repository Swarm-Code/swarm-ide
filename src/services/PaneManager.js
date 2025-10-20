/**
 * PaneManager - Manages dynamic pane layout with split views
 *
 * Handles creation, splitting, closing, and resizing of panes.
 * Supports both horizontal and vertical splits with draggable handles.
 * Integrates with existing components (Browser, FileViewer, etc).
 * Provides serialization/deserialization for workspace persistence.
 */

const logger = require('../utils/Logger');
const eventBus = require('../modules/EventBus');

// CRITICAL FIX #9: Display property constants for consistency
// All visible content uses 'flex' for proper layout
const DISPLAY_VISIBLE = 'flex';
const DISPLAY_HIDDEN = 'none';

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
        this.currentTabDrag = null; // Track current tab drag (sourcePaneId, tabId)

        // CRITICAL FIX #2: Operation queue to prevent race conditions
        // Serializes tab/pane operations to prevent concurrent state mutations
        this.operationQueue = Promise.resolve();
        this.operationInProgress = false;

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

        logger.debug('paneCreate', 'Initialized');
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

        logger.debug('paneCreate', 'Root pane created:', this.rootPane.id);
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
                        logger.warn('paneCreate', '⚠️ DRAG EVENT REACHING CODEMIRROR!', e.target.className);
                        logger.warn('paneCreate', 'CodeMirror events so far:', this.dragMetrics.codeMirrorEvents);
                        this.dragMetrics.lastLogTime = now;
                    }
                }
            }

            const isTabDrag = e.dataTransfer.types.includes('application/x-tab-drag');
            const hasTextData = e.dataTransfer.types.includes('text/plain') || e.dataTransfer.types.includes('application/x-file-path');
            const hasExternalFiles = e.dataTransfer.types.includes('Files');

            if ((isTabDrag || hasTextData) && !hasExternalFiles) {
                e.preventDefault();
                e.stopPropagation();
            }
        });

        // Throttled logging function
        const throttledLog = throttle((msg, data) => {
            logger.debug('paneCreate', msg, data);
        }, 500); // Log at most once per 500ms

        // Throttled zone update function
        const throttledZoneUpdate = throttle((zone, paneEl) => {
            logger.trace('dragDrop', 'Zone changed to:', zone);
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

                // Check if this is a tab drag
                const isTabDrag = e.dataTransfer.types.includes('application/x-tab-drag');

                // Only handle internal drags (from file explorer OR tabs), not external file drops
                const hasTextData = e.dataTransfer.types.includes('text/plain') || e.dataTransfer.types.includes('application/x-file-path');
                const hasExternalFiles = e.dataTransfer.types.includes('Files');

                if (!isTabDrag && (!hasTextData || hasExternalFiles)) {
                    // This is an external file drop, let it bubble to the editor
                    return;
                }

                e.preventDefault();
                e.stopPropagation();
                e.dataTransfer.dropEffect = isTabDrag ? 'move' : 'copy';

                // Show overlay on first dragover if we're in a drag operation
                if (this.isDragging && this.dragOverlay && this.dragOverlay.style.display === 'none') {
                    this.showDragOverlay();
                    logger.trace('dragDrop', 'First dragover detected - showing overlay');
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
                    // Block this if dragging tab over its own pane
                    if (isTabDrag && this.currentTabDrag && currentPane.id === this.currentTabDrag.sourcePaneId) {
                        this.clearDropZones();
                        logger.trace('dragDrop', 'Cannot drop tab on source pane tab bar');
                        return;
                    }

                    if (!isOverTabBar) {
                        isOverTabBar = true;
                        this.clearDropZones();
                        paneElement.classList.add('drag-over-tab');
                        currentDropZone = null;
                        logger.trace('dragDrop', 'Dragover tab bar - will open as tab');
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

                    // CRITICAL: If dragging a tab over its source pane, only block CENTER zone drops
                    // Allow edge zone drops (left/right/top/bottom) because they create NEW panes
                    if (isTabDrag && this.currentTabDrag && currentPane.id === this.currentTabDrag.sourcePaneId) {
                        if (zone === 'center') {
                            // Block center drops on source pane
                            this.clearDropZones();
                            logger.trace('dragDrop', 'Cannot drop tab in center of source pane');
                            return;
                        }
                        // Allow edge drops - they will split the pane
                        logger.trace('dragDrop', 'Allowing edge drop on source pane to split it:', zone);
                    }

                    // Show appropriate drop zone only if changed
                    if (zone !== currentDropZone) {
                        currentDropZone = zone;
                        this.showDropZone(paneElement, zone);
                        throttledLog('Zone:', zone);
                    }
                }
            } catch (error) {
                logger.error('paneCreate', 'Error in dragover handler:', error);
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
                logger.trace('dragDrop', 'DROP event on pane:', paneId);

                // Check if this is a tab drag
                const isTabDrag = e.dataTransfer.types.includes('application/x-tab-drag');

                if (isTabDrag) {
                    // Handle tab drop
                    const tabDataStr = e.dataTransfer.getData('application/x-tab-data');
                    if (!tabDataStr) {
                        logger.error('paneCreate', 'No tab data in drop event');
                        this.clearDropZones();
                        return;
                    }

                    const tabData = JSON.parse(tabDataStr);
                    logger.trace('dragDrop', 'Tab drop detected:', { tabData, zone: currentDropZone, isOverTabBar });

                    e.preventDefault();
                    e.stopPropagation();
                    paneElement.classList.remove('drag-over-tab');

                    // Get current pane state
                    const currentPane = this.panes.get(paneId);
                    if (!currentPane || currentPane.split) {
                        this.clearDropZones();
                        return;
                    }

                    // Check if dropped on tab bar or center zone
                    if (isOverTabBar || currentDropZone === 'center' || !currentDropZone) {
                        // Move tab directly to this pane
                        logger.trace('dragDrop', 'Moving tab to existing pane:', paneId);
                        this.moveTab(tabData.sourcePaneId, tabData.tabId, paneId);
                    } else {
                        // Split pane first, then move tab to appropriate child
                        logger.trace('dragDrop', 'Splitting pane for tab:', paneId, currentDropZone);

                        // Determine split direction based on zone
                        const direction = (currentDropZone === 'left' || currentDropZone === 'right') ? 'horizontal' : 'vertical';

                        // Split the pane
                        this.splitPane(paneId, direction);

                        // Get the newly created child panes
                        const splitPane = this.panes.get(paneId);
                        if (splitPane && splitPane.children.length === 2) {
                            // Determine which child to move the tab to
                            const targetChild = (currentDropZone === 'left' || currentDropZone === 'top')
                                ? splitPane.children[0]
                                : splitPane.children[1];

                            // CRITICAL FIX #10: Use RAF instead of setTimeout for proper layout completion
                            // Move tab to the target child after layout is complete
                            requestAnimationFrame(() => {
                                requestAnimationFrame(() => {
                                    this.moveTab(tabData.sourcePaneId, tabData.tabId, targetChild.id);
                                });
                            });
                        }
                    }

                    this.clearDropZones();
                    currentDropZone = null;
                    isOverTabBar = false;
                    return;
                }

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

                logger.trace('dragDrop', 'Drop detected:', { paneId, filePath, zone: currentDropZone, isOverTabBar });

            // Get current pane state
            const currentPane = this.panes.get(paneId);
            if (!currentPane || currentPane.split) {
                this.clearDropZones();
                return;
            }

            // Check if dropped on tab bar or center zone
            if (isOverTabBar || currentDropZone === 'center' || !currentDropZone) {
                // Open as tab
                logger.trace('dragDrop', 'File dropped as tab:', paneId, filePath);
                eventBus.emit('pane:request-file-open', {
                    paneId: paneId,
                    filePath: filePath
                });
            } else {
                // Split pane and open in new split
                logger.trace('dragDrop', 'File dropped to split pane:', paneId, currentDropZone, filePath);

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

                    // CRITICAL FIX #10: Use RAF instead of setTimeout for proper layout completion
                    // Open file in the target child after layout is complete
                    requestAnimationFrame(() => {
                        requestAnimationFrame(() => {
                            eventBus.emit('pane:request-file-open', {
                                paneId: targetChild.id,
                                filePath: filePath
                            });
                        });
                    });
                }
            }

                this.clearDropZones();
                currentDropZone = null;
                isOverTabBar = false;
            } catch (error) {
                logger.error('paneCreate', 'Error in drop handler:', error);
                this.clearDropZones();
            }
        });

        return paneElement;
    }

    /**
     * Split a pane horizontally or vertically
     */
    splitPane(paneId, direction) {
        logger.debug('paneCreate', `Splitting pane ${paneId} ${direction}`);

        const pane = this.panes.get(paneId);
        if (!pane) {
            logger.error('paneCreate', 'Pane not found:', paneId);
            return;
        }

        // Can't split if already has children
        if (pane.children.length > 0) {
            logger.warn('paneCreate', 'Pane already split:', paneId);
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

            // CRITICAL FIX #4: Notify all tab content instances that their pane has changed
            // This ensures Terminals, Browsers, and FileViewers update their internal paneId references
            logger.debug('paneCreate', `Notifying ${child1.tabs.length} tabs of pane change from ${paneId} to ${child1.id}`);
            child1.tabs.forEach((tab, index) => {
                if (tab.content) {
                    try {
                        // Update Terminal instances - force resize to new container
                        if (tab.content._terminalInstance) {
                            logger.debug('paneCreate', `Tab ${index}: Resizing terminal after pane split`);
                            // Use RAF to ensure layout is complete before resizing
                            requestAnimationFrame(() => {
                                requestAnimationFrame(() => {
                                    try {
                                        tab.content._terminalInstance.resize();
                                    } catch (err) {
                                        logger.error('paneCreate', 'Error resizing terminal after split:', err);
                                    }
                                });
                            });
                        }

                        // Update Browser instances - critical to update paneId and recalculate bounds
                        if (tab.content._browserInstance) {
                            logger.debug('paneCreate', `Tab ${index}: Updating browser pane context from ${paneId} to ${child1.id}`);
                            tab.content._browserInstance.updatePaneContext(child1.id, tab.id);
                        }

                        // Update FileViewer instances - update paneId if tracked
                        if (tab.content._fileViewerInstance) {
                            logger.debug('paneCreate', `Tab ${index}: Updating file viewer pane reference`);
                            // FileViewer might track paneId for events/notifications
                            if (tab.content._fileViewerInstance.paneId !== undefined) {
                                tab.content._fileViewerInstance.paneId = child1.id;
                            }
                            // Force CodeMirror refresh after split
                            if (tab.content._fileViewerInstance.textEditor) {
                                requestAnimationFrame(() => {
                                    requestAnimationFrame(() => {
                                        try {
                                            tab.content._fileViewerInstance.textEditor.refresh();
                                        } catch (err) {
                                            logger.error('paneCreate', 'Error refreshing CodeMirror after split:', err);
                                        }
                                    });
                                });
                            }
                        }
                    } catch (error) {
                        logger.error('paneCreate', `Error notifying tab ${index} of pane change:`, error);
                    }
                }
            });

            logger.debug('paneCreate', 'Moved existing content to child1 and notified instances');
        }

        // DO NOT auto-duplicate the file to child2
        // The drop handler or splitPane caller will handle opening files in child2
        // This prevents the bug where drag-dropping a file adds it as a tab instead of replacing content

        // FIX BUG 2: Set second child (new empty pane) as active so files open there
        // This fixes the issue where opening files after split adds them to child1 instead of child2
        this.setActivePane(child2Id);

        logger.debug('paneCreate', 'Split complete:', { parent: paneId, child1: child1Id, child2: child2Id });

        eventBus.emit('pane:split', { paneId, direction, child1: child1Id, child2: child2Id });
    }

    /**
     * Close a pane
     * CRITICAL FIX #2: Now uses operation queue to prevent race conditions
     */
    closePane(paneId) {
        // CRITICAL FIX #2: Queue this operation to prevent concurrent mutations
        return this.queueOperation(`closePane(${paneId})`, () => {
            return this._closePaneInternal(paneId);
        });
    }

    /**
     * Internal close pane implementation (called by queued operation)
     * CRITICAL FIX #2: Extracted internal logic to separate method
     */
    _closePaneInternal(paneId) {
        logger.debug('paneCreate', 'Closing pane:', paneId);

        const pane = this.panes.get(paneId);
        if (!pane) {
            logger.error('paneCreate', 'Pane not found:', paneId);
            return;
        }

        // Can't close root pane if it's the only one
        if (!pane.parent && this.panes.size === 1) {
            logger.warn('paneCreate', 'Cannot close last pane');
            return;
        }

        const parent = pane.parent;
        if (!parent) {
            logger.warn('paneCreate', 'Cannot close root pane with children');
            return;
        }

        // Find sibling
        const siblings = parent.children.filter(c => c.id !== paneId);
        if (siblings.length !== 1) {
            logger.error('paneCreate', 'Invalid sibling count:', siblings.length);
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

                // CRITICAL FIX: Re-render tab bar to update onclick handlers
                // The moved tab bar's event handlers still reference sibling.id (about to be deleted)
                // Re-rendering creates new handlers that reference parent.id
                this.renderTabBar(parent);
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

        logger.debug('paneCreate', 'Pane closed:', paneId);
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

            logger.trace('dragDrop', 'Drag start:', paneId);
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
     * Setup drag handlers for tabs
     */
    setupTabDragHandlers(tabElement, paneId, tab) {
        tabElement.addEventListener('dragstart', (e) => {
            e.stopPropagation(); // Don't trigger pane drag

            // Track current tab drag
            this.currentTabDrag = {
                sourcePaneId: paneId,
                tabId: tab.id
            };

            // Set drag data
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('application/x-tab-drag', 'true'); // Mark as tab drag
            e.dataTransfer.setData('application/x-tab-data', JSON.stringify({
                sourcePaneId: paneId,
                tabId: tab.id,
                title: tab.title,
                contentType: tab.contentType,
                filePath: tab.filePath
            }));

            // Add visual feedback
            tabElement.classList.add('dragging-tab');

            // CRITICAL: Disable editor interaction during tab drag (same as file drag)
            document.body.classList.add('dragging-tab');
            logger.trace('dragDrop', 'Added dragging-tab class to body');

            logger.trace('dragDrop', 'Tab drag start:', { paneId, tabId: tab.id, title: tab.title });
        });

        tabElement.addEventListener('dragend', (e) => {
            // Remove dragging class
            tabElement.classList.remove('dragging-tab');

            // CRITICAL: Re-enable editor interaction
            document.body.classList.remove('dragging-tab');
            logger.trace('dragDrop', 'Removed dragging-tab class from body');

            // Clear drop zones
            this.clearDropZones();

            // Clear tab drag tracking
            this.currentTabDrag = null;

            logger.trace('dragDrop', 'Tab drag end');
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
            logger.trace('dragDrop', '========== DRAG START ==========');
            this.isDragging = true;

            // Add class to disable editor interaction
            document.body.classList.add('dragging-file');
            logger.trace('dragDrop', 'Added dragging-file class to body');

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

            logger.trace('dragDrop', 'Initial memory:', (this.dragMetrics.startMemory / 1048576).toFixed(2), 'MB');

            // Count initial cursors
            this.dragMetrics.initialCursorCount = document.querySelectorAll('.CodeMirror-cursor').length;
            logger.trace('dragDrop', 'Initial cursor count:', this.dragMetrics.initialCursorCount);

            // Monitor cursor creation during drag
            this.startCursorMonitoring();

            // Don't show overlay immediately - let native drag start first
            // Show it on first dragover event instead
        });

        eventBus.on('explorer:drag-end', () => {
            // Remove class to re-enable editor interaction
            document.body.classList.remove('dragging-file');
            logger.trace('dragDrop', 'Removed dragging-file class from body');

            // Stop cursor monitoring
            this.stopCursorMonitoring();

            const endTime = performance.now();
            const endMemory = performance.memory ? performance.memory.usedJSHeapSize : 0;
            const duration = endTime - this.dragMetrics.startTime;
            const memoryDelta = (endMemory - this.dragMetrics.startMemory) / 1048576;
            const finalCursorCount = document.querySelectorAll('.CodeMirror-cursor').length;
            const cursorDelta = finalCursorCount - this.dragMetrics.initialCursorCount;

            logger.trace('dragDrop', '========== DRAG END ==========');
            logger.trace('dragDrop', 'Duration:', duration.toFixed(2), 'ms');
            logger.trace('dragDrop', 'Total events:', this.dragMetrics.eventCount);
            logger.trace('dragDrop', 'DRAGENTER events:', this.dragMetrics.dragenterCount);
            logger.trace('dragDrop', 'DRAGOVER events:', this.dragMetrics.dragoverCount);
            logger.trace('dragDrop', 'CodeMirror events:', this.dragMetrics.codeMirrorEvents);
            logger.trace('dragDrop', 'Memory delta:', memoryDelta.toFixed(2), 'MB');
            logger.trace('dragDrop', 'Events/sec:', (this.dragMetrics.eventCount / (duration / 1000)).toFixed(0));
            logger.trace('dragDrop', 'Initial cursors:', this.dragMetrics.initialCursorCount);
            logger.trace('dragDrop', 'Final cursors:', finalCursorCount);
            logger.trace('dragDrop', 'Cursors created:', cursorDelta);
            if (cursorDelta > 0) {
                logger.warn('paneCreate', '⚠️ WARNING: Cursors were created during drag!');
            }
            logger.trace('dragDrop', '================================');

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
        logger.trace('dragDrop', 'Drop on overlay:', { paneId: targetPane.id, zone, filePath });

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

                // CRITICAL FIX #10: Use RAF instead of setTimeout for proper layout completion
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        eventBus.emit('pane:request-file-open', {
                            paneId: targetChild.id,
                            filePath: filePath
                        });
                    });
                });
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
            logger.trace('dragDrop', 'Drop:', draggedPaneId);
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
            logger.debug('paneCreate', 'Active pane:', paneId);
            eventBus.emit('pane:activated', { paneId });
        }
    }

    /**
     * Set pane content
     * CRITICAL FIX: Made async to properly await closeTab
     */
    async setPaneContent(paneId, contentElement, contentType, title = 'Untitled', filePath = null, metadata = {}) {
        const pane = this.panes.get(paneId);
        if (!pane) {
            logger.error('paneCreate', 'Pane not found:', paneId);
            return;
        }

        // CRITICAL FIX: Close all existing tabs before setting new content
        // This prevents orphaned tab state and memory leaks
        // Close in reverse order to avoid index issues
        if (pane.tabs && pane.tabs.length > 0) {
            logger.debug('paneCreate', 'Closing', pane.tabs.length, 'existing tabs before setting new content');
            const tabIds = pane.tabs.map(t => t.id);
            for (const tabId of tabIds) {
                await this.closeTab(paneId, tabId);
            }
        }

        // Clear existing content (should be empty after closing tabs, but be safe)
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

        logger.debug('paneCreate', 'Content set:', { paneId, contentType, title, filePath });
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
        logger.debug('paneCreate', 'addTab called:', { paneId, filePath, title, contentType, lineNumber });

        const pane = this.panes.get(paneId);
        if (!pane) {
            const errorMsg = `Cannot add tab: Pane ${paneId} not found`;
            logger.error('paneCreate', errorMsg);
            eventBus.emit('notification:show', {
                type: 'error',
                message: errorMsg
            });
            throw new Error(errorMsg);
        }

        logger.debug('paneCreate', 'Current pane state:', {
            id: pane.id,
            existingTabs: pane.tabs.length,
            currentTitle: pane.element.querySelector('.pane-title')?.textContent
        });

        // Generate tab ID
        const tabId = 'tab-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);

        // Check if file is already open in a tab
        const existingTab = pane.tabs.find(tab => tab.filePath === filePath);
        if (existingTab) {
            logger.debug('paneCreate', 'File already open in tab, switching to it:', existingTab.id);
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

        logger.debug('paneCreate', 'Creating new tab:', { tabId, title, filePath });

        // Add to tabs array
        pane.tabs.push(tab);

        // Ensure tab bar exists
        this.ensureTabBar(pane);

        // Render tab bar
        this.renderTabBar(pane);

        // Set as active tab
        logger.debug('paneCreate', 'Switching to new tab:', tabId);
        this.switchTab(paneId, tabId);

        logger.debug('paneCreate', '✓ Tab added successfully:', { paneId, tabId, title });
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

            // Make tab draggable
            tabElement.draggable = true;

            const tabTitle = document.createElement('span');
            tabTitle.className = 'pane-tab-title';
            tabTitle.textContent = tab.title;

            const tabClose = document.createElement('button');
            tabClose.className = 'pane-tab-close';
            tabClose.innerHTML = '✕';
            tabClose.onclick = async (e) => {
                e.stopPropagation();
                try {
                    // CRITICAL FIX: Await closeTab to properly cleanup browser instances
                    await this.closeTab(pane.id, tab.id);
                } catch (error) {
                    logger.error('paneCreate', 'Error closing tab from UI:', error);
                    // Show user notification
                    eventBus.emit('notification:show', {
                        type: 'error',
                        message: `Failed to close tab: ${error.message}`
                    });
                }
            };

            tabElement.appendChild(tabTitle);
            tabElement.appendChild(tabClose);

            tabElement.onclick = () => {
                try {
                    this.switchTab(pane.id, tab.id);
                } catch (error) {
                    logger.error('paneCreate', 'Error switching tab from UI:', error);
                    // Show user notification
                    eventBus.emit('notification:show', {
                        type: 'error',
                        message: `Failed to switch tab: ${error.message}`
                    });
                }
            };

            // Setup drag handlers for tab
            this.setupTabDragHandlers(tabElement, pane.id, tab);

            pane.tabBarContainer.appendChild(tabElement);
        });
    }

    /**
     * Switch to a tab
     */
    switchTab(paneId, tabId, lineNumber = null) {
        const pane = this.panes.get(paneId);
        if (!pane) {
            const errorMsg = `Cannot switch tab: Pane ${paneId} not found`;
            logger.error('paneCreate', errorMsg);
            eventBus.emit('notification:show', {
                type: 'error',
                message: errorMsg
            });
            throw new Error(errorMsg);
        }

        const tab = pane.tabs.find(t => t.id === tabId);
        if (!tab) {
            const errorMsg = `Cannot switch tab: Tab ${tabId} not found in pane ${paneId}`;
            logger.error('paneCreate', errorMsg);
            eventBus.emit('notification:show', {
                type: 'error',
                message: errorMsg
            });
            throw new Error(errorMsg);
        }

        logger.trace('tabSwitch', '========== SWITCHING TAB ==========');
        logger.trace('tabSwitch', 'Switching to tab:', { paneId, tabId, title: tab.title, filePath: tab.filePath, lineNumber });
        logger.trace('tabSwitch', 'Tab content element:', tab.content);
        logger.trace('tabSwitch', 'Tab content dataset:', tab.content.dataset);

        // CRITICAL FIX: Don't destroy DOM elements - just hide/show them
        // CRITICAL FIX #9: Use DISPLAY_HIDDEN constant for consistency
        // Hide all tab contents first and ensure they have absolute positioning
        pane.tabs.forEach(t => {
            if (t.content) {
                logger.trace('tabSwitch', 'Processing tab:', {
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
                    t.content.style.display = DISPLAY_HIDDEN;
                    logger.trace('tabSwitch', 'Hiding tab:', t.title, 'filePath:', t.filePath);

                    // Log the actual DOM content preview
                    const previewElement = t.content.querySelector('.CodeMirror, pre, code, img, video');
                    if (previewElement) {
                        logger.trace('tabSwitch', 'Content preview for', t.title, ':', previewElement.className, previewElement.tagName);
                    }
                }
            }
        });

        // Ensure the active tab content is in the DOM
        if (!tab.content.parentElement) {
            logger.trace('tabSwitch', 'Adding tab content to DOM:', tab.title);
            pane.contentContainer.appendChild(tab.content);
        }

        // Ensure absolute positioning for the active tab
        tab.content.style.position = 'absolute';
        tab.content.style.top = '0';
        tab.content.style.left = '0';
        tab.content.style.right = '0';
        tab.content.style.bottom = '0';

        // Show the active tab content
        // CRITICAL FIX #9: Use DISPLAY_VISIBLE constant for consistency
        tab.content.style.display = DISPLAY_VISIBLE;
        logger.trace('tabSwitch', 'Showing tab:', tab.title, 'filePath:', tab.filePath);

        // Log the actual DOM content being shown
        const activePreviewElement = tab.content.querySelector('.CodeMirror, pre, code, img, video');
        if (activePreviewElement) {
            logger.trace('tabSwitch', 'Active content preview:', activePreviewElement.className, activePreviewElement.tagName);

            // For CodeMirror, log the actual content (first 5 lines)
            if (activePreviewElement.CodeMirror) {
                const first5Lines = [];
                for (let i = 0; i < 5; i++) {
                    const line = activePreviewElement.CodeMirror.getLine(i);
                    if (line !== null && line !== undefined) {
                        first5Lines.push(`Line ${i}: ${line.substring(0, 80)}`);
                    }
                }
                logger.trace('tabSwitch', 'CodeMirror first 5 lines:', first5Lines.join(' | '));
            }
        }

        // Log a text snippet from the visible content
        const textContent = tab.content.textContent?.substring(0, 200) || '';
        logger.trace('tabSwitch', 'Visible text snippet:', textContent);

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
            logger.trace('tabSwitch', 'Updating pane title from', titleElement.textContent, 'to', tab.title);
            titleElement.textContent = tab.title;
        } else {
            logger.warn('paneCreate', '⚠️ Could not find pane title element for pane:', paneId);
        }

        logger.trace('tabSwitch', '✓ Switched to tab successfully:', { paneId, tabId, title: tab.title });
        logger.trace('tabSwitch', '========================================');
        eventBus.emit('tab:switched', { paneId, tabId, filePath: tab.filePath });

        // CRITICAL FIX #1: Force resize of newly visible content after tab switch
        // This fixes the bug where terminals/browsers have wrong dimensions after being hidden
        // Use double RAF to ensure layout is complete before resizing
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                // Handle Terminal instances - force resize to recalculate dimensions
                if (tab.content._terminalInstance) {
                    logger.debug('paneCreate', 'Forcing terminal resize after tab switch:', tabId);
                    try {
                        tab.content._terminalInstance.resize();
                    } catch (error) {
                        logger.error('paneCreate', 'Error resizing terminal after tab switch:', error);
                    }
                }

                // Handle Browser instances - force bounds recalculation
                if (tab.content._browserInstance) {
                    logger.debug('paneCreate', 'Forcing browser bounds update after tab switch:', tabId);
                    try {
                        const bounds = tab.content._browserInstance.calculateBrowserBounds();
                        // Update bounds immediately (synchronous)
                        window.electronAPI.browserUpdateBounds(tab.content._browserInstance.activeTabId, bounds).catch(err => {
                            logger.error('paneCreate', 'Error updating browser bounds after tab switch:', err);
                        });
                    } catch (error) {
                        logger.error('paneCreate', 'Error calculating browser bounds after tab switch:', error);
                    }
                }

                // Handle FileViewer instances - force CodeMirror refresh
                if (tab.content._fileViewerInstance && tab.content._fileViewerInstance.textEditor) {
                    logger.debug('paneCreate', 'Forcing CodeMirror refresh after tab switch:', tabId);
                    try {
                        tab.content._fileViewerInstance.textEditor.refresh();
                    } catch (error) {
                        logger.error('paneCreate', 'Error refreshing CodeMirror after tab switch:', error);
                    }
                }
            });
        });

        // Navigate to line number if specified (for search results, etc.)
        // Note: CodeMirror refresh is handled by TextEditor itself, no need to duplicate here
        if (lineNumber !== null && lineNumber !== undefined) {
            // Use RAF to ensure DOM is ready (replaces setTimeout)
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    logger.trace('tabSwitch', 'Navigating to line in existing tab:', lineNumber);
                    // Access the FileViewer instance through the stored property
                    const fileViewerInstance = tab.content._fileViewerInstance;
                    if (fileViewerInstance && fileViewerInstance.textEditor) {
                        logger.trace('tabSwitch', 'Found TextEditor instance, calling goToLine');
                        fileViewerInstance.textEditor.goToLine(lineNumber);
                    } else {
                        logger.warn('paneCreate', 'Could not access TextEditor instance for line navigation');
                    }
                });
            });
        }
    }

    /**
     * Queue an operation to prevent concurrent state mutations
     * CRITICAL FIX #2: Serializes operations like closeTab, closePane, moveTab
     */
    queueOperation(operationName, operation) {
        logger.debug('paneCreate', `Queueing operation: ${operationName}`);

        const operationPromise = this.operationQueue.then(async () => {
            this.operationInProgress = true;
            const startTime = Date.now();

            try {
                logger.debug('paneCreate', `Executing operation: ${operationName}`);
                const result = await operation();
                const duration = Date.now() - startTime;
                logger.debug('paneCreate', `Completed operation: ${operationName} (${duration}ms)`);
                return result;
            } catch (error) {
                logger.error('paneCreate', `Operation ${operationName} failed:`, error);
                throw error;
            } finally {
                this.operationInProgress = false;
            }
        });

        // Update the queue to point to this operation
        this.operationQueue = operationPromise.catch(error => {
            // Log but don't propagate - allow queue to continue
            logger.error('paneCreate', 'Operation queue error:', error);
        });

        return operationPromise;
    }

    /**
     * Close a tab
     * CRITICAL FIX: Made async to properly await Browser.destroy()
     * CRITICAL FIX #2: Now uses operation queue to prevent race conditions
     */
    async closeTab(paneId, tabId) {
        // CRITICAL FIX #2: Queue this operation to prevent concurrent mutations
        return this.queueOperation(`closeTab(${paneId}, ${tabId})`, async () => {
            return this._closeTabInternal(paneId, tabId);
        });
    }

    /**
     * Internal close tab implementation (called by queued operation)
     * CRITICAL FIX #2: Extracted internal logic to separate method
     */
    async _closeTabInternal(paneId, tabId) {
        const pane = this.panes.get(paneId);
        if (!pane) {
            const errorMsg = `Cannot close tab: Pane ${paneId} not found`;
            logger.error('paneCreate', errorMsg);
            eventBus.emit('notification:show', {
                type: 'error',
                message: errorMsg
            });
            throw new Error(errorMsg);
        }

        const tabIndex = pane.tabs.findIndex(t => t.id === tabId);
        if (tabIndex === -1) {
            const errorMsg = `Cannot close tab: Tab ${tabId} not found in pane ${paneId}`;
            logger.error('paneCreate', errorMsg);
            eventBus.emit('notification:show', {
                type: 'error',
                message: errorMsg
            });
            throw new Error(errorMsg);
        }

        // Remove tab
        const tab = pane.tabs[tabIndex];

        // CRITICAL FIX: Capture the tab to switch to BEFORE removing current tab
        // This prevents using a stale index after the array is modified
        let nextActiveTab = null;
        if (pane.activeTabId === tabId && pane.tabs.length > 1) {
            // Determine which tab to activate after removal
            // If removing last tab, go to previous; otherwise go to next (which becomes current position after splice)
            const nextIndex = tabIndex === pane.tabs.length - 1 ? tabIndex - 1 : tabIndex + 1;
            nextActiveTab = pane.tabs[nextIndex];
        }

        // CRITICAL FIX: Cleanup tab content before removing from DOM
        // This prevents memory leaks from event listeners, observers, etc.
        if (tab.content) {
            try {
                // Check for cleanup methods on the content or its instances
                // Pattern 1: FileViewer instance (has destroy/cleanup method)
                if (tab.content._fileViewerInstance && typeof tab.content._fileViewerInstance.destroy === 'function') {
                    logger.debug('paneCreate', 'Calling destroy() on FileViewer instance');
                    tab.content._fileViewerInstance.destroy();
                }

                // Pattern 2: Terminal instance (has destroy method)
                if (tab.content._terminalInstance && typeof tab.content._terminalInstance.destroy === 'function') {
                    logger.debug('paneCreate', 'Calling destroy() on Terminal instance');
                    tab.content._terminalInstance.destroy();
                }

                // Pattern 3: Browser instance (has cleanup method)
                // CRITICAL FIX: Await browser destroy to properly cleanup BrowserView
                if (tab.content._browserInstance && typeof tab.content._browserInstance.destroy === 'function') {
                    logger.debug('paneCreate', 'Calling destroy() on Browser instance');
                    await tab.content._browserInstance.destroy();
                    logger.debug('paneCreate', 'Browser instance destroyed successfully');
                }

                // Pattern 4: General cleanup function attached to content
                if (typeof tab.content._cleanup === 'function') {
                    logger.debug('paneCreate', 'Calling _cleanup() on tab content');
                    tab.content._cleanup();
                }

                // Remove from DOM after cleanup
                if (tab.content.parentElement) {
                    tab.content.remove();
                }
            } catch (error) {
                logger.error('paneCreate', 'Error during tab content cleanup:', error);
                // Still try to remove from DOM even if cleanup failed
                if (tab.content.parentElement) {
                    tab.content.remove();
                }
            }
        }

        pane.tabs.splice(tabIndex, 1);

        // If closing active tab, switch to another
        if (pane.activeTabId === tabId) {
            if (nextActiveTab) {
                // Switch to the tab we captured before removal
                this.switchTab(paneId, nextActiveTab.id);
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

        logger.debug('paneCreate', 'Tab closed:', { paneId, tabId });
        eventBus.emit('tab:closed', { paneId, tabId, filePath: tab.filePath, content: tab.content, contentType: tab.contentType });
    }

    /**
     * Move a tab from one pane to another
     */
    moveTab(sourcePaneId, tabId, targetPaneId) {
        logger.debug('paneCreate', 'moveTab called:', { sourcePaneId, tabId, targetPaneId });

        const sourcePane = this.panes.get(sourcePaneId);
        const targetPane = this.panes.get(targetPaneId);

        if (!sourcePane || !targetPane) {
            logger.error('paneCreate', 'Source or target pane not found:', { sourcePaneId, targetPaneId });
            return false;
        }

        // Find tab in source pane
        const tabIndex = sourcePane.tabs.findIndex(t => t.id === tabId);
        if (tabIndex === -1) {
            logger.error('paneCreate', 'Tab not found in source pane:', tabId);
            return false;
        }

        // CRITICAL FIX: Capture the tab to switch to BEFORE removing current tab
        // This prevents using a stale index after the array is modified
        let nextActiveTab = null;
        if (sourcePane.activeTabId === tabId && sourcePane.tabs.length > 1) {
            // Determine which tab to activate after removal
            // If removing last tab, go to previous; otherwise go to next (which becomes current position after splice)
            const nextIndex = tabIndex === sourcePane.tabs.length - 1 ? tabIndex - 1 : tabIndex + 1;
            nextActiveTab = sourcePane.tabs[nextIndex];
        }

        // Remove tab from source pane
        const tab = sourcePane.tabs.splice(tabIndex, 1)[0];

        // Remove content from source pane's DOM (but don't destroy it)
        if (tab.content && tab.content.parentElement === sourcePane.contentContainer) {
            tab.content.remove();
        }

        // Add tab to target pane
        targetPane.tabs.push(tab);

        // Add content to target pane's DOM (hidden initially)
        // CRITICAL FIX #9: Use DISPLAY_HIDDEN constant for consistency
        if (tab.content) {
            tab.content.style.display = DISPLAY_HIDDEN;
            targetPane.contentContainer.appendChild(tab.content);
        }

        // CRITICAL FIX: Update Browser instance pane context if this is a browser tab
        // Browser instances track their paneId/tabId for visibility management
        if (tab.content && tab.content._browserInstance) {
            logger.debug('paneCreate', 'Updating browser pane context after move');
            try {
                // Update browser's internal paneId/tabId and force bounds recalculation
                tab.content._browserInstance.updatePaneContext(targetPaneId, tabId);
            } catch (error) {
                logger.error('paneCreate', 'Error updating browser pane context:', error);
            }
        }

        // Update source pane
        if (sourcePane.tabs.length === 0) {
            // CRITICAL FIX #3: Don't auto-close with setTimeout - show empty state instead
            // This prevents race conditions where files opened within 50ms get lost
            logger.debug('paneCreate', 'Source pane now empty, showing empty state:', sourcePaneId);
            this.showEmptyPaneState(sourcePane);
        } else {
            // Switch to another tab if the moved tab was active
            if (sourcePane.activeTabId === tabId && nextActiveTab) {
                // Use the tab we captured before removal
                this.switchTab(sourcePaneId, nextActiveTab.id);
            } else {
                // Just re-render tab bar
                this.renderTabBar(sourcePane);
            }
        }

        // Update target pane
        // Ensure tab bar exists
        this.ensureTabBar(targetPane);

        // Render tab bar
        this.renderTabBar(targetPane);

        // Switch to the moved tab
        this.switchTab(targetPaneId, tabId);

        logger.debug('paneCreate', '✓ Tab moved successfully:', { sourcePaneId, tabId, targetPaneId });
        eventBus.emit('tab:moved', { sourcePaneId, targetPaneId, tabId });

        return true;
    }

    /**
     * Show empty state in a pane (no tabs open)
     * CRITICAL FIX #3: Extracted to helper method to avoid setTimeout auto-close bugs
     */
    showEmptyPaneState(pane) {
        logger.debug('paneCreate', 'Showing empty pane state for:', pane.id);

        // Clear all content
        pane.contentContainer.innerHTML = '';
        pane.content = null;
        pane.contentType = null;
        pane.filePath = null;
        pane.activeTabId = null;

        // Remove tab bar
        if (pane.tabBarContainer) {
            pane.tabBarContainer.remove();
            pane.tabBarContainer = null;
        }

        // Show empty state message
        const emptyState = document.createElement('div');
        emptyState.className = 'pane-empty-state';
        emptyState.style.cssText = 'display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; width: 100%; color: #888; gap: 12px;';

        const message = document.createElement('div');
        message.textContent = 'No files open';
        message.style.cssText = 'font-size: 14px;';
        emptyState.appendChild(message);

        // Add hint for closing pane (if it has a parent and can be closed)
        if (pane.parent) {
            const hint = document.createElement('div');
            hint.textContent = 'Click × to close this pane';
            hint.style.cssText = 'font-size: 12px; opacity: 0.6;';
            emptyState.appendChild(hint);
        }

        pane.contentContainer.appendChild(emptyState);

        // Update pane title
        const titleElement = pane.element.querySelector('.pane-title');
        if (titleElement) {
            titleElement.textContent = 'Empty Pane';
        }

        logger.debug('paneCreate', '✓ Empty state shown for pane:', pane.id);
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
        logger.debug('paneCreate', 'Restoring layout:', data);

        if (!data) {
            logger.warn('paneCreate', 'No layout data to restore');
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

        logger.debug('paneCreate', 'Layout restored successfully');
    }

    /**
     * Restore a pane and its children from serialized data
     */
    async restorePane(data, parent) {
        logger.debug('paneCreate', 'Restoring pane:', data.id);

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
            logger.debug('paneCreate', 'Restoring split pane with children');

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
            logger.debug('paneCreate', 'Restoring pane with', data.tabs.length, 'tabs');

            for (const tabData of data.tabs) {
                // CRITICAL FIX #10: Use RAF instead of setTimeout for proper layout completion
                // Request the file to be opened in this pane after layout is complete
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        eventBus.emit('pane:request-file-open', {
                            paneId: pane.id,
                            filePath: tabData.filePath
                        });
                    });
                });
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
                logger.warn('paneCreate', '⚠️ CURSOR CREATED DURING DRAG! Total:', currentCount, 'Delta:', delta);
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
        logger.debug('paneCreate', 'Destroyed');
    }
}

module.exports = PaneManager;

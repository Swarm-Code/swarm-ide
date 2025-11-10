import { writable, derived } from 'svelte/store';
import { workspaceStore } from './workspaceStore.js';
import { canvasStore } from './canvasStore.js';

// Media file extensions
const IMAGE_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.bmp', '.ico', '.apng'
]);

const VIDEO_EXTENSIONS = new Set([
  '.mp4', '.webm', '.ogg', '.mov', '.avi', '.mkv', '.m4v'
]);

function isMediaFile(filename) {
  if (!filename) return false;
  const ext = filename.substring(filename.lastIndexOf('.')).toLowerCase();
  return IMAGE_EXTENSIONS.has(ext) || VIDEO_EXTENSIONS.has(ext);
}

// Editor state per workspace per canvas
// Structure: workspaceId -> canvasId -> editorState
const workspaceCanvasEditorStates = new Map();

// Get initial state for a canvas
function getInitialState() {
  return {
    layout: {
      type: 'pane',
      paneType: 'editor', // 'editor' or 'terminal' (browsers are tabs in editor panes)
      id: 'pane-1',
      tabs: [], // Unified tabs: can be type 'editor', 'browser', or 'terminal'
      activeTabId: null,
      terminalIds: [], // Array of terminal IDs for terminal panes
      activeTerminalId: null, // Active terminal in this pane
    },
    activePaneId: 'pane-1',
    nextPaneId: 2,
    nextTabId: 1,
  };
}

// Editor state management with pane splitting and tab support
function createEditorStore() {
  const store = writable(getInitialState());
  const { subscribe, set, update } = store;
  
  let currentWorkspaceId = null;
  let currentCanvasId = null;
  let currentState = getInitialState();

  function findBrowserTabInLayout(node, browserId) {
    if (!node) return null;

    if (node.type === 'pane') {
      if (node.paneType === 'editor' && Array.isArray(node.tabs)) {
        const tab = node.tabs.find((t) => t.type === 'browser' && t.browserId === browserId);
        if (tab) {
          return { pane: node, tab };
        }
      }
      return null;
    }

    if (node.type === 'split') {
      return findBrowserTabInLayout(node.left, browserId) || findBrowserTabInLayout(node.right, browserId);
    }

    return null;
  }

  function pruneBrowserTabsFromLayout(node, browserId) {
    if (!node) return false;

    let removed = false;
    if (node.type === 'pane' && node.paneType === 'editor' && Array.isArray(node.tabs)) {
      const nextTabs = node.tabs.filter((t) => !(t.type === 'browser' && t.browserId === browserId));
      if (nextTabs.length !== node.tabs.length) {
        removed = true;
        node.tabs = nextTabs;
        if (!nextTabs.some((t) => t.id === node.activeTabId)) {
          node.activeTabId = nextTabs[nextTabs.length - 1]?.id || null;
        }
      }
    } else if (node.type === 'split') {
      if (pruneBrowserTabsFromLayout(node.left, browserId)) {
        removed = true;
      }
      if (pruneBrowserTabsFromLayout(node.right, browserId)) {
        removed = true;
      }
    }
    return removed;
  }

  // Track state changes
  subscribe((state) => {
    currentState = state;
  });

  // Helper to get workspace canvas map
  function getWorkspaceCanvasMap(workspaceId) {
    if (!workspaceCanvasEditorStates.has(workspaceId)) {
      workspaceCanvasEditorStates.set(workspaceId, new Map());
    }
    return workspaceCanvasEditorStates.get(workspaceId);
  }

  // Subscribe to workspace changes
  workspaceStore.subscribe((workspaceState) => {
    const newWorkspaceId = workspaceState.activeWorkspaceId;
    
    if (newWorkspaceId !== currentWorkspaceId) {
      // Save current state if we have both workspace and canvas
      if (currentWorkspaceId && currentCanvasId) {
        const canvasMap = getWorkspaceCanvasMap(currentWorkspaceId);
        canvasMap.set(currentCanvasId, { ...currentState });
      }
      
      // Load or initialize state for new workspace
      if (newWorkspaceId) {
        const canvasMap = getWorkspaceCanvasMap(newWorkspaceId);
        // Get active canvas ID from canvasStore
        const activeCanvasId = canvasStore.getActiveCanvasId();
        const savedState = canvasMap.get(activeCanvasId);
        
        if (savedState) {
          set(savedState);
        } else {
          set(getInitialState());
        }
        
        currentCanvasId = activeCanvasId;
      } else {
        set(getInitialState());
        currentCanvasId = null;
      }
      
      currentWorkspaceId = newWorkspaceId;
    }
  });

  // Subscribe to canvas changes (within same workspace)
  canvasStore.subscribe((canvasState) => {
    const newCanvasId = canvasState.activeCanvasId;
    
    // Only switch canvas if workspace hasn't changed
    if (newCanvasId !== currentCanvasId && currentWorkspaceId) {
      // Save current canvas state
      if (currentCanvasId) {
        const canvasMap = getWorkspaceCanvasMap(currentWorkspaceId);
        canvasMap.set(currentCanvasId, { ...currentState });
      }
      
      // Load state for new canvas
      const canvasMap = getWorkspaceCanvasMap(currentWorkspaceId);
      const savedState = canvasMap.get(newCanvasId);
      
      if (savedState) {
        set(savedState);
      } else {
        set(getInitialState());
      }
      
      currentCanvasId = newCanvasId;
    }
  });

  return {
    subscribe,

    // Open mind file in active pane
    openMind: async (name, content = '') => {
      console.log('[editorStore.openMind] Called with:', { name });
      const pane = findPaneById(currentState.layout, currentState.activePaneId);
      
      if (!pane) {
        console.log('[editorStore.openMind] ❌ REJECTED: no pane found');
        return;
      }

      // Check if mind already open in this pane
      if (pane.paneType === 'editor') {
        const existingTab = pane.tabs.find((t) => t.type === 'mind' && t.name === name);
        if (existingTab) {
          update((state) => {
            const targetPane = findPaneById(state.layout, state.activePaneId);
            if (targetPane) {
              targetPane.activeTabId = existingTab.id;
            }
            return { ...state };
          });
          return;
        }
      }

      update((state) => {
        const targetPane = findPaneById(state.layout, state.activePaneId);
        
        if (!targetPane) {
          console.log('[editorStore.openMind] ❌ No target pane found');
          return state;
        }

        // If active pane is a terminal pane with terminals, split it
        if (targetPane.paneType === 'terminal' && targetPane.terminalIds.length > 0) {
          console.log('[editorStore.openMind] ✅ Splitting terminal pane (has terminals)');
          const result = splitPaneInLayout(
            state.layout,
            state.activePaneId,
            'vertical',
            state.nextPaneId
          );
          
          if (result) {
            const newPane = findPaneById(result.layout, result.newPaneId);
            if (newPane) {
              const newTab = {
                id: `tab-${state.nextTabId}`,
                type: 'mind',
                name: name,
                content: content,
                isDirty: false,
              };
              
              newPane.tabs = [newTab];
              newPane.activeTabId = newTab.id;
              
              console.log('[editorStore.openMind] ✅ Created new mind tab:', newTab.id, 'in new pane:', newPane.id);
              
              return {
                ...state,
                layout: result.layout,
                activePaneId: result.newPaneId,
                nextPaneId: state.nextPaneId + 1,
                nextTabId: state.nextTabId + 1,
              };
            }
          }
        }
        
        // If active pane is empty terminal, convert it to editor
        if (targetPane.paneType === 'terminal' && targetPane.terminalIds.length === 0) {
          console.log('[editorStore.openMind] ✅ Converting empty terminal pane to editor');
          targetPane.paneType = 'editor';
          targetPane.terminalIds = [];
          targetPane.activeTerminalId = null;
          targetPane.tabs = [];
          targetPane.activeTabId = null;
        }
        
        // At this point, we should have an editor pane - create the tab
        if (targetPane.paneType !== 'editor') {
          console.log('[editorStore.openMind] ❌ Cannot create tab - pane is still', targetPane.paneType);
          return state;
        }

        const newTab = {
          id: `tab-${state.nextTabId}`,
          type: 'mind',
          name: name,
          content: content,
          isDirty: false,
        };

        targetPane.tabs.push(newTab);
        targetPane.activeTabId = newTab.id;
        
        console.log('[editorStore.openMind] ✅ Created new mind tab:', newTab.id, 'in pane:', targetPane.id);

        return {
          ...state,
          nextTabId: state.nextTabId + 1,
        };
      });
    },

    // Open file in active pane
    openFile: async (filePath, fileName) => {
      console.log('[editorStore.openFile] Called with:', { filePath, fileName });
      const pane = findPaneById(currentState.layout, currentState.activePaneId);
      console.log('[editorStore.openFile] Active pane:', {
        id: pane?.id,
        type: pane?.paneType,
        tabsCount: pane?.tabs?.length,
        browserIdsCount: pane?.browserIds?.length,
        terminalIdsCount: pane?.terminalIds?.length
      });
      
      if (!pane) {
        console.log('[editorStore.openFile] ❌ REJECTED: no pane found');
        return;
      }

      // Check if file already open in this pane
      if (pane.paneType === 'editor') {
        const existingTab = pane.tabs.find((t) => t.type === 'editor' && t.path === filePath);
        if (existingTab) {
          update((state) => {
            const targetPane = findPaneById(state.layout, state.activePaneId);
            if (targetPane) {
              targetPane.activeTabId = existingTab.id;
            }
            return { ...state };
          });
          return;
        }
      }

      // Load file contents
      let content = '';

      // Check if this is a media file (image or video)
      const isMedia = isMediaFile(fileName);

      if (isMedia) {
        // Media files don't need content - MediaViewer uses file:// URLs directly
        content = '';
      } else if (window.electronAPI) {
        const result = await window.electronAPI.readFile(filePath);

        // Handle new response format
        if (result && result.error) {
          // Show error message in the editor
          content = `# Unable to open file\n\n**Error:** ${result.message}\n\n`;
          if (result.error === 'unsupported') {
            content += 'This file type is not supported for editing.\n';
            content += 'Supported file types: text files, code files, configuration files, etc.';
          }
        } else if (result && result.content !== undefined) {
          content = result.content;
        } else {
          content = '// Error loading file';
        }
      }

      // Handle non-editor panes
      update((state) => {
        const targetPane = findPaneById(state.layout, state.activePaneId);
        
        if (!targetPane) {
          console.log('[editorStore.openFile] ❌ No target pane found');
          return state;
        }

        // If active pane is a terminal pane with terminals, split it
        if (targetPane.paneType === 'terminal' && targetPane.terminalIds.length > 0) {
          console.log('[editorStore.openFile] ✅ Splitting terminal pane (has terminals)');
          const result = splitPaneInLayout(
            state.layout,
            state.activePaneId,
            'vertical',
            state.nextPaneId
          );
          
          if (result) {
            const newPane = findPaneById(result.layout, result.newPaneId);
            if (newPane) {
              // New pane is already 'editor' type by default
              const newTab = {
                id: `tab-${state.nextTabId}`,
                type: 'editor',
                path: filePath,
                name: fileName,
                content: content,
                isDirty: false,
                previewMode: 'off', // 'off', 'split', 'preview'
              };
              
              newPane.tabs = [newTab];
              newPane.activeTabId = newTab.id;
              
              console.log('[editorStore.openFile] ✅ Created new tab:', newTab.id, 'in new pane:', newPane.id);
              
              return {
                ...state,
                layout: result.layout,
                activePaneId: result.newPaneId,
                nextPaneId: state.nextPaneId + 1,
                nextTabId: state.nextTabId + 1,
              };
            }
          }
        }
        
        // If active pane is empty terminal, convert it to editor
        if (targetPane.paneType === 'terminal' && targetPane.terminalIds.length === 0) {
          console.log('[editorStore.openFile] ✅ Converting empty terminal pane to editor');
          targetPane.paneType = 'editor';
          targetPane.terminalIds = [];
          targetPane.activeTerminalId = null;
          targetPane.tabs = [];
          targetPane.activeTabId = null;
        }
        
        // At this point, we should have an editor pane - create the tab
        if (targetPane.paneType !== 'editor') {
          console.log('[editorStore.openFile] ❌ Cannot create tab - pane is still', targetPane.paneType);
          return state;
        }

        const newTab = {
          id: `tab-${state.nextTabId}`,
          type: 'editor',
          path: filePath,
          name: fileName,
          content: content,
          isDirty: false,
          previewMode: 'off', // 'off', 'split', 'preview'
        };

        targetPane.tabs.push(newTab);
        targetPane.activeTabId = newTab.id;
        
        console.log('[editorStore.openFile] ✅ Created new tab:', newTab.id, 'in pane:', targetPane.id);

        return {
          ...state,
          nextTabId: state.nextTabId + 1,
        };
      });
    },

    // Add terminal to active pane or create new pane
    addTerminal: (terminalId) => update((state) => {
      const pane = findPaneById(state.layout, state.activePaneId);
      
      // If active pane is a terminal pane, just add the terminal to it
      if (pane && pane.paneType === 'terminal') {
        if (!pane.terminalIds.includes(terminalId)) {
          pane.terminalIds.push(terminalId);
          pane.activeTerminalId = terminalId;
        }
        
        // NOW remove from old location AFTER adding to new location
        const existingPane = findPaneByTerminalId(state.layout, terminalId);
        if (existingPane && existingPane.id !== pane.id) {
          existingPane.terminalIds = existingPane.terminalIds.filter(id => id !== terminalId);
          // If that was the active terminal, switch to another
          if (existingPane.activeTerminalId === terminalId && existingPane.terminalIds.length > 0) {
            existingPane.activeTerminalId = existingPane.terminalIds[existingPane.terminalIds.length - 1];
          }
        }
        return state;
      }
      
      // If active pane is an editor with content, split it
      if (pane && pane.paneType === 'editor' && pane.tabs.length > 0) {
        // Split vertically and add terminal to new pane
        const result = splitPaneInLayout(
          state.layout,
          state.activePaneId,
          'vertical',
          state.nextPaneId
        );
        
        if (result) {
          const newPane = findPaneById(result.layout, result.newPaneId);
          if (newPane) {
            newPane.paneType = 'terminal';
            newPane.terminalIds = [terminalId];
            newPane.activeTerminalId = terminalId;
            newPane.tabs = [];
            newPane.activeTabId = null;
          }
          
          // NOW remove from old location AFTER adding to new location
          const existingPane = findPaneByTerminalId(result.layout, terminalId);
          if (existingPane && existingPane.id !== newPane.id) {
            existingPane.terminalIds = existingPane.terminalIds.filter(id => id !== terminalId);
            if (existingPane.activeTerminalId === terminalId && existingPane.terminalIds.length > 0) {
              existingPane.activeTerminalId = existingPane.terminalIds[existingPane.terminalIds.length - 1];
            }
          }
          
          return {
            ...state,
            layout: result.layout,
            activePaneId: result.newPaneId,
            nextPaneId: state.nextPaneId + 1,
          };
        }
      } else if (pane && pane.paneType === 'editor' && pane.tabs.length === 0) {
        // Convert empty editor pane to terminal pane
        pane.paneType = 'terminal';
        pane.terminalIds = [terminalId];
        pane.activeTerminalId = terminalId;
        pane.tabs = [];
        pane.activeTabId = null;
        
        // NOW remove from old location AFTER adding to new location
        const existingPane = findPaneByTerminalId(state.layout, terminalId);
        if (existingPane && existingPane.id !== pane.id) {
          existingPane.terminalIds = existingPane.terminalIds.filter(id => id !== terminalId);
          if (existingPane.activeTerminalId === terminalId && existingPane.terminalIds.length > 0) {
            existingPane.activeTerminalId = existingPane.terminalIds[existingPane.terminalIds.length - 1];
          }
        }
      }
      
      return state;
    }),

    // Set active terminal in a terminal pane
    setActiveTerminalInPane: (paneId, terminalId) => update((state) => {
      const pane = findPaneById(state.layout, paneId);
      if (pane && pane.paneType === 'terminal' && pane.terminalIds.includes(terminalId)) {
        pane.activeTerminalId = terminalId;
        state.activePaneId = paneId;
      }
      return state;
    }),

    // Remove terminal from pane (move back to bottom panel)
    removeTerminal: (terminalId) => update((state) => {
      const pane = findPaneByTerminalId(state.layout, terminalId);
      if (!pane) return state;

      // Remove terminal from the pane's terminalIds
      pane.terminalIds = pane.terminalIds.filter(id => id !== terminalId);

      // If no more terminals in pane
      if (pane.terminalIds.length === 0) {
        // If it's the only pane, convert back to editor
        if (state.layout.type === 'pane' && state.layout.id === pane.id) {
          pane.paneType = 'editor';
          pane.activeTerminalId = null;
          return state;
        }

        // Otherwise close the pane
        const result = closePaneInLayout(state.layout, pane.id);
        if (result) {
          return {
            ...state,
            layout: result.layout,
            activePaneId: result.newActivePaneId,
          };
        }
      } else {
        // Still have terminals, update active terminal
        if (pane.activeTerminalId === terminalId) {
          pane.activeTerminalId = pane.terminalIds[pane.terminalIds.length - 1];
        }
      }

      return state;
    }),

    // Close terminal tab (remove from pane)
    closeTerminalTab: (paneId, terminalId) => update((state) => {
      const pane = findPaneById(state.layout, paneId);
      if (!pane || pane.paneType !== 'terminal') return state;

      // Remove terminal from the pane's terminalIds
      pane.terminalIds = pane.terminalIds.filter(id => id !== terminalId);

      // If no more terminals in pane
      if (pane.terminalIds.length === 0) {
        // If it's the only pane, convert back to editor
        if (state.layout.type === 'pane' && state.layout.id === pane.id) {
          pane.paneType = 'editor';
          pane.activeTerminalId = null;
          return state;
        }

        // Otherwise close the pane
        const result = closePaneInLayout(state.layout, pane.id);
        if (result) {
          return {
            ...state,
            layout: result.layout,
            activePaneId: result.newActivePaneId,
          };
        }
      } else {
        // Still have terminals, update active terminal
        if (pane.activeTerminalId === terminalId) {
          pane.activeTerminalId = pane.terminalIds[pane.terminalIds.length - 1];
        }
      }

      return state;
    }),

    // Add browser as a tab in active pane
    addBrowser: (browserId, url = 'https://www.google.com', options = {}) => update((state) => {
      console.log('[editorStore.addBrowser] Called with browserId:', browserId);
      
      const pane = findPaneById(state.layout, state.activePaneId);
      console.log('[editorStore.addBrowser] Active pane:', {
        id: pane?.id,
        type: pane?.paneType,
        tabsCount: pane?.tabs?.length
      });
      
      if (!pane) return state;
      
      // If active pane is editor, add browser tab to it
      if (pane.paneType === 'editor') {
        console.log('[editorStore.addBrowser] ✅ Adding browser tab to editor pane');
        const newTab = {
          id: `tab-${state.nextTabId}`,
          type: 'browser',
          browserId: browserId,
          url: url,
          title: options.title || 'New Tab',
        };
        
        pane.tabs.push(newTab);
        pane.activeTabId = newTab.id;
        
        return {
          ...state,
          nextTabId: state.nextTabId + 1,
        };
      }
      
      // If active pane is terminal, split and add browser tab to new editor pane
      if (pane.paneType === 'terminal') {
        console.log('[editorStore.addBrowser] ✅ Splitting terminal, adding browser tab to new pane');
        const result = splitPaneInLayout(
          state.layout,
          state.activePaneId,
          'vertical',
          state.nextPaneId
        );
        
        if (result) {
          const newPane = findPaneById(result.layout, result.newPaneId);
          if (newPane) {
            const newTab = {
              id: `tab-${state.nextTabId}`,
              type: 'browser',
              browserId: browserId,
              url: url,
              title: options.title || 'New Tab',
            };
            
            newPane.tabs = [newTab];
            newPane.activeTabId = newTab.id;
          }
          
          return {
            ...state,
            layout: result.layout,
            activePaneId: result.newPaneId,
            nextPaneId: state.nextPaneId + 1,
            nextTabId: state.nextTabId + 1,
          };
        }
      }
      
      return state;
    }),

    // Close tab
    closeTab: (paneId, tabId) => update((state) => {
      const pane = findPaneById(state.layout, paneId);
      if (!pane || pane.paneType === 'terminal') return state;

      const tabIndex = pane.tabs.findIndex((t) => t.id === tabId);
      if (tabIndex === -1) return state;

      // Remove tab
      pane.tabs.splice(tabIndex, 1);

      // Update active tab
      if (pane.activeTabId === tabId) {
        if (pane.tabs.length > 0) {
          // Activate previous tab or first tab
          const newIndex = Math.max(0, tabIndex - 1);
          pane.activeTabId = pane.tabs[newIndex]?.id || null;
        } else {
          pane.activeTabId = null;
        }
      }

      return { ...state };
    }),

    // Set active tab in pane
    setActiveTab: (paneId, tabId) => update((state) => {
      const pane = findPaneById(state.layout, paneId);
      if (!pane || pane.paneType === 'terminal') return state;

      pane.activeTabId = tabId;
      state.activePaneId = paneId;

      return { ...state };
    }),

    // Reorder tabs within a pane
    reorderTabs: (paneId, fromIndex, toIndex) => update((state) => {
      const pane = findPaneById(state.layout, paneId);
      if (!pane || pane.paneType === 'terminal') return state;

      const [movedTab] = pane.tabs.splice(fromIndex, 1);
      pane.tabs.splice(toIndex, 0, movedTab);

      return { ...state };
    }),

    // Move tab from one pane to another
    moveTab: (fromPaneId, toPaneId, tabId, toIndex = -1) => update((state) => {
      const fromPane = findPaneById(state.layout, fromPaneId);
      const toPane = findPaneById(state.layout, toPaneId);
      if (!fromPane || !toPane || fromPane.paneType === 'terminal' || toPane.paneType === 'terminal') return state;

      const tabIndex = fromPane.tabs.findIndex((t) => t.id === tabId);
      if (tabIndex === -1) return state;

      const [tab] = fromPane.tabs.splice(tabIndex, 1);
      
      // Update active tab in source pane
      if (fromPane.activeTabId === tabId && fromPane.tabs.length > 0) {
        const newIndex = Math.max(0, tabIndex - 1);
        fromPane.activeTabId = fromPane.tabs[newIndex]?.id || null;
      }

      // Add to target pane
      if (toIndex === -1) {
        toPane.tabs.push(tab);
      } else {
        toPane.tabs.splice(toIndex, 0, tab);
      }
      toPane.activeTabId = tab.id;
      state.activePaneId = toPaneId;

      return { ...state };
    }),

    focusBrowserTab: (browserId) => update((state) => {
      const result = findBrowserTabInLayout(state.layout, browserId);
      if (!result) return state;

      result.pane.activeTabId = result.tab.id;
      state.activePaneId = result.pane.id;
      return { ...state };
    }),

    removeBrowserTabs: (browserId) => update((state) => {
      const removed = pruneBrowserTabsFromLayout(state.layout, browserId);
      if (!removed) {
        return state;
      }
      return { ...state };
    }),

    // Split pane horizontally or vertically
    splitPane: (paneId, direction) => update((state) => {
      const result = splitPaneInLayout(
        state.layout,
        paneId,
        direction,
        state.nextPaneId
      );
      
      if (result) {
        return {
          ...state,
          layout: result.layout,
          activePaneId: result.newPaneId,
          nextPaneId: state.nextPaneId + 1,
        };
      }

      return state;
    }),

    // Close pane (merge with sibling if in split)
    closePane: (paneId) => update((state) => {
      // Don't close if it's the only pane
      if (state.layout.type === 'pane' && state.layout.id === paneId) {
        return state;
      }

      const result = closePaneInLayout(state.layout, paneId);
      
      if (result) {
        return {
          ...state,
          layout: result.layout,
          activePaneId: result.newActivePaneId,
        };
      }

      return state;
    }),

    // Set active pane
    setActivePane: (paneId) => update((state) => ({
      ...state,
      activePaneId: paneId,
    })),

    // Get active pane ID
    getActivePaneId: () => {
      let activePaneId = null;
      subscribe((state) => {
        activePaneId = state.activePaneId;
      })();
      return activePaneId;
    },

    // Mark tab as dirty (unsaved changes)
    setTabDirty: (paneId, tabId, isDirty) => update((state) => {
      const pane = findPaneById(state.layout, paneId);
      if (!pane || pane.paneType === 'terminal') return state;

      const tab = pane.tabs.find((t) => t.id === tabId);
      if (tab) {
        tab.isDirty = isDirty;
      }

      return { ...state };
    }),

    // Set markdown preview mode for a tab ('off', 'split', 'preview')
    setPreviewMode: (paneId, tabId, mode) => update((state) => {
      const pane = findPaneById(state.layout, paneId);
      if (!pane || pane.paneType === 'terminal') return state;

      const tab = pane.tabs.find((t) => t.id === tabId);
      if (tab && tab.type === 'editor') {
        tab.previewMode = mode; // 'off', 'split', 'preview'
      }

      return { ...state };
    }),

    // Update split ratio when resizing
    updateSplitRatio: (layout, ratio) => update((state) => {
      if (layout.type === 'split') {
        layout.splitRatio = ratio;
      }
      return { ...state };
    }),

    // Add terminal as a tab in editor pane (like browsers)
    addTerminalTab: (paneId, terminalId) => update((state) => {
      const pane = findPaneById(state.layout, paneId);
      if (!pane || pane.paneType !== 'editor') return state;

      // Check if terminal already exists as a tab in this pane
      const existingTab = pane.tabs.find(t => t.type === 'terminal' && t.terminalId === terminalId);
      if (existingTab) {
        pane.activeTabId = existingTab.id;
        state.activePaneId = pane.id;
        return { ...state };
      }

      // Remove terminal from any existing pane (bottom panel or other pane)
      const existingPane = findPaneByTerminalId(state.layout, terminalId);
      if (existingPane) {
        existingPane.terminalIds = existingPane.terminalIds.filter(id => id !== terminalId);
        if (existingPane.activeTerminalId === terminalId && existingPane.terminalIds.length > 0) {
          existingPane.activeTerminalId = existingPane.terminalIds[existingPane.terminalIds.length - 1];
        }
      }

      // Also remove from other editor pane tabs
      const allPanes = [];
      function collectPanes(node) {
        if (node.type === 'pane') {
          allPanes.push(node);
        } else if (node.type === 'split') {
          collectPanes(node.left);
          collectPanes(node.right);
        }
      }
      collectPanes(state.layout);
      
      for (const otherPane of allPanes) {
        if (otherPane.id !== pane.id && otherPane.paneType === 'editor') {
          otherPane.tabs = otherPane.tabs.filter(t => !(t.type === 'terminal' && t.terminalId === terminalId));
        }
      }

      // Create new terminal tab
      const newTab = {
        id: `tab-${state.nextTabId}`,
        type: 'terminal',
        terminalId: terminalId,
        title: 'Terminal',
      };
      
      pane.tabs.push(newTab);
      pane.activeTabId = newTab.id;
      state.activePaneId = pane.id;

      return {
        ...state,
        nextTabId: state.nextTabId + 1,
      };
    }),

    openSettingsTab: (activityId) => update((state) => {
      const panes = collectEditorPanes(state.layout);
      if (panes.length === 0) return state;

      const existingEntry = panes
        .map((pane) => ({ pane, tab: pane.tabs.find((t) => t.type === 'settings') }))
        .find((entry) => entry.tab);

      if (existingEntry) {
        if (activityId !== undefined) {
          existingEntry.tab.settingsActivityId = activityId ?? null;
        }
        existingEntry.pane.activeTabId = existingEntry.tab.id;
        state.activePaneId = existingEntry.pane.id;
        return { ...state };
      }

      const targetPane = findPaneById(state.layout, state.activePaneId) || panes[0];
      if (!targetPane || targetPane.paneType !== 'editor') {
        return state;
      }

      const newTab = {
        id: `tab-${state.nextTabId}`,
        type: 'settings',
        title: 'Settings',
        settingsActivityId: activityId ?? null,
      };

      targetPane.tabs.push(newTab);
      targetPane.activeTabId = newTab.id;
      state.activePaneId = targetPane.id;

      return {
        ...state,
        nextTabId: state.nextTabId + 1,
      };
    }),

    updateSettingsTab: (paneId, tabId, activityId) => update((state) => {
      const pane = findPaneById(state.layout, paneId);
      if (!pane) return state;
      const tab = pane.tabs.find((t) => t.id === tabId && t.type === 'settings');
      if (!tab) return state;
      tab.settingsActivityId = activityId ?? null;
      return { ...state };
    }),

    // Convert an editor pane to a terminal pane (for backward compatibility)
    convertPaneToTerminal: (paneId, terminalId) => update((state) => {
      const pane = findPaneById(state.layout, paneId);
      if (!pane || pane.paneType !== 'editor') return state;

      // If pane has tabs, add terminal as a tab instead
      if (pane.tabs.length > 0) {
        // Call addTerminalTab instead
        return state;
      }

      // Remove terminal from any existing pane (bottom panel or other pane)
      const existingPane = findPaneByTerminalId(state.layout, terminalId);
      if (existingPane) {
        existingPane.terminalIds = existingPane.terminalIds.filter(id => id !== terminalId);
        if (existingPane.activeTerminalId === terminalId && existingPane.terminalIds.length > 0) {
          existingPane.activeTerminalId = existingPane.terminalIds[existingPane.terminalIds.length - 1];
        }
      }

      // Convert the pane to terminal type
      pane.paneType = 'terminal';
      pane.terminalIds = [terminalId];
      pane.activeTerminalId = terminalId;
      pane.tabs = [];
      pane.activeTabId = null;
      
      // Set this as the active pane
      state.activePaneId = pane.id;

      return { ...state };
    }),

    // Clear all editor state (for workspace switch)
    clearState: () => {
      set(getInitialState());
    },
  };
}

// Helper: Find pane by ID in layout tree
function findPaneById(layout, paneId) {
  if (layout.type === 'pane') {
    return layout.id === paneId ? layout : null;
  }

  // Recursively search in split children
  const leftResult = findPaneById(layout.left, paneId);
  if (leftResult) return leftResult;

  return findPaneById(layout.right, paneId);
}

// Helper: Find pane by terminal ID in layout tree
function findPaneByTerminalId(layout, terminalId) {
  if (layout.type === 'pane' && layout.paneType === 'terminal' && layout.terminalIds.includes(terminalId)) {
    return layout;
  }

  if (layout.type === 'split') {
    const leftResult = findPaneByTerminalId(layout.left, terminalId);
    if (leftResult) return leftResult;
    return findPaneByTerminalId(layout.right, terminalId);
  }

  return null;
}

function collectEditorPanes(layout) {
  const panes = [];
  function traverse(node) {
    if (!node) return;
    if (node.type === 'pane') {
      if (node.paneType === 'editor') {
        panes.push(node);
      }
    } else if (node.type === 'split') {
      traverse(node.left);
      traverse(node.right);
    }
  }
  traverse(layout);
  return panes;
}

// Helper: Split pane in layout tree
function splitPaneInLayout(layout, paneId, direction, nextPaneId) {
  if (layout.type === 'pane' && layout.id === paneId) {
    // Found the pane to split - create new split node
    const newPaneId = `pane-${nextPaneId}`;
    return {
      layout: {
        type: 'split',
        direction, // 'horizontal' or 'vertical'
        left: { ...layout }, // Existing pane
        right: {
          type: 'pane',
          paneType: 'editor',
          id: newPaneId,
          tabs: [],
          activeTabId: null,
          terminalIds: [],
          activeTerminalId: null,
        },
        splitRatio: 0.5, // 50/50 split
      },
      newPaneId,
    };
  }

  if (layout.type === 'split') {
    // Recursively search in children
    const leftResult = splitPaneInLayout(
      layout.left,
      paneId,
      direction,
      nextPaneId
    );
    if (leftResult) {
      layout.left = leftResult.layout;
      return { layout, newPaneId: leftResult.newPaneId };
    }

    const rightResult = splitPaneInLayout(
      layout.right,
      paneId,
      direction,
      nextPaneId
    );
    if (rightResult) {
      layout.right = rightResult.layout;
      return { layout, newPaneId: rightResult.newPaneId };
    }
  }

  return null;
}

// Helper: Close pane in layout tree
function closePaneInLayout(layout, paneId) {
  if (layout.type === 'pane' && layout.id === paneId) {
    // Can't close if no parent (root pane)
    return null;
  }

  if (layout.type === 'split') {
    // Check if one of the children is the pane to close
    if (layout.left.type === 'pane' && layout.left.id === paneId) {
      // Replace split with right child
      const newActivePaneId = findFirstPaneId(layout.right);
      return { layout: layout.right, newActivePaneId };
    }

    if (layout.right.type === 'pane' && layout.right.id === paneId) {
      // Replace split with left child
      const newActivePaneId = findFirstPaneId(layout.left);
      return { layout: layout.left, newActivePaneId };
    }

    // Recursively search in children
    const leftResult = closePaneInLayout(layout.left, paneId);
    if (leftResult) {
      layout.left = leftResult.layout;
      return { layout, newActivePaneId: leftResult.newActivePaneId };
    }

    const rightResult = closePaneInLayout(layout.right, paneId);
    if (rightResult) {
      layout.right = rightResult.layout;
      return { layout, newActivePaneId: rightResult.newActivePaneId };
    }
  }

  return null;
}

// Helper: Find first pane ID in layout tree
function findFirstPaneId(layout) {
  if (layout.type === 'pane') {
    return layout.id;
  }
  return findFirstPaneId(layout.left);
}

export const editorStore = createEditorStore();

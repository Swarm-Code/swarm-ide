import { writable, derived } from 'svelte/store';
import { workspaceStore } from './workspaceStore.js';

// Editor state per workspace
const workspaceEditorStates = new Map();

// Get initial state for a workspace
function getInitialState() {
  return {
    layout: {
      type: 'pane',
      paneType: 'editor', // 'editor' or 'terminal' (browsers are tabs in editor panes)
      id: 'pane-1',
      tabs: [], // Unified tabs: can be type 'editor' or 'browser'
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
  let currentState = getInitialState();

  // Track state changes
  subscribe((state) => {
    currentState = state;
  });

  // Subscribe to workspace changes
  workspaceStore.subscribe((workspaceState) => {
    const newWorkspaceId = workspaceState.activeWorkspaceId;
    
    if (newWorkspaceId !== currentWorkspaceId) {
      // Save current state if we have a workspace
      if (currentWorkspaceId) {
        workspaceEditorStates.set(currentWorkspaceId, { ...currentState });
      }
      
      // Load or initialize state for new workspace
      if (newWorkspaceId) {
        const savedState = workspaceEditorStates.get(newWorkspaceId);
        if (savedState) {
          set(savedState);
        } else {
          set(getInitialState());
        }
      } else {
        set(getInitialState());
      }
      
      currentWorkspaceId = newWorkspaceId;
    }
  });

  return {
    subscribe,

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
      if (window.electronAPI) {
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
    addBrowser: (browserId, url = 'https://www.google.com') => update((state) => {
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
          title: 'New Tab',
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
              title: 'New Tab',
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

    // Update split ratio when resizing
    updateSplitRatio: (layout, ratio) => update((state) => {
      if (layout.type === 'split') {
        layout.splitRatio = ratio;
      }
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

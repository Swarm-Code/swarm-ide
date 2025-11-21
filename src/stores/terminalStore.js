import { writable } from 'svelte/store';

// Terminal store - keeps ALL terminals across all workspaces
function createTerminalStore() {
  const { subscribe, set, update } = writable({
    terminals: [], // Array of { id, title, workspaceId, zoomLevel }
    activeTerminalId: null,
    globalZoomLevel: 1, // Global zoom for all terminals (100% = 1.0)
  });

  return {
    subscribe,

    addTerminal: (id, workspaceId) => update((state) => ({
      ...state,
      terminals: [...state.terminals, { 
        id, 
        title: `Terminal ${state.terminals.filter(t => t.workspaceId === workspaceId).length + 1}`,
        workspaceId,
        zoomLevel: state.globalZoomLevel
      }],
      activeTerminalId: id,
    })),

    removeTerminal: (id) => update((state) => {
      const terminals = state.terminals.filter((t) => t.id !== id);
      let activeTerminalId = state.activeTerminalId;
      
      // If closing active terminal, select another from same workspace
      if (activeTerminalId === id) {
        const closedTerminal = state.terminals.find(t => t.id === id);
        const workspaceTerminals = terminals.filter(t => t.workspaceId === closedTerminal?.workspaceId);
        activeTerminalId = workspaceTerminals.length > 0 ? workspaceTerminals[workspaceTerminals.length - 1].id : null;
      }
      
      return { ...state, terminals, activeTerminalId };
    }),

    setActiveTerminal: (id) => update((state) => ({
      ...state,
      activeTerminalId: id,
    })),

    updateTerminalTitle: (id, title) => update((state) => ({
      ...state,
      terminals: state.terminals.map((t) => 
        t.id === id ? { ...t, title } : t
      ),
    })),

    setGlobalZoomLevel: (level) => update((state) => {
      // Clamp zoom between 0.5 (50%) and 2.0 (200%)
      const clampedLevel = Math.max(0.5, Math.min(2.0, level));
      return {
        ...state,
        globalZoomLevel: clampedLevel,
        terminals: state.terminals.map(t => ({ ...t, zoomLevel: clampedLevel }))
      };
    }),

    incrementZoom: () => update((state) => {
      const newLevel = Math.max(0.5, Math.min(2.0, state.globalZoomLevel + 0.1));
      return {
        ...state,
        globalZoomLevel: newLevel,
        terminals: state.terminals.map(t => ({ ...t, zoomLevel: newLevel }))
      };
    }),

    decrementZoom: () => update((state) => {
      const newLevel = Math.max(0.5, Math.min(2.0, state.globalZoomLevel - 0.1));
      return {
        ...state,
        globalZoomLevel: newLevel,
        terminals: state.terminals.map(t => ({ ...t, zoomLevel: newLevel }))
      };
    }),

    // Get terminals for a specific workspace (derived)
    getWorkspaceTerminals: (workspaceId) => {
      let result = [];
      const unsubscribe = subscribe((state) => {
        result = state.terminals.filter(t => t.workspaceId === workspaceId);
      });
      unsubscribe();
      return result;
    },
  };
}

export const terminalStore = createTerminalStore();

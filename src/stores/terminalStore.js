import { writable } from 'svelte/store';

// Terminal store - keeps ALL terminals across all workspaces
function createTerminalStore() {
  const { subscribe, set, update } = writable({
    terminals: [], // Array of { id, title, workspaceId }
    activeTerminalId: null,
  });

  return {
    subscribe,

    addTerminal: (id, workspaceId) => update((state) => ({
      ...state,
      terminals: [...state.terminals, { 
        id, 
        title: `Terminal ${state.terminals.filter(t => t.workspaceId === workspaceId).length + 1}`,
        workspaceId 
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

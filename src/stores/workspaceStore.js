import { writable, derived } from 'svelte/store';

// Workspace store for managing multiple workspace paths
function createWorkspaceStore() {
  const { subscribe, set, update } = writable({
    workspaces: [], // Array of { id, path, color }
    activeWorkspaceId: null,
  });

  return {
    subscribe,
    setWorkspaces: (workspaces) => update((state) => ({ 
      ...state, 
      workspaces 
    })),
    addWorkspace: (workspace) => update((state) => ({
      ...state,
      workspaces: [...state.workspaces, workspace],
    })),
    removeWorkspace: (workspaceId) => update((state) => {
      const remainingWorkspaces = state.workspaces.filter((w) => w.id !== workspaceId);
      return {
        ...state,
        workspaces: remainingWorkspaces,
        activeWorkspaceId: state.activeWorkspaceId === workspaceId 
          ? (remainingWorkspaces[0]?.id || null) 
          : state.activeWorkspaceId,
      };
    }),
    setActiveWorkspace: (workspaceId) => update((state) => ({
      ...state,
      activeWorkspaceId: workspaceId,
    })),
    updateWorkspace: (workspaceId, updates) => update((state) => ({
      ...state,
      workspaces: state.workspaces.map((w) => 
        w.id === workspaceId ? { ...w, ...updates } : w
      ),
    })),
  };
}

export const workspaceStore = createWorkspaceStore();

// Derived store for active workspace path - components can subscribe to this
export const activeWorkspacePath = derived(
  workspaceStore,
  ($workspaceStore) => {
    const activeWorkspace = $workspaceStore.workspaces.find(
      (w) => w.id === $workspaceStore.activeWorkspaceId
    );
    return activeWorkspace?.path || null;
  }
);

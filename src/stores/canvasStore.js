import { writable, derived } from 'svelte/store';
import { workspaceStore } from './workspaceStore.js';

// Canvas state per workspace
// Structure: workspaceId -> { canvases: [...], activeCanvasId }
const workspaceCanvasStates = new Map();

// Get initial canvas state for a workspace
function getInitialCanvasState() {
  return {
    canvases: [
      {
        id: 'canvas-1',
        name: 'Main',
        color: '#0071e3',
        createdAt: Date.now(),
      }
    ],
    activeCanvasId: 'canvas-1',
    nextCanvasId: 2,
  };
}

// Canvas store - manages canvas creation/switching per workspace
function createCanvasStore() {
  const store = writable(getInitialCanvasState());
  const { subscribe, set, update } = store;
  
  let currentWorkspaceId = null;
  let currentState = getInitialCanvasState();

  // Track state changes
  subscribe((state) => {
    currentState = state;
  });

  // Subscribe to workspace changes
  workspaceStore.subscribe((workspaceState) => {
    const newWorkspaceId = workspaceState.activeWorkspaceId;
    
    if (newWorkspaceId !== currentWorkspaceId) {
      // Save current canvas state if we have a workspace
      if (currentWorkspaceId) {
        workspaceCanvasStates.set(currentWorkspaceId, { ...currentState });
      }
      
      // Load or initialize canvas state for new workspace
      if (newWorkspaceId) {
        const savedState = workspaceCanvasStates.get(newWorkspaceId);
        if (savedState) {
          set(savedState);
        } else {
          set(getInitialCanvasState());
        }
      } else {
        set(getInitialCanvasState());
      }
      
      currentWorkspaceId = newWorkspaceId;
    }
  });

  return {
    subscribe,

    // Add new canvas to current workspace
    addCanvas: (name, color = '#0071e3') => update((state) => {
      const newCanvas = {
        id: `canvas-${state.nextCanvasId}`,
        name: name || `Canvas ${state.nextCanvasId}`,
        color,
        createdAt: Date.now(),
      };
      
      return {
        ...state,
        canvases: [...state.canvases, newCanvas],
        activeCanvasId: newCanvas.id,
        nextCanvasId: state.nextCanvasId + 1,
      };
    }),

    // Remove canvas (can't remove last one)
    removeCanvas: (canvasId) => update((state) => {
      if (state.canvases.length <= 1) return state;
      
      const remainingCanvases = state.canvases.filter((c) => c.id !== canvasId);
      
      return {
        ...state,
        canvases: remainingCanvases,
        activeCanvasId: state.activeCanvasId === canvasId 
          ? remainingCanvases[0].id 
          : state.activeCanvasId,
      };
    }),

    // Set active canvas
    setActiveCanvas: (canvasId) => update((state) => ({
      ...state,
      activeCanvasId: canvasId,
    })),

    // Rename canvas
    renameCanvas: (canvasId, newName) => update((state) => ({
      ...state,
      canvases: state.canvases.map((c) => 
        c.id === canvasId ? { ...c, name: newName } : c
      ),
    })),

    // Update canvas color
    updateCanvasColor: (canvasId, color) => update((state) => ({
      ...state,
      canvases: state.canvases.map((c) => 
        c.id === canvasId ? { ...c, color } : c
      ),
    })),

    // Get current canvas ID
    getActiveCanvasId: () => currentState.activeCanvasId,

    // Clear all canvas state (for workspace switch)
    clearState: () => {
      set(getInitialCanvasState());
    },
  };
}

export const canvasStore = createCanvasStore();

// Derived store for active canvas
export const activeCanvas = derived(
  canvasStore,
  ($canvasStore) => {
    return $canvasStore.canvases.find(
      (c) => c.id === $canvasStore.activeCanvasId
    ) || null;
  }
);

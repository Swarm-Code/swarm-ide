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
        type: 'editor', // 'editor' or 'mind'
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
    addCanvas: (name, color = '#0071e3', type = 'editor') => update((state) => {
      const newCanvas = {
        id: `canvas-${state.nextCanvasId}`,
        name: name || `Canvas ${state.nextCanvasId}`,
        type, // 'editor' or 'mind'
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

    // Get or create Mind canvas
    getOrCreateMindCanvas: () => {
      let mindCanvas = null;
      let needsCreate = false;
      
      update((state) => {
        mindCanvas = state.canvases.find(c => c.type === 'mind');
        
        if (!mindCanvas) {
          needsCreate = true;
          mindCanvas = {
            id: `canvas-${state.nextCanvasId}`,
            name: 'Mind',
            type: 'mind',
            color: '#af52de',
            createdAt: Date.now(),
          };
          
          return {
            ...state,
            canvases: [...state.canvases, mindCanvas],
            activeCanvasId: mindCanvas.id,
            nextCanvasId: state.nextCanvasId + 1,
          };
        } else {
          return {
            ...state,
            activeCanvasId: mindCanvas.id,
          };
        }
      });
      
      return mindCanvas;
    },

    // Get or create Git canvas
    getOrCreateGitCanvas: () => {
      let gitCanvas = null;
      let needsCreate = false;
      
      update((state) => {
        gitCanvas = state.canvases.find(c => c.type === 'git');
        
        if (!gitCanvas) {
          needsCreate = true;
          gitCanvas = {
            id: `canvas-${state.nextCanvasId}`,
            name: 'Git',
            type: 'git',
            color: '#ff9500',
            createdAt: Date.now(),
          };
          
          return {
            ...state,
            canvases: [...state.canvases, gitCanvas],
            activeCanvasId: gitCanvas.id,
            nextCanvasId: state.nextCanvasId + 1,
          };
        } else {
          return {
            ...state,
            activeCanvasId: gitCanvas.id,
          };
        }
      });
      
      return gitCanvas;
    },

    // Get or create Browser canvas
    getOrCreateBrowserCanvas: () => {
      let browserCanvas = null;
      
      update((state) => {
        browserCanvas = state.canvases.find(c => c.type === 'browser');
        
        if (!browserCanvas) {
          browserCanvas = {
            id: `canvas-${state.nextCanvasId}`,
            name: 'Browser',
            type: 'browser',
            color: '#4a9eff',
            createdAt: Date.now(),
          };
          
          return {
            ...state,
            canvases: [...state.canvases, browserCanvas],
            activeCanvasId: browserCanvas.id,
            nextCanvasId: state.nextCanvasId + 1,
          };
        } else {
          return {
            ...state,
            activeCanvasId: browserCanvas.id,
          };
        }
      });
      
      return browserCanvas;
    },

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

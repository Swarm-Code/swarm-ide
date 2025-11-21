import { writable } from 'svelte/store';

// Browser store - keeps ALL browsers across all workspaces
function createBrowserStore() {
  const { subscribe, set, update } = writable({
    browsers: [], // Array of { id, url, title, workspaceId, canGoBack, canGoForward, isLoading, zoomLevel }
    activeBrowserId: null,
    globalZoomLevel: 1, // Global zoom for all browsers (100% = 1.0)
  });

  return {
    subscribe,

    addBrowser: (id, url, workspaceId) => update((state) => ({
      ...state,
      browsers: [...state.browsers, { 
        id, 
        url: url || 'about:blank',
        title: 'New Tab',
        workspaceId,
        canGoBack: false,
        canGoForward: false,
        isLoading: false,
        zoomLevel: state.globalZoomLevel
      }],
      activeBrowserId: id,
    })),

    removeBrowser: (id) => update((state) => {
      const browsers = state.browsers.filter((b) => b.id !== id);
      let activeBrowserId = state.activeBrowserId;
      
      // If closing active browser, select another from same workspace
      if (activeBrowserId === id) {
        const closedBrowser = state.browsers.find(b => b.id === id);
        const workspaceBrowsers = browsers.filter(b => b.workspaceId === closedBrowser?.workspaceId);
        activeBrowserId = workspaceBrowsers.length > 0 ? workspaceBrowsers[workspaceBrowsers.length - 1].id : null;
      }
      
      return { ...state, browsers, activeBrowserId };
    }),

    setActiveBrowser: (id) => update((state) => ({
      ...state,
      activeBrowserId: id,
    })),

    updateBrowserState: (id, updates) => update((state) => ({
      ...state,
      browsers: state.browsers.map((b) => 
        b.id === id ? { ...b, ...updates } : b
      ),
    })),

    // Navigation methods
    navigate: (id, url) => update((state) => ({
      ...state,
      browsers: state.browsers.map((b) => 
        b.id === id ? { ...b, url, isLoading: true } : b
      ),
    })),

    setGlobalZoomLevel: (level) => update((state) => {
      // Clamp zoom between 0.5 (50%) and 2.0 (200%)
      const clampedLevel = Math.max(0.5, Math.min(2.0, level));
      return {
        ...state,
        globalZoomLevel: clampedLevel,
        browsers: state.browsers.map(b => ({ ...b, zoomLevel: clampedLevel }))
      };
    }),

    incrementZoom: () => update((state) => {
      const newLevel = Math.max(0.5, Math.min(2.0, state.globalZoomLevel + 0.1));
      return {
        ...state,
        globalZoomLevel: newLevel,
        browsers: state.browsers.map(b => ({ ...b, zoomLevel: newLevel }))
      };
    }),

    decrementZoom: () => update((state) => {
      const newLevel = Math.max(0.5, Math.min(2.0, state.globalZoomLevel - 0.1));
      return {
        ...state,
        globalZoomLevel: newLevel,
        browsers: state.browsers.map(b => ({ ...b, zoomLevel: newLevel }))
      };
    }),

    // Get browsers for a specific workspace (derived)
    getWorkspaceBrowsers: (workspaceId) => {
      let result = [];
      const unsubscribe = subscribe((state) => {
        result = state.browsers.filter(b => b.workspaceId === workspaceId);
      });
      unsubscribe();
      return result;
    },
  };
}

export const browserStore = createBrowserStore();

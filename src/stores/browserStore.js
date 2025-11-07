import { writable } from 'svelte/store';

// Browser store - keeps ALL browsers across all workspaces
function createBrowserStore() {
  const { subscribe, set, update } = writable({
    browsers: [], // Array of { id, url, title, workspaceId, canGoBack, canGoForward, isLoading }
    activeBrowserId: null,
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
        isLoading: false
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

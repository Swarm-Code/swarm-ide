import { writable } from 'svelte/store';

// Browser store - keeps ALL browsers across all workspaces
function createBrowserStore() {
  const { subscribe, set, update } = writable({
    browsers: [], // Array of { id, url, title, workspaceId, canGoBack, canGoForward, isLoading }
    activeBrowserId: null,
  });

  const getSnapshot = () => {
    let snapshot;
    const unsubscribe = subscribe((state) => {
      snapshot = state;
    });
    unsubscribe();
    return snapshot;
  };

  return {
    subscribe,

    addBrowser: (id, url, workspaceId, options = {}) => update((state) => {
      if (!id || !workspaceId) {
        return state;
      }

      const existing = state.browsers.find((b) => b.id === id);
      const nextBrowser = {
        id,
        url: url || existing?.url || 'about:blank',
        title: options.title || existing?.title || 'New Tab',
        workspaceId,
        canGoBack: existing?.canGoBack ?? false,
        canGoForward: existing?.canGoForward ?? false,
        isLoading: existing?.isLoading ?? false,
        type: options.type || existing?.type || 'generic',
        metadata: options.metadata || existing?.metadata || {},
      };

      const browsers = existing
        ? state.browsers.map((b) => (b.id === id ? nextBrowser : b))
        : [...state.browsers, nextBrowser];

      return {
        ...state,
        browsers,
        activeBrowserId: id,
      };
    }),

    getBrowserById: (browserId) => {
      const snapshot = getSnapshot();
      return snapshot.browsers.find((b) => b.id === browserId) || null;
    },

    hasBrowser: (browserId) => {
      const snapshot = getSnapshot();
      return snapshot.browsers.some((b) => b.id === browserId);
    },

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

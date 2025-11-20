import { writable } from 'svelte/store';

// Main app state store
function createAppStore() {
  const { subscribe, set, update } = writable({
    currentProject: null, // { path, name, lastOpened }
    theme: 'light',
    activePanel: 'explorer', // 'explorer', 'git', 'search'
    sidebarVisible: true, // sidebar visibility
    overlayVisible: false, // tracks if any overlay (workspace switcher, modals) is open
    iconTheme: 'material', // 'material' or 'vscode'
  });

  return {
    subscribe,
    setCurrentProject: (project) => update((state) => ({
      ...state,
      currentProject: project,
    })),
    clearCurrentProject: () => update((state) => ({
      ...state,
      currentProject: null,
    })),
    setTheme: (theme) => update((state) => ({ ...state, theme })),
    setActivePanel: (panel) => update((state) => ({ ...state, activePanel: panel })),
    toggleSidebar: () => update((state) => ({ 
      ...state, 
      sidebarVisible: !state.sidebarVisible 
    })),
    setSidebarVisible: (visible) => update((state) => ({ 
      ...state, 
      sidebarVisible: visible 
    })),
    setOverlayVisible: (visible) => update((state) => ({
      ...state,
      overlayVisible: visible
    })),
    setIconTheme: (theme) => update((state) => ({ ...state, iconTheme: theme })),
  };
}

export const appStore = createAppStore();

import { writable, derived } from 'svelte/store';
import { activeWorkspacePath } from './workspaceStore.js';

// Git store for managing git state per workspace
function createGitStore() {
  const { subscribe, set, update } = writable({
    workspaceGitData: {}, // Map of workspacePath -> gitData
    currentWorkspacePath: null,
  });

  let currentPath = null;
  let refreshInterval = null;

  // Subscribe to workspace changes
  activeWorkspacePath.subscribe((path) => {
    currentPath = path;
    update((state) => ({ ...state, currentWorkspacePath: path }));
    
    // Clear old interval
    if (refreshInterval) {
      clearInterval(refreshInterval);
    }
    
    // Start auto-refresh for new workspace
    if (path) {
      loadGitData(path);
      refreshInterval = setInterval(() => loadGitData(path), 2000); // Refresh every 2s
    }
  });

  async function loadGitData(workspacePath) {
    if (!workspacePath || !window.electronAPI?.gitStatus) return;
    
    try {
      const [status, branches, log] = await Promise.all([
        window.electronAPI.gitStatus({ cwd: workspacePath }),
        window.electronAPI.gitBranches({ cwd: workspacePath }),
        window.electronAPI.gitLog({ cwd: workspacePath, maxCount: 50 })
      ]);

      update((state) => ({
        ...state,
        workspaceGitData: {
          ...state.workspaceGitData,
          [workspacePath]: {
            status,
            branches,
            log,
            lastUpdated: Date.now()
          }
        }
      }));
    } catch (error) {
      console.error('[gitStore] Failed to load git data:', error);
    }
  }

  return {
    subscribe,
    refresh: () => {
      if (currentPath) {
        loadGitData(currentPath);
      }
    },
    stageFile: async (filePath) => {
      if (!currentPath || !window.electronAPI?.gitAdd) return;
      try {
        await window.electronAPI.gitAdd({ cwd: currentPath, files: [filePath] });
        await loadGitData(currentPath);
      } catch (error) {
        console.error('[gitStore] Failed to stage file:', error);
      }
    },
    unstageFile: async (filePath) => {
      if (!currentPath || !window.electronAPI?.gitReset) return;
      try {
        await window.electronAPI.gitReset({ cwd: currentPath, files: [filePath] });
        await loadGitData(currentPath);
      } catch (error) {
        console.error('[gitStore] Failed to unstage file:', error);
      }
    },
    stageAll: async () => {
      if (!currentPath || !window.electronAPI?.gitAdd) return;
      try {
        await window.electronAPI.gitAdd({ cwd: currentPath, files: ['.'] });
        await loadGitData(currentPath);
      } catch (error) {
        console.error('[gitStore] Failed to stage all:', error);
      }
    },
    unstageAll: async () => {
      if (!currentPath || !window.electronAPI?.gitReset) return;
      try {
        await window.electronAPI.gitReset({ cwd: currentPath });
        await loadGitData(currentPath);
      } catch (error) {
        console.error('[gitStore] Failed to unstage all:', error);
      }
    },
    commit: async (message) => {
      if (!currentPath || !window.electronAPI?.gitCommit) return;
      try {
        await window.electronAPI.gitCommit({ cwd: currentPath, message });
        await loadGitData(currentPath);
      } catch (error) {
        console.error('[gitStore] Failed to commit:', error);
        throw error;
      }
    },
    checkout: async (branchName) => {
      if (!currentPath || !window.electronAPI?.gitCheckout) return;
      try {
        await window.electronAPI.gitCheckout({ cwd: currentPath, branch: branchName });
        await loadGitData(currentPath);
      } catch (error) {
        console.error('[gitStore] Failed to checkout:', error);
        throw error;
      }
    },
    getDiff: async (filePath) => {
      if (!currentPath || !window.electronAPI?.gitDiff) return null;
      try {
        return await window.electronAPI.gitDiff({ cwd: currentPath, file: filePath });
      } catch (error) {
        console.error('[gitStore] Failed to get diff:', error);
        return null;
      }
    }
  };
}

export const gitStore = createGitStore();

// Derived store for current workspace git data
export const currentGitData = derived(
  gitStore,
  ($gitStore) => {
    if (!$gitStore.currentWorkspacePath) return null;
    return $gitStore.workspaceGitData[$gitStore.currentWorkspacePath] || null;
  }
);

import { writable } from 'svelte/store';
import { browserStore } from './browserStore.js';
import { editorStore } from './editorStore.js';
import { workspaceStore, activeWorkspacePath } from './workspaceStore.js';

const initialState = {
  initialized: false,
  status: { state: 'stopped', message: 'DeepWiki idle', logs: [] },
  settings: null,
  error: null,
  browserErrors: {},
};

const normalizeSettings = (settings = {}) => ({
  ...settings,
  env: { ...(settings?.env || {}) },
});

function createDeepWikiStore() {
  const { subscribe, update } = writable(initialState);

  let initializing = false;
  let browsersSnapshot = [];
  let workspaceState = { workspaces: [], activeWorkspaceId: null };
  let activeWorkspace = null;
  let activeWorkspacePathValue = null;
  const workspaceBrowserIds = new Map();

  const getSnapshot = () => {
    let snapshot;
    const unsubscribe = subscribe((state) => {
      snapshot = state;
    });
    unsubscribe();
    return snapshot;
  };

  const setBrowserError = (browserId, payload) => {
    if (!browserId) return;
    update((state) => ({
      ...state,
      browserErrors: {
        ...state.browserErrors,
        [browserId]: {
          browserId,
          timestamp: Date.now(),
          ...payload,
        },
      },
      error: payload?.message || state.error,
    }));
  };

  const clearBrowserError = (browserId) => {
    if (!browserId) return;
    update((state) => {
      if (!state.browserErrors?.[browserId]) {
        return state;
      }
      const nextErrors = { ...state.browserErrors };
      delete nextErrors[browserId];
      return {
        ...state,
        browserErrors: nextErrors,
        error: Object.keys(nextErrors).length === 0 ? null : state.error,
      };
    });
  };

  const isServiceRunning = () => {
    const status = getSnapshot().status;
    return status?.state === 'running';
  };

  browserStore.subscribe((state) => {
    browsersSnapshot = state.browsers;
  });

  workspaceStore.subscribe((state) => {
    workspaceState = state;
    activeWorkspace = state.workspaces.find((w) => w.id === state.activeWorkspaceId) || null;
    const workspaceIds = new Set(state.workspaces.map((w) => w.id));
    for (const [workspaceId, browserId] of workspaceBrowserIds.entries()) {
      if (!workspaceIds.has(workspaceId)) {
        cleanupBrowser(browserId);
        workspaceBrowserIds.delete(workspaceId);
      }
    }
    if (activeWorkspace && getCurrentSettings()?.enabled) {
      ensureWorkspaceBrowser(activeWorkspace, { focus: false });
    }
  });

  activeWorkspacePath.subscribe((path) => {
    activeWorkspacePathValue = path;
    if (activeWorkspace && path && getCurrentSettings()?.enabled) {
      if (isServiceRunning()) {
        ensureWorkspaceBrowser(activeWorkspace, { forceNavigate: true });
      }
    }
  });

  function getCurrentSettings() {
    return getSnapshot().settings;
  }

  function buildPluginUrl(workspace) {
    const settings = getCurrentSettings() || {};
    const port = settings.frontendPort ?? 3007;
    const params = new URLSearchParams({
      workspaceId: workspace.id,
      workspaceName: getWorkspaceName(workspace.path),
      workspacePath: workspace.path || '',
    });
    if (settings.autoGenerate) {
      params.set('autoGenerate', 'true');
    }
    return `http://localhost:${port}/ide-plugin?${params.toString()}`;
  }

  function getWorkspaceName(workspacePath) {
    if (!workspacePath) return 'workspace';
    const parts = workspacePath.split(/[\\/]/).filter(Boolean);
    return parts[parts.length - 1] || 'workspace';
  }

  async function ensureWorkspaceContext() {
    if (activeWorkspace) {
      return activeWorkspace;
    }

    if (!activeWorkspacePathValue) {
      console.warn('[DeepWiki] No active workspace path');
      return null;
    }

    const fallbackId = `dw-${activeWorkspacePathValue}`;
    const fallback = {
      id: fallbackId,
      path: activeWorkspacePathValue,
      color: '#0071e3',
    };

    workspaceStore.addWorkspace(fallback);
    workspaceStore.setActiveWorkspace(fallbackId);

    if (window.electronAPI) {
      try {
        await window.electronAPI.workspaceSave([...workspaceState.workspaces, fallback]);
        await window.electronAPI.workspaceSetActive(fallbackId);
      } catch (error) {
        console.warn('[DeepWiki] Failed to persist fallback workspace', error);
      }
    }

    return fallback;
  }

  async function cleanupBrowser(browserId) {
    if (!browserId) return;
    try {
      if (window.electronAPI) {
        await window.electronAPI.browserDestroy({ browserId });
      }
    } catch (error) {
      console.warn('[DeepWiki] Failed to destroy browser', browserId, error);
    }
    editorStore.removeBrowserTabs(browserId);
    browserStore.removeBrowser(browserId);
    clearBrowserError(browserId);
  }

  async function disableAllBrowsers() {
    const ids = Array.from(workspaceBrowserIds.values());
    workspaceBrowserIds.clear();
    await Promise.all(ids.map((id) => cleanupBrowser(id)));
  }

  function findWorkspaceForBrowser(browserId) {
    for (const [workspaceId, mappedBrowserId] of workspaceBrowserIds.entries()) {
      if (mappedBrowserId === browserId) {
        return workspaceState.workspaces.find((w) => w.id === workspaceId) || null;
      }
    }
    return null;
  }

  function createOrReuseBrowser(workspace, url) {
    let browserId = workspaceBrowserIds.get(workspace.id);
    const browserExists = browserId && browsersSnapshot.some((b) => b.id === browserId);
    const initialUrl = isServiceRunning() ? url : 'about:blank';

    if (!browserExists) {
      browserId = `deepwiki-${workspace.id}`;
      workspaceBrowserIds.set(workspace.id, browserId);
      browserStore.addBrowser(browserId, initialUrl, workspace.id, {
        title: 'DeepWiki',
        type: 'deepwiki',
        metadata: {
          workspaceId: workspace.id,
          workspaceName: getWorkspaceName(workspace.path),
        },
      });
      editorStore.addBrowser(browserId, initialUrl, { title: 'DeepWiki' });
    }

    return browserId;
  }

  async function navigateBrowser(browserId, url, { force = false } = {}) {
    const existing = browsersSnapshot.find((b) => b.id === browserId);
    if (!force && existing?.url === url) {
      return;
    }
    browserStore.updateBrowserState(browserId, { url });
    if (window.electronAPI) {
      try {
        await window.electronAPI.browserNavigate({ browserId, url });
      } catch (error) {
        console.error('[DeepWiki] Failed to navigate browser', browserId, error);
      }
    }
  }

  async function ensureWorkspaceBrowser(workspace, { focus = false, forceNavigate = false } = {}) {
    if (!workspace) {
      return null;
    }

    const url = buildPluginUrl(workspace);
    const browserId = createOrReuseBrowser(workspace, url);

    if (focus) {
      editorStore.focusBrowserTab(browserId);
    }

    const settings = getCurrentSettings();
    if (!settings?.enabled) {
      return browserId;
    }

    const status = getSnapshot().status;
    const ready = status?.state === 'running';
    if (ready) {
      await navigateBrowser(browserId, url, { force: forceNavigate });
      return browserId;
    }

    if (status?.state === 'error' || status?.state === 'stopped') {
      start();
    }

    return browserId;
  }

  async function initialize() {
    if (initializing) return;
    initializing = true;

    if (!window.electronAPI) {
      update((state) => ({ ...state, initialized: true }));
      return;
    }

    try {
      const [settings, status] = await Promise.all([
        window.electronAPI.deepwikiGetSettings(),
        window.electronAPI.deepwikiGetStatus(),
      ]);

      const normalizedSettings = normalizeSettings(settings);
      update((state) => ({
        ...state,
        initialized: true,
        settings: normalizedSettings,
        status,
        error: status.state === 'error' ? status.message : null,
      }));

      window.electronAPI.onDeepWikiStatus((payload) => {
        update((state) => ({
          ...state,
          status: payload,
          error: payload.state === 'error' ? payload.message : null,
        }));

        if (payload.state === 'running' && getCurrentSettings()?.enabled && activeWorkspace) {
          const shouldFocus = getCurrentSettings()?.openPaneOnLaunch && !workspaceBrowserIds.has(activeWorkspace.id);
          ensureWorkspaceBrowser(activeWorkspace, { focus: shouldFocus, forceNavigate: true });
        }
      });

      if (window.electronAPI.onBrowserError) {
        window.electronAPI.onBrowserError((payload = {}) => {
          const { browserId, code, description, url: failingUrl } = payload;
          const rawError = payload.error || payload.message || '';
          if (!browserId || !browserId.startsWith('deepwiki-')) {
            return;
          }

          const workspaceForBrowser = findWorkspaceForBrowser(browserId) || activeWorkspace;
          const url = workspaceForBrowser ? buildPluginUrl(workspaceForBrowser) : null;
          const frontendPort = getCurrentSettings()?.frontendPort ?? 3007;
          const fallbackUrl = url || `http://localhost:${frontendPort}/ide-plugin`;
          const message = rawError
            ? rawError
            : `DeepWiki UI isn't reachable at ${failingUrl || fallbackUrl}. Start or restart the services from the DeepWiki menu.`;

          setBrowserError(browserId, {
            message,
            code: code ?? null,
            url: failingUrl || fallbackUrl,
            workspaceId: workspaceForBrowser?.id || null,
          });
        });
      }

      if (window.electronAPI.onBrowserLoading) {
        window.electronAPI.onBrowserLoading(({ browserId, isLoading }) => {
          if (!browserId || !browserId.startsWith('deepwiki-') || !isLoading) {
            return;
          }
          clearBrowserError(browserId);
        });
      }

      if (normalizedSettings?.enabled && status.state === 'running' && activeWorkspace) {
        await ensureWorkspaceBrowser(activeWorkspace, { focus: normalizedSettings.openPaneOnLaunch });
      }
    } catch (error) {
      console.error('[DeepWiki] Failed to initialize store:', error);
    }
  }

  async function start() {
    if (!window.electronAPI) return null;
    update((state) => ({
      ...state,
      status: { ...state.status, state: 'starting', message: 'Starting DeepWiki…' },
      error: null,
    }));
    const status = await window.electronAPI.deepwikiStart();
    update((state) => ({
      ...state,
      status,
      error: status.state === 'error' ? status.message : null,
    }));
    if (status.state === 'running' && activeWorkspace && getCurrentSettings()?.enabled) {
      await ensureWorkspaceBrowser(activeWorkspace, { focus: getCurrentSettings()?.openPaneOnLaunch });
    }
    return status;
  }

  async function stop() {
    if (!window.electronAPI) return null;
    await disableAllBrowsers();
    const status = await window.electronAPI.deepwikiStop();
    update((state) => ({
      ...state,
      status,
      error: status.state === 'error' ? status.message : null,
    }));
    return status;
  }

  async function saveSettings(nextSettings) {
    if (!window.electronAPI) return null;
    const previous = getCurrentSettings();
    const updatedRaw = await window.electronAPI.deepwikiUpdateSettings(nextSettings);
    const updated = normalizeSettings(updatedRaw);
    update((state) => ({ ...state, settings: updated }));

    const envChanged = JSON.stringify(previous?.env || {}) !== JSON.stringify(updated.env || {});

    const requiresRestart = previous && (
      previous.repoPath !== updated.repoPath ||
      previous.backendPort !== updated.backendPort ||
      previous.frontendPort !== updated.frontendPort ||
      previous.pythonCommand !== updated.pythonCommand ||
      previous.nodeCommand !== updated.nodeCommand ||
      previous.provider !== updated.provider ||
      previous.model !== updated.model ||
      envChanged
    );

    if (!updated.enabled) {
      await disableAllBrowsers();
      await stop();
      return updated;
    }

    if (requiresRestart && getSnapshot().status.state === 'running') {
      await stop();
      await start();
    } else if (getSnapshot().status.state === 'stopped') {
      await start();
    }

    return updated;
  }

  async function openForActiveWorkspace({ focus = true } = {}) {
    const workspace = await ensureWorkspaceContext();
    if (!workspace) {
      console.warn('[DeepWiki] No active workspace to open');
      return null;
    }

    if (!getCurrentSettings()?.enabled) {
      await saveSettings({ enabled: true });
    }

    return ensureWorkspaceBrowser(workspace, { focus, forceNavigate: true });
  }

  async function regenerateActiveWorkspace() {
    if (!activeWorkspace) {
      return null;
    }
    return ensureWorkspaceBrowser(activeWorkspace, { focus: false, forceNavigate: true });
  }

  return {
    subscribe,
    initialize,
    start,
    stop,
    saveSettings,
    openForActiveWorkspace,
    regenerateActiveWorkspace,
  };
}

export const deepWikiStore = createDeepWikiStore();

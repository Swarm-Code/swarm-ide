<script>
  import { onMount, onDestroy, tick } from 'svelte';
  import { appStore } from '../stores/appStore.js';
  import { workspaceStore } from '../stores/workspaceStore.js';
  import { terminalStore } from '../stores/terminalStore.js';
  import { browserStore } from '../stores/browserStore.js';
  import { editorStore } from '../stores/editorStore.js';
  import { activeWorkspacePath } from '../stores/workspaceStore.js';
  import ActivityBar from './ActivityBar.svelte';
  import WorkspaceSwitcher from './WorkspaceSwitcher.svelte';
  import FileExplorer from './FileExplorer.svelte';
  import EditorCanvas from './EditorCanvas.svelte';
  import TerminalPanel from './TerminalPanel.svelte';
  import DiagnosticsPanel from './DiagnosticsPanel.svelte';
  import Terminal from './Terminal.svelte';

  let currentProject = null;
  let sidebarVisible = true;
  let terminalVisible = false;
  let diagnosticsVisible = false;
  let activeWorkspaceId = null;
  let workspaces = [];
  let allTerminals = [];
  let allBrowsers = [];
  let currentWorkspacePath = null;
  let activeTerminalId = null;
  let editorLayout = null;

  terminalStore.subscribe((state) => {
    allTerminals = state.terminals;
    activeTerminalId = state.activeTerminalId;
  });

  browserStore.subscribe((state) => {
    allBrowsers = state.browsers;
  });

  editorStore.subscribe((state) => {
    editorLayout = state.layout;
  });

  activeWorkspacePath.subscribe((path) => {
    currentWorkspacePath = path;
  });

  // Filter terminals for current workspace only
  $: workspaceTerminals = allTerminals.filter(t => t.workspaceId === activeWorkspaceId);
  
  // Filter browsers for current workspace only
  $: workspaceBrowsers = allBrowsers.filter(b => b.workspaceId === activeWorkspaceId);

  // Position terminals into their display areas
  async function positionTerminals() {
    await tick();
    
    console.log('[IDEWindow] positionTerminals() called - activeWorkspaceId:', activeWorkspaceId);
    
    const globalContainer = document.querySelector('.global-terminal-container');
    if (!globalContainer) return;

    // Get all terminal wrappers
    const terminalElements = globalContainer.querySelectorAll('[data-terminal-id]');
    console.log('[IDEWindow] Found terminal elements:', terminalElements.length);
    
    terminalElements.forEach(terminalEl => {
      const terminalId = terminalEl.getAttribute('data-terminal-id');
      
      console.log('[IDEWindow] Processing terminal:', terminalId);
      
      // Check if terminal is in a canvas pane
      let targetContainer = null;
      const canvasPanes = document.querySelectorAll('[data-terminal-location="canvas-pane"]');
      console.log('[IDEWindow] Canvas panes found:', canvasPanes.length);
      
      for (const pane of canvasPanes) {
        const paneActiveTerminal = pane.getAttribute('data-active-terminal');
        console.log('[IDEWindow] Canvas pane active terminal:', paneActiveTerminal, 'checking against:', terminalId);
        if (paneActiveTerminal === terminalId) {
          targetContainer = pane;
          console.log('[IDEWindow] Found target container in canvas pane');
          break;
        }
      }
      
      // If not in canvas, check bottom panel
      if (!targetContainer) {
        const bottomPanel = document.querySelector('[data-terminal-location="bottom-panel"]');
        const panelActiveTerminal = bottomPanel?.getAttribute('data-active-terminal');
        console.log('[IDEWindow] Bottom panel active terminal:', panelActiveTerminal, 'checking against:', terminalId);
        if (panelActiveTerminal === terminalId) {
          targetContainer = bottomPanel;
          console.log('[IDEWindow] Found target container in bottom panel');
        }
      }
      
      // Check if terminal belongs to current workspace
      const terminalWorkspaceId = terminalEl.getAttribute('data-workspace-id');
      const isInCurrentWorkspace = terminalWorkspaceId === activeWorkspaceId;
      
      // Position the terminal
      if (targetContainer && isInCurrentWorkspace) {
        const rect = targetContainer.getBoundingClientRect();
        terminalEl.style.top = `${rect.top}px`;
        terminalEl.style.left = `${rect.left}px`;
        terminalEl.style.width = `${rect.width}px`;
        terminalEl.style.height = `${rect.height}px`;
        terminalEl.style.display = 'block';
        console.log('[IDEWindow] Positioned terminal', terminalId, 'at', rect);
      } else {
        terminalEl.style.display = 'none';
        if (!isInCurrentWorkspace) {
          console.log('[IDEWindow] Hiding terminal', terminalId, '- different workspace');
        } else {
          console.log('[IDEWindow] Hiding terminal', terminalId, '- no target container');
        }
      }
    });
  }

  // Position browsers into their display areas
  async function positionBrowsers() {
    // Wait for DOM to settle after layout changes
    await tick();
    // Give extra time for CSS transitions and layout reflow
    await new Promise(resolve => setTimeout(resolve, 50));
    
    if (!window.electronAPI) return;
    
    console.log('[IDEWindow] positionBrowsers() called - activeWorkspaceId:', activeWorkspaceId);
    
    // For each browser in current workspace
    for (const browser of workspaceBrowsers) {
      // Find target pane - look for the CONTENT area, not the whole pane
      const canvasPanes = document.querySelectorAll('[data-browser-location="canvas-pane"]');
      let targetContainer = null;
      
      for (const pane of canvasPanes) {
        const paneActiveBrowser = pane.getAttribute('data-active-browser');
        if (paneActiveBrowser === browser.id) {
          targetContainer = pane;
          console.log('[IDEWindow] Found target container for browser:', browser.id);
          break;
        }
      }
      
      if (targetContainer) {
        const rect = targetContainer.getBoundingClientRect();
        
        console.log('[IDEWindow] Browser content container rect for', browser.id, ':', {
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height
        });
        
        // Call Electron to position WebContentsView
        try {
          const bounds = {
            x: Math.round(rect.left),
            y: Math.round(rect.top),
            width: Math.round(rect.width),
            height: Math.round(rect.height)
          };
          
          await window.electronAPI.browserSetBounds({
            browserId: browser.id,
            bounds
          });
          
          console.log('[IDEWindow] ✅ Positioned browser', browser.id, 'with bounds:', bounds);
        } catch (error) {
          console.error('[IDEWindow] ❌ Error positioning browser:', error);
        }
      } else {
        // Hide browser if not in any pane
        try {
          await window.electronAPI.browserHide({ browserId: browser.id });
          console.log('[IDEWindow] Hiding browser', browser.id, '- no target container');
        } catch (error) {
          console.error('[IDEWindow] Error hiding browser:', error);
        }
      }
    }
  }

  // Reposition on state changes
  $: if (workspaceTerminals || activeTerminalId || editorLayout || terminalVisible || activeWorkspaceId) {
    positionTerminals();
  }

  // Reposition browsers on state changes
  // This runs whenever any of these dependencies change
  $: if (workspaceBrowsers.length >= 0 || editorLayout || terminalVisible !== undefined || activeWorkspaceId) {
    positionBrowsers();
  }
  
  // ALSO reposition browsers on window resize
  // This is already handled in onMount with addEventListener

  appStore.subscribe((state) => {
    currentProject = state.currentProject;
    sidebarVisible = state.sidebarVisible;
  });

  workspaceStore.subscribe((state) => {
    activeWorkspaceId = state.activeWorkspaceId;
    workspaces = state.workspaces;
  });

  $: activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId);
  $: workspacePath = activeWorkspace?.path || currentProject?.path;

  async function handleCloseProject() {
    // Clear workspaces when closing project
    if (window.electronAPI) {
      await window.electronAPI.workspaceClear();
    }
    workspaceStore.setWorkspaces([]);
    workspaceStore.setActiveWorkspace(null);
    appStore.clearCurrentProject();
  }

  function handleKeydown(event) {
    // Ctrl+B (Windows/Linux) or Cmd+B (Mac)
    if ((event.ctrlKey || event.metaKey) && event.key === 'b') {
      event.preventDefault();
      appStore.toggleSidebar();
    }
    // Ctrl+` (backtick) to toggle terminal
    if ((event.ctrlKey || event.metaKey) && event.key === '`') {
      event.preventDefault();
      terminalVisible = !terminalVisible;
    }
    // Ctrl+Shift+M to toggle diagnostics
    if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'M') {
      event.preventDefault();
      diagnosticsVisible = !diagnosticsVisible;
    }
  }

  onMount(async () => {
    window.addEventListener('keydown', handleKeydown);
    window.addEventListener('resize', positionTerminals);
    window.addEventListener('resize', positionBrowsers);
    
    // Initial positioning
    positionTerminals();
    positionBrowsers();
    
    // Load saved workspaces
    if (window.electronAPI) {
      const savedWorkspaces = await window.electronAPI.workspaceGetAll();
      const savedActiveId = await window.electronAPI.workspaceGetActive();
      
      if (savedWorkspaces && savedWorkspaces.length > 0) {
        workspaceStore.setWorkspaces(savedWorkspaces);
        
        // If we have a current project, find or create its workspace
        if (currentProject) {
          const projectWorkspace = savedWorkspaces.find(w => w.path === currentProject.path);
          
          if (projectWorkspace) {
            workspaceStore.setActiveWorkspace(projectWorkspace.id);
            await window.electronAPI.workspaceSetActive(projectWorkspace.id);
          } else {
            // Create workspace for current project
            const workspace = {
              id: Date.now().toString(),
              path: currentProject.path,
              color: '#0071e3',
            };
            workspaceStore.addWorkspace(workspace);
            workspaceStore.setActiveWorkspace(workspace.id);
            await window.electronAPI.workspaceSave([...savedWorkspaces, workspace]);
            await window.electronAPI.workspaceSetActive(workspace.id);
          }
        } else if (savedActiveId) {
          workspaceStore.setActiveWorkspace(savedActiveId);
        }
      } else if (currentProject) {
        // No saved workspaces, create first one from current project
        const workspace = {
          id: Date.now().toString(),
          path: currentProject.path,
          color: '#0071e3',
        };
        workspaceStore.addWorkspace(workspace);
        workspaceStore.setActiveWorkspace(workspace.id);
        await window.electronAPI.workspaceSave([workspace]);
        await window.electronAPI.workspaceSetActive(workspace.id);
      }
    }
  });

  onDestroy(() => {
    window.removeEventListener('keydown', handleKeydown);
    window.removeEventListener('resize', positionTerminals);
    window.removeEventListener('resize', positionBrowsers);
  });
</script>

<div class="ide-window">
  <div class="ide-header">
    <WorkspaceSwitcher />
    <button class="close-button" on:click={handleCloseProject}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M6 18L18 6M6 6l12 12"
        />
      </svg>
    </button>
  </div>

  <div class="ide-content">
    <ActivityBar 
      {terminalVisible} 
      onToggleTerminal={() => terminalVisible = !terminalVisible}
    />
    {#if sidebarVisible}
      <div class="sidebar">
        <FileExplorer projectPath={workspacePath} />
      </div>
    {/if}
    <div class="main-area">
      <div class="editor-area" style="height: {terminalVisible || diagnosticsVisible ? '60%' : '100%'}">
        <EditorCanvas />
      </div>
      <div class="bottom-panel-container">
        <div class="bottom-panel-tabs" class:hidden={!terminalVisible && !diagnosticsVisible}>
          <button 
            class="panel-tab" 
            class:active={terminalVisible && !diagnosticsVisible}
            on:click={() => { terminalVisible = true; diagnosticsVisible = false; }}
          >
            Terminal
          </button>
          <button 
            class="panel-tab" 
            class:active={diagnosticsVisible}
            on:click={() => { diagnosticsVisible = true; terminalVisible = false; }}
          >
            Problems
          </button>
        </div>
        <div class="terminal-area" class:hidden={!terminalVisible || diagnosticsVisible}>
          <TerminalPanel />
        </div>
        <div class="diagnostics-area" class:hidden={!diagnosticsVisible}>
          <DiagnosticsPanel />
        </div>
      </div>
    </div>
  </div>

  <!-- Global terminal container - ALL terminals render here ONCE -->
  <div class="global-terminal-container">
    {#each allTerminals as terminal (terminal.id)}
      <div class="terminal-wrapper" data-terminal-id={terminal.id} data-workspace-id={terminal.workspaceId}>
        <Terminal 
          terminalId={terminal.id}
          cwd={currentWorkspacePath}
        />
      </div>
    {/each}
  </div>
</div>

<style>
  .global-terminal-container {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 9999;
  }

  .global-terminal-container :global(.terminal-wrapper) {
    position: absolute;
    width: 100%;
    height: 100%;
    pointer-events: auto;
  }

  .ide-window {
    width: 100%;
    height: 100vh;
    display: flex;
    flex-direction: column;
    background-color: var(--color-background);
  }

  .ide-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--spacing-sm) var(--spacing-md);
    background-color: var(--color-surface-secondary);
    border-bottom: 1px solid var(--color-border);
    height: 44px;
  }

  .close-button {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-sm);
    transition: all var(--transition-fast);
    color: var(--color-text-secondary);
  }

  .close-button:hover {
    background-color: var(--color-surface-hover);
    color: var(--color-text-primary);
  }

  .close-button svg {
    width: 18px;
    height: 18px;
  }

  .ide-content {
    display: flex;
    flex: 1;
    overflow: hidden;
  }

  .sidebar {
    width: 260px;
    background-color: var(--color-surface-secondary);
    border-right: 1px solid var(--color-border);
    overflow-y: auto;
  }

  .main-area {
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .editor-area {
    width: 100%;
    overflow: hidden;
    transition: height var(--transition-fast);
  }

  .bottom-panel-container {
    flex: 1;
    display: flex;
    flex-direction: column;
    border-top: 1px solid var(--color-border);
  }

  .bottom-panel-tabs {
    display: flex;
    gap: var(--spacing-xs);
    padding: var(--spacing-xs);
    background-color: var(--color-surface-secondary);
    border-bottom: 1px solid var(--color-border);
  }

  .bottom-panel-tabs.hidden {
    display: none;
  }

  .panel-tab {
    padding: var(--spacing-xs) var(--spacing-md);
    background-color: transparent;
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    border-radius: var(--radius-sm);
    transition: all var(--transition-fast);
  }

  .panel-tab:hover {
    background-color: var(--color-surface-hover);
    color: var(--color-text-primary);
  }

  .panel-tab.active {
    background-color: var(--color-accent);
    color: white;
  }

  .terminal-area,
  .diagnostics-area {
    flex: 1;
    overflow: hidden;
  }

  .terminal-area.hidden,
  .diagnostics-area.hidden {
    display: none;
  }
</style>

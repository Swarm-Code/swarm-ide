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
  import ChatPanel from './ChatPanel.svelte';

  let currentProject = null;
  let explorerVisible = true; // Local state like terminal
  let terminalVisible = false;
  let diagnosticsVisible = false;
  let chatVisible = true; // Chat panel visible by default
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
        const wasHidden = terminalEl.style.display === 'none';
        const rect = targetContainer.getBoundingClientRect();
        terminalEl.style.top = `${rect.top}px`;
        terminalEl.style.left = `${rect.left}px`;
        terminalEl.style.width = `${rect.width}px`;
        terminalEl.style.height = `${rect.height}px`;
        terminalEl.style.display = 'block';
        console.log('[IDEWindow] Positioned terminal', terminalId, 'at', rect);
        
        // If terminal was just made visible, refresh it to fix sizing
        if (wasHidden) {
          const terminalComponent = terminalComponents.get(terminalId);
          if (terminalComponent && terminalComponent.refresh) {
            // Use requestAnimationFrame for instant refresh after paint
            requestAnimationFrame(() => {
              terminalComponent.refresh();
              console.log('[IDEWindow] Refreshed terminal', terminalId, 'after becoming visible');
            });
          }
        }
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
    // 🔧 Debounce rapid calls but keep it snappy (one frame = 16ms)
    if (positionBrowsersTimeout) {
      clearTimeout(positionBrowsersTimeout);
    }
    
    positionBrowsersTimeout = setTimeout(async () => {
      // Wait for DOM to settle after layout changes
      await tick();
      // Use requestAnimationFrame for instant positioning after next paint
      await new Promise(resolve => requestAnimationFrame(resolve));
      
      if (!window.electronAPI) return;
      
      console.log('[IDEWindow] positionBrowsers() called - activeWorkspaceId:', activeWorkspaceId);
      
      // Find all browser content areas in the DOM
      const canvasPanes = document.querySelectorAll('[data-browser-location="canvas-pane"]');
      
      for (const container of canvasPanes) {
        const browserId = container.getAttribute('data-active-browser');
        if (!browserId) continue;
        
        // Check if this browser belongs to current workspace
        const browser = allBrowsers.find(b => b.id === browserId && b.workspaceId === activeWorkspaceId);
        if (!browser) continue;
        
        const rect = container.getBoundingClientRect();
        
        // 🔧 CRITICAL FIX: Clamp WebContentsView bounds to window dimensions
        // WebContentsView uses window-relative coordinates and is NOT constrained by CSS
        // We must ensure it never exceeds window boundaries
        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;
        
        // Add safety inset to prevent overflow (accounts for scrollbars, rendering differences, etc.)
        const SAFETY_INSET = 2; // 2px inset on all sides
        
        const bounds = {
          // Add inset to x/y position
          x: Math.round(Math.max(0, rect.left + SAFETY_INSET)),
          y: Math.round(Math.max(0, rect.top + SAFETY_INSET)),
          // Subtract double inset from width/height (both sides)
          // Also clamp to remaining window space
          width: Math.round(Math.max(0, Math.min(
            rect.width - (SAFETY_INSET * 2),
            windowWidth - rect.left - (SAFETY_INSET * 2)
          ))),
          height: Math.round(Math.max(0, Math.min(
            rect.height - (SAFETY_INSET * 2),
            windowHeight - rect.top - (SAFETY_INSET * 2)
          )))
        };
        
        // 🔧 FIX 4: Check if bounds have actually changed before sending to Electron
        const cachedBounds = cachedBrowserBounds.get(browserId);
        if (cachedBounds && 
            cachedBounds.x === bounds.x && 
            cachedBounds.y === bounds.y && 
            cachedBounds.width === bounds.width && 
            cachedBounds.height === bounds.height) {
          console.log('[IDEWindow] ⏭️ Skipping browser', browserId, '- bounds unchanged');
          continue;
        }
        
        console.log('[IDEWindow] 🎯 Browser content container rect for', browserId, ':', {
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
          right: rect.right,
          bottom: rect.bottom,
          windowWidth: windowWidth,
          windowHeight: windowHeight
        });
        
        // Log clamping details with safety inset
        console.log('[IDEWindow] 🔒 Bounds clamping applied (with safety inset):', {
          original: {
            x: Math.round(rect.left),
            y: Math.round(rect.top),
            width: Math.round(rect.width),
            height: Math.round(rect.height)
          },
          clamped: bounds,
          safetyInset: SAFETY_INSET,
          validation: {
            'x + width ≤ windowWidth': `${bounds.x} + ${bounds.width} ≤ ${windowWidth} = ${bounds.x + bounds.width <= windowWidth}`,
            'y + height ≤ windowHeight': `${bounds.y} + ${bounds.height} ≤ ${windowHeight} = ${bounds.y + bounds.height <= windowHeight}`,
            'insetApplied': `Added ${SAFETY_INSET}px inset on all sides`
          }
        });
        
        // Call Electron to position WebContentsView
        try {
          await window.electronAPI.browserSetBounds({
            browserId: browserId,
            bounds
          });
          
          // Cache the bounds we just sent
          cachedBrowserBounds.set(browserId, bounds);
          
          console.log('[IDEWindow] ✅ Positioned browser', browserId, 'with bounds:', bounds);
        } catch (error) {
          console.error('[IDEWindow] ❌ Error positioning browser:', error);
        }
      }
      
      // Hide browsers not currently visible OR from other workspaces
      // This ensures persistence across workspace switches (like terminals)
      for (const browser of allBrowsers) {
        const isInCurrentWorkspace = browser.workspaceId === activeWorkspaceId;
        const isVisible = Array.from(canvasPanes).some(
          pane => pane.getAttribute('data-active-browser') === browser.id
        );
        
        // Hide if: wrong workspace OR (correct workspace but not visible in any pane)
        if (!isInCurrentWorkspace || !isVisible) {
          try {
            await window.electronAPI.browserHide({ browserId: browser.id });
            // Clear cached bounds when hiding
            cachedBrowserBounds.delete(browser.id);
            if (!isInCurrentWorkspace) {
              console.log('[IDEWindow] Hiding browser', browser.id, '- different workspace');
            } else {
              console.log('[IDEWindow] Hiding browser', browser.id, '- not visible');
            }
          } catch (error) {
            console.error('[IDEWindow] Error hiding browser:', error);
          }
        }
      }
    }, 16); // 16ms debounce (one frame) for snappy updates
  }

  // Reposition on state changes
  $: if (workspaceTerminals || activeTerminalId || editorLayout || terminalVisible || activeWorkspaceId || explorerVisible !== undefined) {
    positionTerminals();
  }

  // Reposition browsers on state changes
  // This runs whenever any of these dependencies change
  // 🔧 FIX 5: Fixed always-true condition (workspaceBrowsers.length >= 0 is always true)
  $: if (workspaceBrowsers && workspaceBrowsers.length > 0 || editorLayout || terminalVisible !== undefined || activeWorkspaceId || explorerVisible !== undefined) {
    positionBrowsers();
  }
  
  // ALSO reposition browsers on window resize
  // This is already handled in onMount with addEventListener

  appStore.subscribe((state) => {
    currentProject = state.currentProject;
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
    // Ctrl+B (Windows/Linux) or Cmd+B (Mac) to toggle explorer
    if ((event.ctrlKey || event.metaKey) && event.key === 'b') {
      event.preventDefault();
      explorerVisible = !explorerVisible;
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

  let resizeObserver;
  let editorAreaElement;
  let cachedBrowserBounds = new Map(); // browserId -> bounds (for deduplication)
  let positionBrowsersTimeout = null; // Debounce timer
  let terminalComponents = new Map(); // terminalId -> Terminal component instance

  onMount(async () => {
    window.addEventListener('keydown', handleKeydown);
    window.addEventListener('resize', positionTerminals);
    window.addEventListener('resize', positionBrowsers);
    
    // Watch .editor-area for size changes (handles terminal open/close transitions)
    editorAreaElement = document.querySelector('.editor-area');
    if (editorAreaElement) {
      resizeObserver = new ResizeObserver(() => {
        console.log('[IDEWindow] ResizeObserver detected .editor-area size change, repositioning browsers');
        positionBrowsers();
      });
      resizeObserver.observe(editorAreaElement);
    }
    
    // Listen for overlay close signal to reposition browsers
    if (window.electronAPI) {
      window.electronAPI.onBrowsersRepositionAfterOverlay(() => {
        console.log('[IDEWindow] Overlay closed, repositioning browsers');
        positionBrowsers();
      });
    }
    
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
    
    // Cleanup ResizeObserver
    if (resizeObserver) {
      resizeObserver.disconnect();
    }
  });
</script>

<div class="ide-window">
  <div class="ide-header">
    <WorkspaceSwitcher />
    <button class="chat-toggle-button" on:click={() => chatVisible = !chatVisible} title={chatVisible ? 'Hide Chat' : 'Show Chat'}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
        />
      </svg>
    </button>
  </div>

  <div class="ide-content">
    <ActivityBar 
      {terminalVisible} 
      onToggleTerminal={() => terminalVisible = !terminalVisible}
    />
    <div class="sidebar" class:hidden={!explorerVisible}>
      <FileExplorer projectPath={workspacePath} />
    </div>
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
    <div class="chat-sidebar" class:hidden={!chatVisible}>
      <ChatPanel />
    </div>
  </div>

  <!-- Global terminal container - ALL terminals render here ONCE -->
  <div class="global-terminal-container">
    {#each allTerminals as terminal (terminal.id)}
      <div class="terminal-wrapper" data-terminal-id={terminal.id} data-workspace-id={terminal.workspaceId}>
        <Terminal 
          bind:this={terminalComponents[terminal.id]}
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

  .chat-toggle-button {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-sm);
    transition: all var(--transition-fast);
    color: var(--color-text-secondary);
    background: transparent;
    border: none;
    cursor: pointer;
  }

  .chat-toggle-button:hover {
    background-color: var(--color-surface-hover);
    color: var(--color-text-primary);
  }

  .chat-toggle-button svg {
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

  .sidebar.hidden {
    display: none;
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

  .chat-sidebar {
    width: 350px;
    background-color: var(--color-background);
    overflow: hidden;
  }

  .chat-sidebar.hidden {
    display: none;
  }
</style>

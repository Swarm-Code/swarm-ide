<script>
  import { onMount, onDestroy, tick } from 'svelte';
  import { appStore } from '../stores/appStore.js';
  import { workspaceStore } from '../stores/workspaceStore.js';
  import { canvasStore } from '../stores/canvasStore.js';
  import { terminalStore } from '../stores/terminalStore.js';
  import { browserStore } from '../stores/browserStore.js';
  import { editorStore } from '../stores/editorStore.js';
  import { activeWorkspacePath } from '../stores/workspaceStore.js';
  import { deepWikiStore } from '../stores/deepWikiStore.js';
  import ActivityBar from './ActivityBar.svelte';
  import WorkspaceSwitcher from './WorkspaceSwitcher.svelte';
  import CanvasSwitcher from './CanvasSwitcher.svelte';
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
  let chatVisible = false; // Chat panel hidden by default
  let activeWorkspaceId = null;
  let workspaces = [];
  let allTerminals = [];
  let allBrowsers = [];
  let currentWorkspacePath = null;
  let activeTerminalId = null;
  let editorLayout = null;
  // Initialize to default state to prevent null errors
  let currentEditorState = {
    layout: { type: 'pane', id: 'pane-1', tabs: [], activeTabId: null },
    activePaneId: 'pane-1',
    nextPaneId: 2,
    nextTabId: 1
  };

  terminalStore.subscribe((state) => {
    allTerminals = state.terminals;
    activeTerminalId = state.activeTerminalId;
  });

  browserStore.subscribe((state) => {
    allBrowsers = state.browsers;
  });

  editorStore.subscribe((state) => {
    currentEditorState = state;
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
        
        // CRITICAL FIX: Blur terminal when hiding to release keyboard focus
        const terminalComponent = terminalComponents.get(terminalId);
        if (terminalComponent && terminalComponent.blur) {
          terminalComponent.blur();
          console.log('[IDEWindow] 🎯 Blurred hidden terminal', terminalId);
        }
        
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
      // 🔧 FIX 2: Wait multiple frames for DOM to fully settle after layout changes
      // Single rAF is insufficient for complex splits with flexbox and inline styles
      await tick(); // Wait for Svelte update queue
      await new Promise(resolve => requestAnimationFrame(resolve)); // Frame 1: Style calculation
      await new Promise(resolve => requestAnimationFrame(resolve)); // Frame 2: Layout pass
      await new Promise(resolve => requestAnimationFrame(resolve)); // Frame 3: Paint complete
      
      if (!window.electronAPI) return;
      
      console.log('[IDEWindow] 🌍 positionBrowsers() START - activeWorkspaceId:', activeWorkspaceId);
      console.log('[IDEWindow] 📊 Window dimensions:', { 
        innerWidth: window.innerWidth, 
        innerHeight: window.innerHeight 
      });
      
      // Find all browser content areas in the DOM
      const canvasPanes = document.querySelectorAll('[data-browser-location="canvas-pane"]');
      console.log('[IDEWindow] 🔍 Found', canvasPanes.length, 'canvas panes');
      
      // Log all workspaces and panes
      console.log('[IDEWindow] 📦 All workspace panes:', {
        workspaces: $workspaceStore.workspaces.map(ws => ({
          id: ws.id,
          name: ws.name,
          paneCount: ws.panes?.length || 0
        })),
        allBrowsers: allBrowsers.map(b => ({
          id: b.id,
          workspaceId: b.workspaceId,
          url: b.url
        }))
      });
      
      for (const container of canvasPanes) {
        const browserId = container.getAttribute('data-active-browser');
        const paneId = container.getAttribute('data-pane-id');
        
        console.log('[IDEWindow] 🔎 Checking container:', { 
          paneId, 
          browserId,
          hasContainer: !!container
        });
        
        if (!browserId) {
          console.log('[IDEWindow] ⚠️ No browserId on container');
          continue;
        }
        
        // Check if this browser belongs to current workspace
        const browser = allBrowsers.find(b => b.id === browserId && b.workspaceId === activeWorkspaceId);
        if (!browser) {
          console.log('[IDEWindow] ⏭️ Browser', browserId, 'not in current workspace or not found');
          continue;
        }
        
        // 🔧 FIX 3: Force layout reflow to ensure bounds are accurate
        // Reading offsetHeight forces browser to complete any pending layout calculations
        container.offsetHeight;
        
        const rect = container.getBoundingClientRect();
        
        // 🔧 FIX 4: Enhanced logging for verification
        // Find which tab this browser belongs to
        const owningPane = editorLayout?.panes?.find(p => 
          p.tabs?.some(t => t.type === 'browser' && t.browserId === browserId)
        );
        const owningTab = owningPane?.tabs?.find(t => t.browserId === browserId);
        
        console.log('[IDEWindow] 🎯 POSITIONING BROWSER:', {
          browserId: browserId,
          browserURL: browser.url,
          '---PANE INFO---': '',
          containerPaneId: paneId,
          owningPaneId: owningPane?.id,
          owningTabId: owningTab?.id,
          isActiveTab: owningPane?.activeTabId === owningTab?.id,
          '---DOM CONTAINER---': '',
          containerClass: container.className,
          containerClientWidth: container.clientWidth,
          containerClientHeight: container.clientHeight,
          '---VIEWPORT BOUNDS---': '',
          viewportLeft: rect.left,
          viewportTop: rect.top,
          viewportWidth: rect.width,
          viewportHeight: rect.height,
          viewportRight: rect.right,
          viewportBottom: rect.bottom,
          '---WINDOW---': '',
          windowWidth: window.innerWidth,
          windowHeight: window.innerHeight
        });
        
        console.log('[IDEWindow] 📐 Raw container getBoundingClientRect() for browser', browserId, ':', {
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
          right: rect.right,
          bottom: rect.bottom,
          x: rect.x,
          y: rect.y
        });
        
        // 🔧 CRITICAL FIX: Clamp WebContentsView bounds to window dimensions
        // WebContentsView uses window-relative coordinates and is NOT constrained by CSS
        // We must ensure it never exceeds window boundaries
        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;
        
        // No safety inset here - use exact bounds from container
        // The browser-content div already has proper containment CSS
        const bounds = {
          x: Math.round(Math.max(0, rect.left)),
          y: Math.round(Math.max(0, rect.top)),
          width: Math.round(Math.max(0, Math.min(rect.width, windowWidth - rect.left))),
          height: Math.round(Math.max(0, Math.min(rect.height, windowHeight - rect.top)))
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
        
        console.log('[IDEWindow] 🎯 Browser content container calculations for', browserId, ':');
        console.log('[IDEWindow]   Window:', { width: windowWidth, height: windowHeight });
        console.log('[IDEWindow]   Raw rect:', {
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
          right: rect.right,
          bottom: rect.bottom
        });
        
        // Log clamping details with safety inset
        console.log('[IDEWindow] 🔒 Bounds calculation (exact fit):', {
          original: {
            x: Math.round(rect.left),
            y: Math.round(rect.top),
            width: Math.round(rect.width),
            height: Math.round(rect.height)
          },
          finalBounds: bounds,
          overflow: {
            right: `${bounds.x} + ${bounds.width} = ${bounds.x + bounds.width} (window: ${windowWidth})`,
            bottom: `${bounds.y} + ${bounds.height} = ${bounds.y + bounds.height} (window: ${windowHeight})`,
            exceedsRight: bounds.x + bounds.width > windowWidth,
            exceedsBottom: bounds.y + bounds.height > windowHeight
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
          
          // Auto-focus the browser after positioning if it's the active one
          const isActiveBrowser = Array.from(canvasPanes).some(
            pane => pane.getAttribute('data-active-browser') === browserId
          );
          if (isActiveBrowser) {
            const browser = allBrowsers.find(b => b.id === browserId);
            console.log('[IDEWindow] 🎯 Auto-focusing active browser:', {
              browserId,
              url: browser?.url,
              workspaceId: browser?.workspaceId
            });
            await window.electronAPI.browserFocus({ browserId: browserId });
          }
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

  // 🔧 FIX 1: Clear browser bounds cache when layout structure changes
  // This prevents browsers from getting stuck at wrong positions after splits
  $: {
    const newLayoutJson = JSON.stringify(editorLayout);
    if (newLayoutJson !== lastEditorLayoutJson) {
      console.log('[IDEWindow] 🔄 Layout changed, clearing browser bounds cache');
      cachedBrowserBounds.clear();
      lastEditorLayoutJson = newLayoutJson;
    }
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
    if (!currentEditorState) return;
    
    const activePane = findPaneById(editorLayout, currentEditorState.activePaneId);
    const activeTab = activePane?.tabs?.find(t => t.id === activePane.activeTabId);
    const activeBrowser = activeTab?.type === 'browser' ? allBrowsers.find(b => b.id === activeTab.browserId) : null;
    
    console.log('[IDEWindow] 🎹 Global keydown:', {
      key: event.key,
      code: event.code,
      ctrl: event.ctrlKey,
      alt: event.altKey,
      shift: event.shiftKey,
      activeWorkspace: activeWorkspaceId,
      activePaneId: currentEditorState.activePaneId,
      activeTabType: activeTab?.type,
      activeTabId: activeTab?.id,
      browserURL: activeBrowser?.url,
      browserId: activeBrowser?.id,
      target: event.target.tagName + (event.target.className ? '.' + event.target.className : '')
    });
    
    // Check for Alt+Arrow navigation (with Shift modifier for pane-only mode)
    if (event.altKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || 
                          event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault();
      
      // Throttle rapid navigation to prevent state corruption (50ms between navigations)
      const now = Date.now();
      if (now - lastNavigationTime < 50) {
        console.log('[IDEWindow] ⏱️ Navigation throttled - too rapid');
        return;
      }
      lastNavigationTime = now;
      
      // Shift+Alt+Arrow: ALL arrows navigate panes (for rapid pane switching)
      if (event.shiftKey) {
        console.log('[IDEWindow] ⚡ Shift+Alt - navigating panes only');
        navigatePanes(event.key);
        return;
      }
      
      // Alt+Arrow (no Shift): Left/Right = tabs, Up/Down = panes (normal behavior)
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        // Navigate tabs
        if (!activePane || activePane.paneType !== 'editor' || !activePane.tabs.length) {
          return;
        }
        
        const currentIndex = activePane.tabs.findIndex(t => t.id === activePane.activeTabId);
        if (currentIndex === -1) return;
        
        let newIndex;
        if (event.key === 'ArrowRight') {
          newIndex = (currentIndex + 1) % activePane.tabs.length;
        } else {
          newIndex = (currentIndex - 1 + activePane.tabs.length) % activePane.tabs.length;
        }
        
        editorStore.setActiveTab(activePane.id, activePane.tabs[newIndex].id);
        return;
      } else {
        // Navigate panes (Up/Down)
        navigatePanes(event.key);
        return;
      }
    }
    
    // Ctrl+B (Windows/Linux) or Cmd+B (Mac) to toggle explorer
    if ((event.ctrlKey || event.metaKey) && event.key === 'b') {
      event.preventDefault();
      explorerVisible = !explorerVisible;
    }
    // Ctrl+` (backtick) to create new terminal in canvas
    if ((event.ctrlKey || event.metaKey) && event.key === '`') {
      event.preventDefault();
      // Create terminal directly in active pane (like clicking terminal button)
      const terminalId = `terminal-${Date.now()}`;
      terminalStore.addTerminal(terminalId, activeWorkspaceId);
      editorStore.addTerminalTab(currentEditorState.activePaneId, terminalId);
    }
    // Prevent Ctrl+R and Ctrl+Shift+R from reloading the Electron app
    if ((event.ctrlKey || event.metaKey) && event.key === 'r') {
      event.preventDefault();
      console.log('[IDEWindow] 🚫 Prevented Ctrl+R reload');
    }
    // Ctrl+Shift+M to toggle diagnostics
    if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'M') {
      event.preventDefault();
      diagnosticsVisible = !diagnosticsVisible;
    }
  }
  
  // Helper: Navigate between panes using SPATIAL AWARENESS
  function navigatePanes(key) {
    if (!currentEditorState) return;
    
    // Find all pane elements in DOM
    const paneElements = document.querySelectorAll('[data-pane-id]');
    if (paneElements.length <= 1) return;
    
    // Get current pane element
    const currentPaneEl = document.querySelector(`[data-pane-id="${currentEditorState.activePaneId}"]`);
    if (!currentPaneEl) {
      console.log('[navigatePanes] Current pane element not found:', currentEditorState.activePaneId);
      return;
    }
    
    const currentRect = currentPaneEl.getBoundingClientRect();
    const currentCenter = {
      x: currentRect.left + currentRect.width / 2,
      y: currentRect.top + currentRect.height / 2
    };
    
    // Find all candidate panes in the desired direction
    const candidates = [];
    paneElements.forEach(el => {
      const paneId = el.getAttribute('data-pane-id');
      if (paneId === currentEditorState.activePaneId) return; // Skip current pane
      
      const rect = el.getBoundingClientRect();
      const center = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2
      };
      
      let isCandidate = false;
      let distance = 0;
      
      // Check if pane is in the arrow direction
      if (key === 'ArrowLeft') {
        // Pane must be to the left (center.x < current center.x)
        if (center.x < currentCenter.x) {
          isCandidate = true;
          distance = currentCenter.x - center.x;
        }
      } else if (key === 'ArrowRight') {
        // Pane must be to the right
        if (center.x > currentCenter.x) {
          isCandidate = true;
          distance = center.x - currentCenter.x;
        }
      } else if (key === 'ArrowUp') {
        // Pane must be above
        if (center.y < currentCenter.y) {
          isCandidate = true;
          distance = currentCenter.y - center.y;
        }
      } else if (key === 'ArrowDown') {
        // Pane must be below
        if (center.y > currentCenter.y) {
          isCandidate = true;
          distance = center.y - currentCenter.y;
        }
      }
      
      if (isCandidate) {
        candidates.push({ paneId, distance, center });
      }
    });
    
    if (candidates.length === 0) {
      console.log('[navigatePanes] No panes found in direction:', key);
      return; // No panes in that direction
    }
    
    // Sort by distance and pick closest
    candidates.sort((a, b) => a.distance - b.distance);
    const targetPaneId = candidates[0].paneId;
    
    console.log('[navigatePanes] Spatial navigation:', {
      direction: key,
      currentPane: currentEditorState.activePaneId,
      currentCenter,
      candidates: candidates.length,
      targetPane: targetPaneId
    });
    
    editorStore.setActivePane(targetPaneId);
  }
  
  // Helper: Find pane by ID in layout tree
  function findPaneById(layout, paneId) {
    if (!layout) return null;
    if (layout.type === 'pane') {
      return layout.id === paneId ? layout : null;
    }
    
    // Recursively search in split children
    const leftResult = findPaneById(layout.left, paneId);
    if (leftResult) return leftResult;
    
    return findPaneById(layout.right, paneId);
  }

  let resizeObserver;
  let editorAreaElement;
  let cachedBrowserBounds = new Map(); // browserId -> bounds (for deduplication)
  let positionBrowsersTimeout = null; // Debounce timer
  let terminalComponents = new Map(); // terminalId -> Terminal component instance
  let lastEditorLayoutJson = ''; // Track layout changes for cache invalidation
  let navigationThrottleTimeout = null; // Throttle rapid navigation to prevent state corruption
  let lastNavigationTime = 0;

  onMount(async () => {
    deepWikiStore.initialize();
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
      
      // Listen for browser keyboard navigation events (Alt+Arrow from browser WebContentsView)
      window.electronAPI.onBrowserKeyboardNav((data) => {
        console.log('[IDEWindow] Browser keyboard nav received:', data);
        // Dispatch as synthetic keydown event
        window.dispatchEvent(new KeyboardEvent('keydown', {
          key: data.key,
          code: data.code,
          altKey: data.altKey,
          bubbles: true
        }));
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
    <div class="header-left">
      <WorkspaceSwitcher />
      <CanvasSwitcher />
    </div>
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
      <!-- Bottom panel removed - terminals now only in canvas -->
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
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    padding: var(--spacing-sm) var(--spacing-md);
    background-color: var(--color-surface-secondary);
    border-bottom: 1px solid var(--color-border);
    height: 44px;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: var(--spacing-md);
    justify-self: start;
  }

  .chat-toggle-button {
    justify-self: end;
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

  .chat-sidebar {
    width: 350px;
    background-color: var(--color-background);
    overflow: hidden;
  }

  .chat-sidebar.hidden {
    display: none;
  }
</style>

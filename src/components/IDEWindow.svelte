<script>
  import { onMount, onDestroy, tick } from 'svelte';
  import { appStore } from '../stores/appStore.js';
  import { workspaceStore } from '../stores/workspaceStore.js';
  import { canvasStore, activeCanvas } from '../stores/canvasStore.js';
  import { terminalStore } from '../stores/terminalStore.js';
  import { browserStore } from '../stores/browserStore.js';
  import { zoomStore } from '../stores/zoomStore.js';
  import { editorStore } from '../stores/editorStore.js';
  import { activeWorkspacePath } from '../stores/workspaceStore.js';
  import { outputStore } from '../stores/outputStore.js';
  import { browserLogger } from '../utils/browserLogger.js';
  import ActivityBar from './ActivityBar.svelte';
  import ModeSwitcher from './ModeSwitcher.svelte';
  import WorkspaceSwitcher from './WorkspaceSwitcher.svelte';
  import CanvasSwitcher from './CanvasSwitcher.svelte';
  import FileExplorer from './FileExplorer.svelte';
  import MindSidebar from './MindSidebar.svelte';
  import GitPanel from './GitPanel.svelte';
  import EditorCanvas from './EditorCanvas.svelte';
  import TerminalPanel from './TerminalPanel.svelte';
  import DiagnosticsPanel from './DiagnosticsPanel.svelte';
  import Terminal from './Terminal.svelte';
  import ChatPanel from './ChatPanel.svelte';
  import OutputPanel from './OutputPanel.svelte';
  import SSHQuickLauncher from './SSHQuickLauncher.svelte';
  import IconThemeSettings from './IconThemeSettings.svelte';
  
  // Pane debug logger
  function paneLog(message, data = null) {
    const msg = data ? `${message} ${JSON.stringify(data)}` : message;
    outputStore.addLog(msg, 'log', 'pane-debug');
  }

  let currentProject = null;
  let explorerVisible = true; // Local state like terminal
  let terminalVisible = false;
  let diagnosticsVisible = false;
  let chatVisible = false; // Chat panel hidden by default
  let outputVisible = false; // Output panel hidden by default
  let activePanel = 'explorer'; // Track which panel is active
  let activeWorkspaceId = null;
  let workspaces = [];
  let allTerminals = [];
  let allBrowsers = [];
  let currentWorkspacePath = null;
  let activeTerminalId = null;
  let editorLayout = null;
  let currentCanvas = null;
  
  // Resizable panel sizes
  let sidebarWidth = 260; // File browser width
  let outputHeight = 40; // Output panel height in percentage
  let isResizingSidebar = false;
  let isResizingOutput = false;
  let resizeStartX = 0;
  let resizeStartY = 0;
  let resizeStartWidth = 0;
  let resizeStartHeight = 0;
  // Initialize to default state to prevent null errors
  let currentEditorState = {
    layout: { type: 'pane', id: 'pane-1', tabs: [], activeTabId: null },
    activePaneId: 'pane-1',
    nextPaneId: 2,
    nextTabId: 1
  };

  activeCanvas.subscribe((canvas) => {
    currentCanvas = canvas;
  });

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
    
    // Log layout changes for debugging
    if (state.layout) {
      const panes = [];
      function collectPanes(node) {
        if (!node) return;
        if (node.type === 'pane') {
          panes.push({
            id: node.id,
            activeTabId: node.activeTabId,
            tabCount: node.tabs?.length || 0,
            tabs: node.tabs?.map(t => ({ id: t.id, type: t.type, name: t.name || t.title }))
          });
        } else if (node.type === 'split') {
          collectPanes(node.left);
          collectPanes(node.right);
        }
      }
      collectPanes(state.layout);
      paneLog('Layout updated', { activePaneId: state.activePaneId, panes });
    }
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
    
    paneLog('positionTerminals() called', { activeWorkspaceId, terminalCount: allTerminals.length });
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
      
      // Check if target container is actually visible (not a hidden fallback container)
      if (targetContainer) {
        const computedStyle = window.getComputedStyle(targetContainer);
        const visibility = computedStyle.visibility;
        const display = computedStyle.display;
        const offsetParent = targetContainer.offsetParent;
        const isContainerVisible = visibility !== 'hidden' && 
                                   display !== 'none' &&
                                   offsetParent !== null;
        
        paneLog('Terminal container check', { 
          terminalId, 
          visibility, 
          display, 
          hasOffsetParent: offsetParent !== null,
          offsetParentTag: offsetParent?.tagName,
          isContainerVisible 
        });
        
        if (!isContainerVisible) {
          console.log('[IDEWindow] Target container is hidden, ignoring for terminal', terminalId);
          targetContainer = null;
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
        paneLog('Terminal SHOWN', { terminalId, top: rect.top, left: rect.left, width: rect.width, height: rect.height });
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
        
        const reason = !isInCurrentWorkspace ? 'different workspace' : 'no target container';
        paneLog('Terminal HIDDEN', { terminalId, reason });
        
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
      
      paneLog('positionBrowsers() called', { activeWorkspaceId, browserCount: allBrowsers.length });
      console.log('[IDEWindow] 🌍 positionBrowsers() START - activeWorkspaceId:', activeWorkspaceId);
      console.log('[IDEWindow] 📊 Window dimensions:', { 
        innerWidth: window.innerWidth, 
        innerHeight: window.innerHeight 
      });
      
      // Find all browser content areas in the DOM (both panes and browser canvas)
      const canvasPanes = document.querySelectorAll('[data-browser-location="canvas-pane"], [data-browser-location="browser-canvas"]');
      console.log('[IDEWindow] 🔍 Found', canvasPanes.length, 'canvas panes');
      
      // Log all found containers for debugging
      const containerInfo = Array.from(canvasPanes).map(c => ({
        paneId: c.getAttribute('data-pane-id'),
        browserId: c.getAttribute('data-active-browser'),
        rect: c.getBoundingClientRect()
      }));
      paneLog('Browser containers found', containerInfo);
      
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
        
        // Check if container is actually visible (not a hidden fallback)
        const computedStyle = window.getComputedStyle(container);
        const visibility = computedStyle.visibility;
        const display = computedStyle.display;
        const offsetParent = container.offsetParent;
        const isContainerVisible = visibility !== 'hidden' && 
                                   display !== 'none' &&
                                   offsetParent !== null;
        
        paneLog('Browser container check', { 
          browserId, 
          paneId,
          visibility, 
          display, 
          hasOffsetParent: offsetParent !== null,
          offsetParentTag: offsetParent?.tagName,
          isContainerVisible 
        });
        
        if (!isContainerVisible) {
          console.log('[IDEWindow] ⏭️ Container for browser', browserId, 'is hidden, skipping');
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
        
        // Log tab selection and visibility via browserLogger
        const isTabActive = owningPane?.activeTabId === owningTab?.id;
        browserLogger.logTabSelection(browserId, paneId, isTabActive, isContainerVisible);
        
        // Log pane dimensions
        browserLogger.logPaneDimensions(paneId, browserId, {
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          left: Math.round(rect.left),
          top: Math.round(rect.top)
        });
        
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
        const dpr = window.devicePixelRatio;
        
        // 🔧 FIX: Use container rect directly - it already represents the correct pane size
        // The browser should fill the entire container (which is the pane's content area)
        // Clamp to window size in CSS pixels (not divided by DPR) to prevent gaps
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
        
        // Log container and window dimensions via browserLogger
        browserLogger.logDimensions('WINDOW', windowWidth, windowHeight, dpr);
        
        // Log DPR adjustment details
        const originalBounds = {
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        };
        browserLogger.logDPRCalculation(browserId, 
          { width: windowWidth, height: windowHeight },
          dpr,
          { width: windowWidth, height: windowHeight },  // No DPR adjustment for clamping
          originalBounds,
          bounds
        );
        
        browserLogger.logContainerCalculation(browserId, {
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          left: Math.round(rect.left),
          top: Math.round(rect.top)
        }, bounds);
        
        // Call Electron to position WebContentsView
        try {
          // 🔧 FIX (DPR): Scale bounds by DPR for Electron
          // getBoundingClientRect() returns CSS pixels
          // Electron's setBounds() expects physical pixels
          // When DPR < 1.0, we need to multiply by DPR to convert CSS → physical
          const scaledBounds = {
            x: Math.round(bounds.x * dpr),
            y: Math.round(bounds.y * dpr),
            width: Math.round(bounds.width * dpr),
            height: Math.round(bounds.height * dpr)
          };
          
          await window.electronAPI.browserSetBounds({
            browserId: browserId,
            bounds: scaledBounds
          });
          
          // Cache the bounds we just sent (store CSS pixels for comparison)
          cachedBrowserBounds.set(browserId, bounds);
          
          paneLog('Browser POSITIONED', { browserId, x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height });
          
          // Log successful positioning (show both CSS and physical pixels)
          browserLogger.logSetBounds(browserId, scaledBounds, { width: windowWidth, height: windowHeight });
          
          // Log the scaling that was applied
          if (dpr !== 1.0) {
            browserLogger.logEvent('DPR_SCALED', browserId, {
              cssPixels: bounds,
              physicalPixels: scaledBounds,
              scale: dpr.toFixed(4)
            });
          }
          
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
        const isVisible = Array.from(canvasPanes).some(pane => {
          if (pane.getAttribute('data-active-browser') !== browser.id) return false;
          // Also check if the container itself is visible
          const style = window.getComputedStyle(pane);
          return style.visibility !== 'hidden' && 
                 style.display !== 'none' && 
                 pane.offsetParent !== null;
        });
        
        // Hide if: wrong workspace OR (correct workspace but not visible in any pane)
        if (!isInCurrentWorkspace || !isVisible) {
          try {
            await window.electronAPI.browserHide({ browserId: browser.id });
            // Clear cached bounds when hiding
            cachedBrowserBounds.delete(browser.id);
            
            // Log visibility change via browserLogger
            const reason = !isInCurrentWorkspace ? 'different workspace' : 'not visible in pane';
            paneLog('Browser HIDDEN', { browserId: browser.id, reason });
            browserLogger.logVisibility(browser.id, false, reason);
            
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
    activePanel = state.activePanel;
  });

  workspaceStore.subscribe(async (state) => {
    const previousWorkspaceId = activeWorkspaceId;
    activeWorkspaceId = state.activeWorkspaceId;
    workspaces = state.workspaces;
    
    // 🔧 PERSISTENT BROWSERS: Hide/show browsers on workspace change
    if (previousWorkspaceId !== activeWorkspaceId && window.electronAPI) {
      // Hide browsers from previous workspace
      if (previousWorkspaceId) {
        await window.electronAPI.browsersHideWorkspace(previousWorkspaceId);
        console.log(`[IDEWindow] Hidden browsers for workspace ${previousWorkspaceId}`);
      }
      
      // Show browsers for new workspace
      if (activeWorkspaceId) {
        await window.electronAPI.browsersShowWorkspace(activeWorkspaceId);
        console.log(`[IDEWindow] Showing browsers for workspace ${activeWorkspaceId}`);
      }
    }
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

  async function handleSSHConnect(event) {
    console.log('[IDEWindow] SSH Connect event:', event);
    const { connection, tempCredentials } = event.detail;
    
    // Create SSH terminal workspace
    const workspaceId = `ssh-${connection.id}-${Date.now()}`;
    const workspace = {
      id: workspaceId,
      path: `ssh://${connection.username}@${connection.host}:${connection.port}`,
      color: '#ff9500',
      isSSH: true,
      sshConnection: connection
    };
    
    console.log('[IDEWindow] Creating SSH workspace:', workspace);
    
    workspaceStore.addWorkspace(workspace);
    workspaceStore.setActiveWorkspace(workspaceId);
    
    // Store credentials for this session (temp or saved)
    const credentialsToStore = tempCredentials || connection.credentials;
    if (credentialsToStore && window.electronAPI) {
      await window.electronAPI.sshSetTempCredentials({
        workspaceId,
        credentials: credentialsToStore
      });
    }
    
    // Create a terminal for the SSH connection
    const terminalId = `terminal-${Date.now()}`;
    terminalStore.addTerminal(terminalId, workspaceId);
    
    console.log('[IDEWindow] SSH terminal created:', terminalId);
  }

  // Sidebar resize handlers
  function handleSidebarResizeStart(e) {
    isResizingSidebar = true;
    resizeStartX = e.clientX;
    resizeStartWidth = sidebarWidth;
    document.addEventListener('mousemove', handleSidebarResizeMove);
    document.addEventListener('mouseup', handleSidebarResizeEnd);
  }

  function handleSidebarResizeMove(e) {
    if (!isResizingSidebar) return;
    const delta = e.clientX - resizeStartX;
    sidebarWidth = Math.max(150, Math.min(500, resizeStartWidth + delta)); // Min 150px, max 500px
  }

  function handleSidebarResizeEnd() {
    isResizingSidebar = false;
    document.removeEventListener('mousemove', handleSidebarResizeMove);
    document.removeEventListener('mouseup', handleSidebarResizeEnd);
  }

  // Output panel resize handlers
  function handleOutputResizeStart(e) {
    isResizingOutput = true;
    resizeStartY = e.clientY;
    resizeStartHeight = outputHeight;
    document.addEventListener('mousemove', handleOutputResizeMove);
    document.addEventListener('mouseup', handleOutputResizeEnd);
  }

  function handleOutputResizeMove(e) {
    if (!isResizingOutput) return;
    const editorArea = document.querySelector('.editor-area');
    if (!editorArea) return;
    
    const containerHeight = editorArea.parentElement.clientHeight;
    const delta = e.clientY - resizeStartY;
    const deltaPercent = (delta / containerHeight) * 100;
    outputHeight = Math.max(10, Math.min(80, resizeStartHeight - deltaPercent)); // Min 10%, max 80%
  }

  function handleOutputResizeEnd() {
    isResizingOutput = false;
    document.removeEventListener('mousemove', handleOutputResizeMove);
    document.removeEventListener('mouseup', handleOutputResizeEnd);
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
    
    // Ctrl+Plus or Ctrl+= to zoom in
    if ((event.ctrlKey || event.metaKey) && (event.key === '+' || event.key === '=')) {
      event.preventDefault();
      console.log('[IDEWindow] 🔍 ZOOM IN DETECTED - paneType:', activePane?.paneType, 'tabType:', activeTab?.type);
      
      if (activePane?.paneType === 'terminal') {
        console.log('[IDEWindow] ✅ Calling terminalStore.incrementZoom()');
        terminalStore.incrementZoom();
      } else if (activePane?.paneType === 'editor') {
        if (activeTab?.type === 'browser') {
          console.log('[IDEWindow] ✅ Calling browserStore.incrementZoom()');
          browserStore.incrementZoom();
        } else {
          console.log('[IDEWindow] ✅ Calling zoomStore.incrementEditorZoom()');
          zoomStore.incrementEditorZoom();
        }
      } else {
        console.log('[IDEWindow] ⚠️ No active pane or unknown paneType:', activePane?.paneType);
      }
      return;
    }
    
    // Ctrl+Minus to zoom out
    if ((event.ctrlKey || event.metaKey) && event.key === '-') {
      event.preventDefault();
      console.log('[IDEWindow] 🔍 ZOOM OUT DETECTED - paneType:', activePane?.paneType, 'tabType:', activeTab?.type);
      
      if (activePane?.paneType === 'terminal') {
        console.log('[IDEWindow] ✅ Calling terminalStore.decrementZoom()');
        terminalStore.decrementZoom();
      } else if (activePane?.paneType === 'editor') {
        if (activeTab?.type === 'browser') {
          console.log('[IDEWindow] ✅ Calling browserStore.decrementZoom()');
          browserStore.decrementZoom();
        } else {
          console.log('[IDEWindow] ✅ Calling zoomStore.decrementEditorZoom()');
          zoomStore.decrementEditorZoom();
        }
      } else {
        console.log('[IDEWindow] ⚠️ No active pane or unknown paneType:', activePane?.paneType);
      }
      return;
    }
    
    // Ctrl+0 to reset zoom
    if ((event.ctrlKey || event.metaKey) && event.key === '0') {
      event.preventDefault();
      console.log('[IDEWindow] 🔍 ZOOM RESET DETECTED - paneType:', activePane?.paneType, 'tabType:', activeTab?.type);
      
      if (activePane?.paneType === 'terminal') {
        console.log('[IDEWindow] ✅ Calling terminalStore.setGlobalZoomLevel(1)');
        terminalStore.setGlobalZoomLevel(1);
      } else if (activePane?.paneType === 'editor') {
        if (activeTab?.type === 'browser') {
          console.log('[IDEWindow] ✅ Calling browserStore.setGlobalZoomLevel(1)');
          browserStore.setGlobalZoomLevel(1);
        } else {
          console.log('[IDEWindow] ✅ Calling zoomStore.setEditorZoomLevel(1)');
          zoomStore.setEditorZoomLevel(1);
        }
      } else {
        console.log('[IDEWindow] ⚠️ No active pane or unknown paneType:', activePane?.paneType);
      }
      return;
    }
    
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
  let positionTerminalsTimeout = null; // Debounce timer for terminal positioning
  let terminalComponents = new Map(); // terminalId -> Terminal component instance
  let lastEditorLayoutJson = ''; // Track layout changes for cache invalidation
  let navigationThrottleTimeout = null; // Throttle rapid navigation to prevent state corruption
  let lastNavigationTime = 0;

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
      
      // Check if workspaces already exist in store (from WelcomeScreen)
      let existingWorkspaces = [];
      let existingActiveId = null;
      const unsub = workspaceStore.subscribe(state => {
        existingWorkspaces = state.workspaces;
        existingActiveId = state.activeWorkspaceId;
      });
      unsub();
      
      console.log('[IDEWindow] onMount - workspace state:', {
        existingCount: existingWorkspaces.length,
        existingActiveId,
        savedCount: savedWorkspaces?.length,
        savedActiveId,
        hasCurrentProject: !!currentProject
      });
      
      // If workspaces already exist (e.g., from WelcomeScreen SSH connection), don't override
      if (existingWorkspaces.length > 0 && existingActiveId) {
        console.log('[IDEWindow] Keeping existing workspace setup from WelcomeScreen');
        // Still merge saved workspaces but don't change active
        if (savedWorkspaces && savedWorkspaces.length > 0) {
          // Merge: keep existing + add any saved ones that don't exist
          const mergedWorkspaces = [...existingWorkspaces];
          for (const saved of savedWorkspaces) {
            if (!mergedWorkspaces.find(w => w.id === saved.id)) {
              mergedWorkspaces.push(saved);
            }
          }
          workspaceStore.setWorkspaces(mergedWorkspaces);
        }
        return; // Don't change active workspace
      }
      
      if (savedWorkspaces && savedWorkspaces.length > 0) {
        workspaceStore.setWorkspaces(savedWorkspaces);
        
        // If we have a current project, find or create its workspace
        if (currentProject) {
          const projectWorkspace = savedWorkspaces.find(w => w.path === currentProject.path);
          
          if (projectWorkspace) {
            console.log('[IDEWindow] Found saved workspace for current project');
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
    <div class="header-center">
      <ModeSwitcher />
    </div>
    <div class="header-right">
      <SSHQuickLauncher onConnect={handleSSHConnect} />
      <IconThemeSettings />
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
  </div>

  <div class="ide-content">
    <ActivityBar 
      bind:outputVisible
      {terminalVisible} 
      onToggleTerminal={() => terminalVisible = !terminalVisible}
    />
    <div class="sidebar" class:hidden={!explorerVisible || currentCanvas?.type === 'git'} style="width: {sidebarWidth}px">
      {#if activePanel === 'git' && !activeWorkspace?.isSSH}
        <GitPanel />
      {:else if currentCanvas?.type === 'mind'}
        <MindSidebar />
      {:else}
        <FileExplorer projectPath={workspacePath} />
      {/if}
      <div 
        class="sidebar-resize-handle" 
        on:mousedown={handleSidebarResizeStart}
        class:resizing={isResizingSidebar}
        role="button"
        aria-label="Resize sidebar"
        tabindex="0"
      ></div>
    </div>
    <div class="main-area">
      <div class="editor-area" style="height: {outputVisible ? (100 - outputHeight) + '%' : '100%'}">
        <EditorCanvas />
      </div>
      <!-- Output Panel - Bottom horizontal -->
      <div class="output-panel-container" class:hidden={!outputVisible} style="height: {outputHeight}%">
        <div 
          class="output-resize-handle" 
          on:mousedown={handleOutputResizeStart}
          class:resizing={isResizingOutput}
          role="button"
          aria-label="Resize output panel"
          tabindex="0"
        ></div>
        <OutputPanel />
      </div>
    </div>
    <div class="chat-sidebar" class:hidden={!chatVisible}>
      <ChatPanel />
    </div>
  </div>

  <!-- Global terminal container - ALL terminals render here ONCE -->
  <div class="global-terminal-container">
    {#each allTerminals as terminal (terminal.id)}
      {@const workspace = workspaces.find(w => w.id === terminal.workspaceId)}
      {@const isSSH = workspace?.isSSH || false}
      {@const sshConnection = workspace?.sshConnection}
      <div class="terminal-wrapper" data-terminal-id={terminal.id} data-workspace-id={terminal.workspaceId}>
        <Terminal 
          bind:this={terminalComponents[terminal.id]}
          terminalId={terminal.id}
          cwd={currentWorkspacePath}
          isSSH={isSSH}
          sshConnection={sshConnection}
          sshCredentials={sshConnection?.credentials}
          workspaceId={terminal.workspaceId}
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

  .header-center {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    justify-self: end;
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
    background-color: var(--color-surface-secondary);
    border-right: 1px solid var(--color-border);
    overflow-y: auto;
    position: relative;
    flex-shrink: 0;
  }

  .sidebar.hidden {
    display: none;
  }

  .sidebar-resize-handle {
    position: absolute;
    right: 0;
    top: 0;
    bottom: 0;
    width: 4px;
    cursor: col-resize;
    background-color: transparent;
    transition: background-color var(--transition-fast);
    z-index: 100;
  }

  .sidebar-resize-handle:hover,
  .sidebar-resize-handle.resizing {
    background-color: var(--color-accent);
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

  .output-panel-container {
    background-color: var(--color-background);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    border-top: 1px solid var(--color-border);
    position: relative;
    flex-shrink: 0;
  }

  .output-panel-container.hidden {
    display: none;
  }

  .output-resize-handle {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 4px;
    cursor: row-resize;
    background-color: transparent;
    transition: background-color var(--transition-fast);
    z-index: 100;
  }

  .output-resize-handle:hover,
  .output-resize-handle.resizing {
    background-color: var(--color-accent);
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

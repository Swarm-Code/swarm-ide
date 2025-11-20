<script>
  import { onMount, onDestroy, tick } from 'svelte';
  import { browserStore } from '../stores/browserStore.js';
  import { workspaceStore } from '../stores/workspaceStore.js';
  import BrowserNavigation from './BrowserNavigation.svelte';

  let browsers = [];
  let activeBrowserId = null;
  let activeWorkspaceId = null;
  let browserContentRef = null;

  // Logging helper
  function log(message, data = null) {
    const logMsg = `[🌐 BrowserCanvas] ${message}`;
    if (data) {
      console.log(logMsg, data);
    } else {
      console.log(logMsg);
    }
  }

  const unsubBrowser = browserStore.subscribe((state) => {
    const oldBrowsers = browsers;
    browsers = state.browsers.filter(b => b.workspaceId === activeWorkspaceId);
    
    log('Store update', {
      totalBrowsers: state.browsers.length,
      workspaceBrowsers: browsers.length,
      activeWorkspaceId,
      activeBrowserId
    });
    
    // Auto-select first browser if none active
    if (browsers.length > 0 && !activeBrowserId) {
      activeBrowserId = browsers[0].id;
      log('Auto-selected first browser', activeBrowserId);
    }
    
    // Clear selection if active browser was removed
    if (activeBrowserId && !browsers.find(b => b.id === activeBrowserId)) {
      activeBrowserId = browsers.length > 0 ? browsers[0].id : null;
      log('Active browser removed, new selection', activeBrowserId);
    }
  });

  const unsubWorkspace = workspaceStore.subscribe((state) => {
    const oldId = activeWorkspaceId;
    activeWorkspaceId = state.activeWorkspaceId;
    if (oldId !== activeWorkspaceId) {
      log('Workspace changed', { from: oldId, to: activeWorkspaceId });
    }
  });

  onDestroy(() => {
    log('Component destroying');
    unsubBrowser();
    unsubWorkspace();
  });

  $: activeBrowser = browsers.find(b => b.id === activeBrowserId);

  // Position browser when active browser changes or on mount
  $: if (activeBrowserId && browserContentRef) {
    log('Reactive trigger: positioning browser', { activeBrowserId, hasRef: !!browserContentRef });
    positionBrowser();
  }

  async function positionBrowser() {
    await tick();
    await new Promise(resolve => requestAnimationFrame(resolve));
    
    log('positionBrowser() called', {
      hasRef: !!browserContentRef,
      activeBrowserId,
      hasElectronAPI: !!window.electronAPI,
      hasSetBounds: !!window.electronAPI?.setBrowserBounds
    });
    
    if (!browserContentRef) {
      log('❌ No browserContentRef');
      return;
    }
    if (!activeBrowserId) {
      log('❌ No activeBrowserId');
      return;
    }
    if (!window.electronAPI) {
      log('❌ No electronAPI');
      return;
    }
    
    const rect = browserContentRef.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1.0;
    
    const bounds = {
      x: Math.round(rect.left * dpr),
      y: Math.round(rect.top * dpr),
      width: Math.round(rect.width * dpr),
      height: Math.round(rect.height * dpr)
    };
    
    log('📐 Setting bounds', {
      browserId: activeBrowserId,
      cssRect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      scaledBounds: bounds,
      dpr
    });
    
    if (window.electronAPI?.browserSetBounds) {
      window.electronAPI.browserSetBounds({ browserId: activeBrowserId, bounds });
      log('✅ browserSetBounds called');
    } else {
      log('❌ browserSetBounds not available');
    }
  }

  function handleAddBrowser() {
    const browserId = `browser-${Date.now()}`;
    log('➕ Creating new browser', { browserId, activeWorkspaceId });
    
    browserStore.addBrowser(browserId, 'https://www.google.com', activeWorkspaceId);
    activeBrowserId = browserId;
    
    // Create the actual browser in Electron
    if (window.electronAPI?.browserCreate) {
      log('📞 Calling browserCreate API', { browserId });
      window.electronAPI.browserCreate({ 
        browserId, 
        url: 'https://www.google.com', 
        workspaceId: activeWorkspaceId 
      });
    } else {
      log('❌ browserCreate API not available');
    }
  }

  function handleSelectBrowser(browserId) {
    activeBrowserId = browserId;
  }

  function handleCloseBrowser(browserId, event) {
    event.stopPropagation();
    
    // Hide browser bounds
    if (window.electronAPI?.browserSetBounds) {
      window.electronAPI.browserSetBounds({ browserId, bounds: { x: 0, y: 0, width: 0, height: 0 } });
    }
    
    browserStore.removeBrowser(browserId);
  }

  function handleNavigate(event) {
    const url = event.detail.url;
    if (activeBrowserId && window.electronAPI?.browserNavigate) {
      window.electronAPI.browserNavigate({ browserId: activeBrowserId, url });
      browserStore.updateBrowserUrl(activeBrowserId, url);
    }
  }

  function handleBack() {
    if (activeBrowserId && window.electronAPI?.browserGoBack) {
      window.electronAPI.browserGoBack({ browserId: activeBrowserId });
    }
  }

  function handleForward() {
    if (activeBrowserId && window.electronAPI?.browserGoForward) {
      window.electronAPI.browserGoForward({ browserId: activeBrowserId });
    }
  }

  function handleReload() {
    if (activeBrowserId && window.electronAPI?.browserReload) {
      window.electronAPI.browserReload({ browserId: activeBrowserId });
    }
  }

  function handleStop() {
    if (activeBrowserId && window.electronAPI?.browserStop) {
      window.electronAPI.browserStop({ browserId: activeBrowserId });
    }
  }

  onMount(() => {
    log('🎬 MOUNTED', {
      browsersCount: browsers.length,
      activeWorkspaceId,
      activeBrowserId,
      hasRef: !!browserContentRef
    });
    
    // Create initial browser if none exist
    if (browsers.length === 0) {
      log('No browsers exist, creating initial browser');
      handleAddBrowser();
    } else {
      log('Existing browsers found', browsers.map(b => b.id));
    }
    
    // Reposition on window resize
    window.addEventListener('resize', positionBrowser);
    
    // Force initial positioning after a short delay
    setTimeout(() => {
      log('⏰ Delayed positioning trigger');
      positionBrowser();
    }, 100);
    
    return () => {
      window.removeEventListener('resize', positionBrowser);
    };
  });
</script>

<div class="browser-canvas">
  <!-- Tab bar -->
  <div class="browser-tabs">
    {#each browsers as browser (browser.id)}
      <div 
        class="browser-tab"
        class:active={browser.id === activeBrowserId}
        on:click={() => handleSelectBrowser(browser.id)}
      >
        <span class="tab-title">{browser.title || new URL(browser.url).hostname}</span>
        <button 
          class="tab-close"
          on:click={(e) => handleCloseBrowser(browser.id, e)}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    {/each}
    <button class="add-tab-btn" on:click={handleAddBrowser} title="New Tab">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
      </svg>
    </button>
  </div>

  <!-- Navigation bar -->
  {#if activeBrowser}
    <BrowserNavigation
      browserId={activeBrowserId}
      url={activeBrowser.url}
      canGoBack={activeBrowser.canGoBack || false}
      canGoForward={activeBrowser.canGoForward || false}
      isLoading={activeBrowser.isLoading || false}
      on:navigate={handleNavigate}
      on:back={handleBack}
      on:forward={handleForward}
      on:reload={handleReload}
      on:stop={handleStop}
    />
  {/if}

  <!-- Browser content area -->
  <div 
    class="browser-content"
    bind:this={browserContentRef}
    data-browser-location="browser-canvas"
    data-active-browser={activeBrowserId}
  >
    {#if !activeBrowser}
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <circle cx="12" cy="12" r="10" stroke-width="2"/>
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
        </svg>
        <h3>No browser open</h3>
        <p>Click + to open a new browser tab</p>
      </div>
    {/if}
  </div>
</div>

<style>
  .browser-canvas {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    background-color: var(--color-background);
    overflow: hidden;
  }

  .browser-tabs {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: var(--spacing-xs) var(--spacing-sm);
    background-color: var(--color-surface-secondary);
    border-bottom: 1px solid var(--color-border);
    overflow-x: auto;
    min-height: 36px;
  }

  .browser-tab {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    padding: var(--spacing-xs) var(--spacing-md);
    background-color: var(--color-surface-hover);
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
    cursor: pointer;
    transition: all var(--transition-fast);
    min-width: 120px;
    max-width: 200px;
    user-select: none;
  }

  .browser-tab:hover {
    background-color: var(--color-surface);
    border-color: var(--color-border);
  }

  .browser-tab.active {
    background-color: var(--color-surface);
    color: var(--color-text-primary);
    border-color: var(--color-border);
  }

  .tab-title {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tab-close {
    width: 16px;
    height: 16px;
    padding: 2px;
    background: transparent;
    border: none;
    border-radius: var(--radius-sm);
    color: var(--color-text-secondary);
    cursor: pointer;
    opacity: 0;
    transition: all var(--transition-fast);
    flex-shrink: 0;
  }

  .browser-tab:hover .tab-close {
    opacity: 1;
  }

  .tab-close:hover {
    background-color: rgba(255, 59, 48, 0.15);
    color: var(--color-error);
  }

  .tab-close svg {
    width: 100%;
    height: 100%;
  }

  .add-tab-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    background-color: transparent;
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    color: var(--color-text-secondary);
    cursor: pointer;
    transition: all var(--transition-fast);
    flex-shrink: 0;
  }

  .add-tab-btn:hover {
    background-color: var(--color-surface-hover);
    border-color: var(--color-border);
    color: var(--color-accent);
  }

  .add-tab-btn svg {
    width: 16px;
    height: 16px;
    stroke-width: 2.5;
  }

  .browser-content {
    flex: 1;
    position: relative;
    background-color: var(--color-background);
    overflow: hidden;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: var(--spacing-md);
    color: var(--color-text-tertiary);
  }

  .empty-state svg {
    width: 64px;
    height: 64px;
    opacity: 0.4;
  }

  .empty-state h3 {
    font-size: var(--font-size-xl);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-secondary);
    margin: 0;
  }

  .empty-state p {
    font-size: var(--font-size-base);
    margin: 0;
  }
</style>

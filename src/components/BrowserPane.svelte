<script>
  import { onMount, onDestroy } from 'svelte';
  import { editorStore } from '../stores/editorStore.js';
  import { browserStore } from '../stores/browserStore.js';
  import { activeWorkspacePath } from '../stores/workspaceStore.js';
  import BrowserNavigation from './BrowserNavigation.svelte';

  export let pane;
  export let isActive = false;

  let allBrowsers = [];
  let currentZoomLevel = 1;
  const createdBrowsers = new Set(); // Track which browsers we've created in Electron

  browserStore.subscribe((state) => {
    console.log(`[BrowserPane] Store update - globalZoomLevel: ${state.globalZoomLevel}, currentZoomLevel: ${currentZoomLevel}, activeBrowser: ${activeBrowser?.id}`);
    allBrowsers = state.browsers;
    
    // Handle zoom level changes
    if (state.globalZoomLevel !== currentZoomLevel) {
      console.log(`[BrowserPane] 🔍 Zoom level changed from ${currentZoomLevel} to ${state.globalZoomLevel}`);
      currentZoomLevel = state.globalZoomLevel;
      
      // Apply zoom to active browser
      if (activeBrowser && window.electronAPI) {
        const zoomFactor = currentZoomLevel;
        console.log(`[BrowserPane] ✅ Calling browserSetZoom for ${activeBrowser.id} with factor ${zoomFactor}`);
        
        window.electronAPI.browserSetZoom({
          browserId: activeBrowser.id,
          zoomFactor
        }).then(result => {
          console.log(`[BrowserPane] ✅ browserSetZoom result:`, result);
        }).catch(err => {
          console.error(`[BrowserPane] ❌ Error setting zoom for ${activeBrowser.id}:`, err);
        });
      } else {
        console.log(`[BrowserPane] ⚠️ Cannot apply zoom - activeBrowser: ${!!activeBrowser}, electronAPI: ${!!window.electronAPI}`);
      }
    } else {
      console.log(`[BrowserPane] No zoom change - levels match`);
    }
  });

  // Get browser objects for this pane
  $: paneBrowsers = pane.browserIds
    .map(id => allBrowsers.find(b => b.id === id))
    .filter(Boolean);

  $: activeBrowser = paneBrowsers.find(b => b.id === pane.activeBrowserId);

  // Create browser instances in Electron when they appear in this pane
  $: if (paneBrowsers.length > 0 && window.electronAPI) {
    paneBrowsers.forEach(browser => {
      if (!createdBrowsers.has(browser.id)) {
        createBrowserInstance(browser);
      }
    });
  }

  async function createBrowserInstance(browser) {
    console.log('[BrowserPane.createBrowserInstance] Creating:', browser.id);
    console.log('[BrowserPane.createBrowserInstance] Browser data:', {
      id: browser.id,
      url: browser.url,
      workspaceId: browser.workspaceId
    });
    
    try {
      const result = await window.electronAPI.browserCreate({
        browserId: browser.id,
        url: browser.url,
        workspaceId: browser.workspaceId
      });
      
      if (result.success) {
        createdBrowsers.add(browser.id);
        console.log('[BrowserPane] ✅ Created browser instance:', browser.id);
      } else {
        console.error('[BrowserPane] ❌ Failed to create browser:', result.error);
      }
    } catch (error) {
      console.error('[BrowserPane] ❌ Error creating browser:', error);
    }
  }

  // Setup event listeners for browser events
  onMount(() => {
    if (!window.electronAPI) return;

    // Listen for navigation events
    window.electronAPI.onBrowserNavigation((data) => {
      browserStore.updateBrowserState(data.browserId, {
        url: data.url,
        canGoBack: data.canGoBack,
        canGoForward: data.canGoForward
      });
    });

    // Listen for title updates
    window.electronAPI.onBrowserTitle((data) => {
      browserStore.updateBrowserState(data.browserId, {
        title: data.title
      });
    });

    // Listen for loading state
    window.electronAPI.onBrowserLoading((data) => {
      browserStore.updateBrowserState(data.browserId, {
        isLoading: data.isLoading
      });
    });

    // Listen for errors
    window.electronAPI.onBrowserError((data) => {
      console.error('[BrowserPane] Browser error:', data);
    });
  });

  onDestroy(() => {
    // Clean up browser instances when pane is destroyed
    if (window.electronAPI) {
      paneBrowsers.forEach(browser => {
        if (createdBrowsers.has(browser.id)) {
          window.electronAPI.browserDestroy({ browserId: browser.id });
          createdBrowsers.delete(browser.id);
        }
      });
    }
  });

  function handlePaneClick() {
    editorStore.setActivePane(pane.id);
  }

  function handleSelectBrowser(browserId) {
    editorStore.setActiveBrowserInPane(pane.id, browserId);
  }

  async function handleCloseBrowser(browserId) {
    // Destroy the Electron browser instance
    if (window.electronAPI && createdBrowsers.has(browserId)) {
      await window.electronAPI.browserDestroy({ browserId });
      createdBrowsers.delete(browserId);
    }
    
    // Remove from pane and kill the browser completely
    editorStore.closeBrowserTab(pane.id, browserId);
    browserStore.removeBrowser(browserId);
  }

  function handleNewBrowser() {
    const browserId = `browser-${Date.now()}`;
    const browser = paneBrowsers[0];
    const workspaceId = browser?.workspaceId;
    
    if (workspaceId) {
      browserStore.addBrowser(browserId, 'https://www.google.com', workspaceId);
      editorStore.addBrowser(browserId);
    }
  }

  function handleDragStart(event, browserId) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('application/x-browser-tab', JSON.stringify({ browserId }));
  }

  function handleDragOver(event) {
    event.preventDefault();
  }

  function handleDrop(event) {
    event.preventDefault();
    
    const data = event.dataTransfer.getData('application/x-browser-tab');
    if (!data) return;

    const { browserId } = JSON.parse(data);
    
    // Add browser to this pane
    editorStore.addBrowser(browserId);
  }

  // Navigation handlers for BrowserNavigation component

  async function handleGoBack() {
    if (activeBrowser && window.electronAPI) {
      await window.electronAPI.browserGoBack({ browserId: activeBrowser.id });
    }
  }

  async function handleGoForward() {
    if (activeBrowser && window.electronAPI) {
      await window.electronAPI.browserGoForward({ browserId: activeBrowser.id });
    }
  }

  async function handleReload() {
    if (activeBrowser && window.electronAPI) {
      await window.electronAPI.browserReload({ browserId: activeBrowser.id });
    }
  }
</script>

<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
<div
  class="browser-pane"
  class:active={isActive}
  on:click={handlePaneClick}
  on:dragover={handleDragOver}
  on:drop={handleDrop}
  role="region"
  aria-label="Browser pane"
>
  <div class="browser-header">
    <div class="browser-tabs">
      {#each paneBrowsers as browser (browser.id)}
        <button
          class="browser-tab"
          class:active={browser.id === pane.activeBrowserId}
          draggable="true"
          on:dragstart={(e) => handleDragStart(e, browser.id)}
          on:click={() => handleSelectBrowser(browser.id)}
        >
          <span class="browser-tab-icon">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="1.5"
                d="M8 2a6 6 0 100 12A6 6 0 008 2zm0 0v12m6-6H2"
              />
            </svg>
          </span>
          <span class="browser-tab-title">{browser.title}</span>
          <button
            class="browser-tab-close"
            on:click|stopPropagation={() => handleCloseBrowser(browser.id)}
            aria-label="Close browser"
          >
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="1.5"
                d="M4 4l8 8m0-8l-8 8"
              />
            </svg>
          </button>
        </button>
      {/each}
    </div>
    <div class="browser-actions">
      <button
        class="browser-action-button"
        on:click={handleNewBrowser}
        title="New Tab"
      >
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="1.5"
            d="M8 3v10M3 8h10"
          />
        </svg>
      </button>
    </div>
  </div>

  {#if activeBrowser}
    <BrowserNavigation
      browserId={activeBrowser.id}
      url={activeBrowser.url}
      canGoBack={activeBrowser.canGoBack}
      canGoForward={activeBrowser.canGoForward}
      isLoading={activeBrowser.isLoading}
      on:navigate={async (e) => {
        if (window.electronAPI) {
          await window.electronAPI.browserNavigate({
            browserId: activeBrowser.id,
            url: e.detail.url
          });
        }
      }}
      on:back={handleGoBack}
      on:forward={handleGoForward}
      on:reload={handleReload}
      on:stop={async () => {
        if (window.electronAPI && activeBrowser) {
          await window.electronAPI.browserStop({ browserId: activeBrowser.id });
        }
      }}
    />
  {/if}

  <div 
    class="browser-content" 
    data-browser-location="canvas-pane" 
    data-pane-id={pane.id}
    data-active-browser={pane.activeBrowserId}
    style="background-color: rgba(255, 0, 0, 0.1);"
  >
    <!-- WebContentsView will render here via Electron positioning -->
    {#if !activeBrowser}
      <div class="browser-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
          />
        </svg>
        <p>No browser tab open</p>
      </div>
    {/if}
    <!-- WebContentsView will render here via Electron positioning -->
  </div>
</div>

<style>
  .browser-pane {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    background-color: var(--color-background);
    border: 2px solid transparent;
    transition: border-color var(--transition-fast);
  }

  .browser-pane.active {
    border-color: var(--color-accent);
  }

  .browser-header {
    display: flex;
    align-items: center;
    height: 36px;
    background-color: var(--color-surface-secondary);
    border-bottom: 1px solid var(--color-border);
  }

  .browser-tabs {
    display: flex;
    flex: 1;
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: none;
  }

  .browser-tabs::-webkit-scrollbar {
    display: none;
  }

  .browser-tab {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
    padding: 0 var(--spacing-md);
    height: 36px;
    background-color: transparent;
    border-right: 1px solid var(--color-border);
    cursor: grab;
    transition: all var(--transition-fast);
    user-select: none;
    min-width: 120px;
    max-width: 200px;
  }

  .browser-tab:active {
    cursor: grabbing;
  }

  .browser-tab:hover {
    background-color: var(--color-surface-hover);
  }

  .browser-tab.active {
    background-color: var(--color-background);
    border-bottom: 2px solid var(--color-accent);
  }

  .browser-tab-icon svg {
    width: 14px;
    height: 14px;
    flex-shrink: 0;
  }

  .browser-tab-title {
    font-size: var(--font-size-sm);
    color: var(--color-text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
  }

  .browser-tab:not(.active) .browser-tab-title {
    color: var(--color-text-secondary);
  }

  .browser-tab-close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border-radius: var(--radius-sm);
    opacity: 0;
    transition: all var(--transition-fast);
    color: var(--color-text-tertiary);
    flex-shrink: 0;
  }

  .browser-tab:hover .browser-tab-close,
  .browser-tab.active .browser-tab-close {
    opacity: 1;
  }

  .browser-tab-close:hover {
    background-color: var(--color-surface-hover);
    color: var(--color-text-primary);
  }

  .browser-tab-close svg {
    width: 12px;
    height: 12px;
  }

  .browser-actions {
    display: flex;
    align-items: center;
    padding: 0 var(--spacing-xs);
    border-left: 1px solid var(--color-border);
  }

  .browser-action-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border-radius: var(--radius-sm);
    color: var(--color-text-tertiary);
    transition: all var(--transition-fast);
  }

  .browser-action-button:hover {
    background-color: var(--color-surface-hover);
    color: var(--color-text-primary);
  }

  .browser-action-button svg {
    width: 14px;
    height: 14px;
  }

  .browser-toolbar {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
    padding: var(--spacing-xs);
    background-color: var(--color-surface-secondary);
    border-bottom: 1px solid var(--color-border);
    height: 40px;
  }

  .nav-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: var(--radius-sm);
    color: var(--color-text-secondary);
    transition: all var(--transition-fast);
  }

  .nav-button:hover:not(:disabled) {
    background-color: var(--color-surface-hover);
    color: var(--color-text-primary);
  }

  .nav-button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .nav-button svg {
    width: 16px;
    height: 16px;
  }

  .url-input {
    flex: 1;
    height: 28px;
    padding: 0 var(--spacing-sm);
    background-color: var(--color-background);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    font-size: var(--font-size-sm);
    color: var(--color-text-primary);
    transition: all var(--transition-fast);
  }

  .url-input:focus {
    outline: none;
    border-color: var(--color-accent);
  }

  .browser-content {
    flex: 1;
    overflow: hidden;
    position: relative;
  }

  .browser-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: var(--spacing-md);
    color: var(--color-text-tertiary);
  }

  .browser-empty svg {
    width: 64px;
    height: 64px;
  }

  .browser-empty p {
    font-size: var(--font-size-base);
  }
</style>

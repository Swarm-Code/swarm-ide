<script>
  import { onMount, onDestroy } from 'svelte';
  import { editorStore } from '../stores/editorStore.js';
  import { browserStore } from '../stores/browserStore.js';
  import { terminalStore } from '../stores/terminalStore.js';
  import { appStore } from '../stores/appStore.js';
  import EditorTab from './EditorTab.svelte';
  import MonacoEditor from './MonacoEditor.svelte';

  export let pane;
  export let isActive = false;

  let allBrowsers = [];
  const createdBrowsers = new Set();
  let dragOverIndex = null;
  let overlayVisible = false;

  browserStore.subscribe((state) => {
    allBrowsers = state.browsers;
  });

  appStore.subscribe((state) => {
    overlayVisible = state.overlayVisible;
  });

  // Create browser instances for browser tabs
  $: browserTabs = pane.tabs.filter(t => t.type === 'browser');
  $: if (browserTabs.length > 0 && window.electronAPI) {
    browserTabs.forEach(tab => {
      const browser = allBrowsers.find(b => b.id === tab.browserId);
      if (browser && !createdBrowsers.has(tab.browserId)) {
        createBrowserInstance(browser, tab);
      }
    });
  }

  async function createBrowserInstance(browser, tab) {
    try {
      const result = await window.electronAPI.browserCreate({
        browserId: browser.id,
        url: browser.url || tab.url,
        workspaceId: browser.workspaceId
      });
      
      if (result.success) {
        createdBrowsers.add(browser.id);
        console.log('[UnifiedPane] ✅ Created browser instance:', browser.id);
      }
    } catch (error) {
      console.error('[UnifiedPane] ❌ Error creating browser:', error);
    }
  }

  // Setup browser event listeners
  onMount(() => {
    if (!window.electronAPI) return;

    window.electronAPI.onBrowserNavigation((data) => {
      const tab = pane.tabs.find(t => t.type === 'browser' && t.browserId === data.browserId);
      if (tab) {
        tab.url = data.url;
      }
      browserStore.updateBrowserState(data.browserId, {
        url: data.url,
        canGoBack: data.canGoBack,
        canGoForward: data.canGoForward
      });
    });

    window.electronAPI.onBrowserTitle((data) => {
      const tab = pane.tabs.find(t => t.type === 'browser' && t.browserId === data.browserId);
      if (tab) {
        tab.title = data.title;
      }
      browserStore.updateBrowserState(data.browserId, {
        title: data.title
      });
    });

    window.electronAPI.onBrowserLoading((data) => {
      browserStore.updateBrowserState(data.browserId, {
        isLoading: data.isLoading
      });
    });
  });

  onDestroy(() => {
    if (window.electronAPI) {
      browserTabs.forEach(tab => {
        if (createdBrowsers.has(tab.browserId)) {
          window.electronAPI.browserDestroy({ browserId: tab.browserId });
          createdBrowsers.delete(tab.browserId);
        }
      });
    }
  });

  $: activeTab = pane.tabs.find(t => t.id === pane.activeTabId);
  $: activeBrowser = activeTab?.type === 'browser' ? allBrowsers.find(b => b.id === activeTab.browserId) : null;

  function handlePaneClick() {
    editorStore.setActivePane(pane.id);
  }

  function handleTabSelect(event) {
    editorStore.setActiveTab(pane.id, event.detail.tabId);
  }

  function handleTabClose(event) {
    const tab = pane.tabs.find(t => t.id === event.detail.tabId);
    if (tab) {
      if (tab.type === 'browser' && window.electronAPI && createdBrowsers.has(tab.browserId)) {
        window.electronAPI.browserDestroy({ browserId: tab.browserId });
        createdBrowsers.delete(tab.browserId);
        browserStore.removeBrowser(tab.browserId);
      } else if (tab.type === 'terminal') {
        // Remove terminal completely (kill the process)
        terminalStore.removeTerminal(tab.terminalId);
      }
      editorStore.closeTab(pane.id, event.detail.tabId);
    }
  }

  function handleSplitHorizontal() {
    editorStore.splitPane(pane.id, 'horizontal');
  }

  function handleSplitVertical() {
    editorStore.splitPane(pane.id, 'vertical');
  }

  function handleClosePane() {
    editorStore.closePane(pane.id);
  }

  function handleDragOver(event, index) {
    event.preventDefault();
    dragOverIndex = index;
  }

  function handleDragLeave() {
    dragOverIndex = null;
  }

  function handleDrop(event, toIndex) {
    event.preventDefault();
    dragOverIndex = null;

    const editorData = event.dataTransfer.getData('application/x-editor-tab');
    if (editorData) {
      const { tabId, paneId: fromPaneId } = JSON.parse(editorData);
      if (fromPaneId === pane.id) {
        const fromIndex = pane.tabs.findIndex(t => t.id === tabId);
        if (fromIndex !== -1 && fromIndex !== toIndex) {
          editorStore.reorderTabs(pane.id, fromIndex, toIndex);
        }
      } else {
        editorStore.moveTab(fromPaneId, pane.id, tabId, toIndex);
      }
      return;
    }

    // Handle terminal drops - add as tab
    const terminalData = event.dataTransfer.getData('application/x-terminal-tab');
    if (terminalData) {
      const { terminalId } = JSON.parse(terminalData);
      // Add terminal as a tab (like browsers and editors)
      editorStore.addTerminalTab(pane.id, terminalId);
    }
  }

  function handleTabBarDrop(event) {
    event.preventDefault();
    dragOverIndex = null;

    const editorData = event.dataTransfer.getData('application/x-editor-tab');
    if (editorData) {
      const { tabId, paneId: fromPaneId } = JSON.parse(editorData);
      if (fromPaneId !== pane.id) {
        editorStore.moveTab(fromPaneId, pane.id, tabId);
      }
      return;
    }

    // Handle terminal drops - add as tab
    const terminalData = event.dataTransfer.getData('application/x-terminal-tab');
    if (terminalData) {
      const { terminalId } = JSON.parse(terminalData);
      // Add terminal as a tab (like browsers and editors)
      editorStore.addTerminalTab(pane.id, terminalId);
    }
  }

  function getLanguageFromFilename(filename) {
    const ext = filename?.split('.').pop()?.toLowerCase() || '';
    const languageMap = {
      js: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript',
      json: 'json', html: 'html', css: 'css', scss: 'scss', md: 'markdown',
      py: 'python', rb: 'ruby', php: 'php', java: 'java', cpp: 'cpp',
      c: 'c', cs: 'csharp', go: 'go', rs: 'rust', sh: 'shell', bash: 'shell',
      yaml: 'yaml', yml: 'yaml', xml: 'xml', sql: 'sql', cjs: 'javascript',
      mjs: 'javascript', svelte: 'html',
    };
    return languageMap[ext] || 'plaintext';
  }

  function handleEditorChange(newContent) {
    if (activeTab && activeTab.type === 'editor') {
      editorStore.setTabDirty(pane.id, activeTab.id, true);
    }
  }

  // Browser navigation
  let urlInput = '';
  $: if (activeBrowser) {
    urlInput = activeBrowser.url;
  }

  async function handleUrlEnter(event) {
    if (event.key === 'Enter' && activeBrowser && activeTab?.type === 'browser' && window.electronAPI) {
      let url = urlInput.trim();
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        if (url.includes('.') && !url.includes(' ')) {
          url = 'https://' + url;
        } else {
          url = 'https://www.google.com/search?q=' + encodeURIComponent(url);
        }
      }
      await window.electronAPI.browserNavigate({ browserId: activeBrowser.id, url });
      browserStore.navigate(activeBrowser.id, url);
    }
  }

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
<div
  class="unified-pane"
  class:active={isActive}
  on:click={handlePaneClick}
  role="tabpanel"
  tabindex="-1"
>
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="tab-bar" on:dragover={(e) => e.preventDefault()} on:drop={handleTabBarDrop} role="toolbar" tabindex="-1">
    <div class="tab-list" role="tablist">
      {#each pane.tabs as tab, index (tab.id)}
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <div
          class="tab-wrapper"
          class:drag-over={dragOverIndex === index}
          on:dragover={(e) => handleDragOver(e, index)}
          on:dragleave={handleDragLeave}
          on:drop={(e) => handleDrop(e, index)}
          role="presentation"
        >
          <EditorTab
            tab={{
              id: tab.id,
              name: tab.type === 'browser' ? tab.title : (tab.type === 'terminal' ? tab.title : tab.name),
              path: tab.path,
              isDirty: tab.isDirty
            }}
            paneId={pane.id}
            isActive={tab.id === pane.activeTabId}
            on:select={handleTabSelect}
            on:close={handleTabClose}
          />
        </div>
      {/each}
    </div>
    <div class="tab-actions">
      <button class="action-button" on:click={handleSplitHorizontal} title="Split horizontally">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor">
          <rect x="2" y="2" width="12" height="12" stroke-width="1.5" />
          <line x1="2" y1="8" x2="14" y2="8" stroke-width="1.5" />
        </svg>
      </button>
      <button class="action-button" on:click={handleSplitVertical} title="Split vertically">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor">
          <rect x="2" y="2" width="12" height="12" stroke-width="1.5" />
          <line x1="8" y1="2" x2="8" y2="14" stroke-width="1.5" />
        </svg>
      </button>
      <button class="action-button" on:click={handleClosePane} title="Close pane">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 4l8 8m0-8l-8 8" />
        </svg>
      </button>
    </div>
  </div>

  {#if activeTab?.type === 'browser' && activeBrowser}
    <div class="browser-toolbar">
      <button class="nav-button" disabled={!activeBrowser.canGoBack} on:click={handleGoBack} title="Back">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M10 12L6 8l4-4" />
        </svg>
      </button>
      <button class="nav-button" disabled={!activeBrowser.canGoForward} on:click={handleGoForward} title="Forward">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M6 12l4-4-4-4" />
        </svg>
      </button>
      <button class="nav-button" on:click={handleReload} title="Reload">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 8a4 4 0 017.5-2m.5 6a4 4 0 01-7.5 2m0-4V4m0 0h4M12 12V8m0 4H8" />
        </svg>
      </button>
      <input type="text" class="url-input" bind:value={urlInput} on:keydown={handleUrlEnter} placeholder="Enter URL or search..." />
    </div>
  {/if}

  <div class="content">
    {#if activeTab}
      {#if activeTab.type === 'editor'}
        {#key activeTab.id}
          <MonacoEditor
            content={activeTab.content || ''}
            language={getLanguageFromFilename(activeTab.name)}
            onChange={handleEditorChange}
            readOnly={false}
          />
        {/key}
      {:else if activeTab.type === 'browser'}
        <div 
          class="browser-content" 
          data-browser-location="canvas-pane" 
          data-pane-id={pane.id}
          data-active-browser={activeTab.browserId}
        >
          <!-- WebContentsView renders here -->
          {#if overlayVisible}
            <div class="browser-blur-overlay"></div>
          {/if}
        </div>
      {:else if activeTab.type === 'terminal'}
        <div 
          class="terminal-content" 
          data-terminal-location="canvas-pane" 
          data-pane-id={pane.id}
          data-active-terminal={activeTab.terminalId}
        >
          <!-- Terminal renders here via IDEWindow positioning -->
        </div>
      {/if}
    {:else}
      <div class="empty-pane">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <p>No file or browser open</p>
      </div>
    {/if}
  </div>
</div>

<style>
  .unified-pane {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    background-color: var(--color-background);
    border: 2px solid transparent;
    transition: border-color var(--transition-fast);
  }

  .unified-pane.active {
    border-color: var(--color-accent);
  }

  .tab-bar {
    display: flex;
    align-items: center;
    height: 36px;
    background-color: var(--color-surface-secondary);
    border-bottom: 1px solid var(--color-border);
  }

  .tab-list {
    display: flex;
    flex: 1;
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: none;
  }

  .tab-list::-webkit-scrollbar {
    display: none;
  }

  .tab-wrapper {
    position: relative;
  }

  .tab-wrapper.drag-over::before {
    content: '';
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 2px;
    background-color: var(--color-accent);
    z-index: var(--z-base);
  }

  .tab-actions {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 0 var(--spacing-xs);
    border-left: 1px solid var(--color-border);
  }

  .action-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border-radius: var(--radius-sm);
    color: var(--color-text-tertiary);
    transition: all var(--transition-fast);
  }

  .action-button:hover {
    background-color: var(--color-surface-hover);
    color: var(--color-text-primary);
  }

  .action-button svg {
    width: 14px;
    height: 14px;
  }

  .browser-toolbar {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 8px;
    background-color: var(--color-surface-secondary);
    border-bottom: 1px solid var(--color-border);
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
    opacity: 0.3;
    cursor: not-allowed;
  }

  .nav-button svg {
    width: 16px;
    height: 16px;
  }

  .url-input {
    flex: 1;
    height: 28px;
    padding: 0 12px;
    background-color: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    color: var(--color-text-primary);
    font-size: var(--font-size-sm);
  }

  .url-input:focus {
    outline: none;
    border-color: var(--color-accent);
  }

  .content {
    flex: 1;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .browser-content {
    width: 100%;
    height: 100%;
    position: relative;
    /* Strict containment - prevents browser from overflowing */
    contain: strict;
    overflow: hidden;
    /* DEBUG: Visible border to see actual .browser-content bounds */
    border: 3px solid lime;
    box-sizing: border-box;
  }

  .terminal-content {
    width: 100%;
    height: 100%;
    position: relative;
    overflow: hidden;
  }

  .browser-blur-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: linear-gradient(135deg, 
      rgba(140, 140, 140, 0.06) 0%, 
      rgba(160, 160, 160, 0.1) 100%);
    backdrop-filter: blur(16px);
    z-index: 10;
    pointer-events: none;
    animation: blurOverlayFadeIn 350ms cubic-bezier(0.4, 0, 0.2, 1) forwards;
  }

  @keyframes blurOverlayFadeIn {
    0% {
      opacity: 0;
      backdrop-filter: blur(0px);
    }
    30% {
      opacity: 0.2;
      backdrop-filter: blur(3px);
    }
    60% {
      opacity: 0.6;
      backdrop-filter: blur(8px);
    }
    100% {
      opacity: 1;
      backdrop-filter: blur(16px);
    }
  }

  .empty-pane {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--spacing-md);
    color: var(--color-text-tertiary);
  }

  .empty-pane svg {
    width: 48px;
    height: 48px;
  }

  .empty-pane p {
    font-size: var(--font-size-base);
  }
</style>

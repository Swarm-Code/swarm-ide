<script>
  import { appStore } from '../stores/appStore.js';
  import { editorStore } from '../stores/editorStore.js';
  import { browserStore } from '../stores/browserStore.js';
  import { terminalStore } from '../stores/terminalStore.js';
  import { workspaceStore } from '../stores/workspaceStore.js';
  import { deepWikiStore } from '../stores/deepWikiStore.js';
  
  export let terminalVisible = false;
  export let onToggleTerminal;

  let activePanel = 'explorer';
  let activeWorkspaceId = null;
  let deepWikiState = null;
  let showDeepWikiMenu = false;
  let deepWikiMenuTop = 0;
  let editorState = null;

  appStore.subscribe((state) => {
    activePanel = state.activePanel;
  });

  workspaceStore.subscribe((state) => {
    activeWorkspaceId = state.activeWorkspaceId;
  });

  deepWikiStore.subscribe((state) => {
    deepWikiState = state;
  });

  editorStore.subscribe((state) => {
    editorState = state;
  });

  $: deepWikiStatus = deepWikiState?.status ?? { state: 'stopped', message: 'DeepWiki idle' };
  $: deepWikiRunning = deepWikiStatus.state === 'running';
  $: deepWikiStarting = deepWikiStatus.state === 'starting';
  $: deepWikiIndicatorState = (() => {
    const state = deepWikiStatus?.state;
    if (state === 'error') return 'error';
    if (state === 'starting') return 'loading';
    if (state === 'running') return 'running';
    return 'idle';
  })();

  function openSettingsTab(target = null) {
    editorStore.openSettingsTab(target);
  }

  function handlePanelClick(panel) {
    appStore.setActivePanel(panel);
  }

  function isMetaClick(event) {
    return event?.metaKey || event?.ctrlKey;
  }

  function handleExplorerButton(event) {
    if (isMetaClick(event)) {
      openSettingsTab('explorer');
      return;
    }
    handlePanelClick('explorer');
  }

  function handleTerminalClick() {
    console.log('[ActivityBar.handleTerminalClick] Creating terminal in canvas...');
    console.log('[ActivityBar.handleTerminalClick] activeWorkspaceId:', activeWorkspaceId);
    
    // Create a new terminal instance
    const terminalId = `terminal-${Date.now()}`;
    const workspaceId = activeWorkspaceId;
    
    console.log('[ActivityBar.handleTerminalClick] terminalId:', terminalId);
    
    // Add to terminal store
    terminalStore.addTerminal(terminalId, workspaceId);
    
    // Add terminal tab to active editor pane (like browsers)
    editorStore.addTerminalTab(editorStore.getActivePaneId(), terminalId);
    
    console.log('[ActivityBar.handleTerminalClick] ✅ Terminal creation complete');
  }

  function handleBrowserClick() {
    console.log('[ActivityBar.handleBrowserClick] Creating browser...');
    console.log('[ActivityBar.handleBrowserClick] activeWorkspaceId:', activeWorkspaceId);
    
    // Create a new browser instance
    const browserId = `browser-${Date.now()}`;
    const workspaceId = activeWorkspaceId;
    
    console.log('[ActivityBar.handleBrowserClick] browserId:', browserId);
    
    // Add to browser store
    browserStore.addBrowser(browserId, 'https://www.google.com', workspaceId);
    
    // Add browser pane to editor canvas
    editorStore.addBrowser(browserId);
    
    console.log('[ActivityBar.handleBrowserClick] ✅ Browser creation complete');
  }

  async function handleDeepWikiClick() {
    await deepWikiStore.openForActiveWorkspace({ focus: true });
  }

  function handleDeepWikiContextMenu(event) {
    event.preventDefault();
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    deepWikiMenuTop = rect.top;
    showDeepWikiMenu = true;
  }

  function closeDeepWikiMenu() {
    showDeepWikiMenu = false;
  }

  async function handleDeepWikiMenuAction(action) {
    if (action === 'open') {
      await handleDeepWikiClick();
    } else if (action === 'regenerate') {
      await deepWikiStore.regenerateActiveWorkspace();
    } else if (action === 'start') {
      await deepWikiStore.start();
    } else if (action === 'stop') {
      await deepWikiStore.stop();
    } else if (action === 'configure') {
      openSettingsTab('deepwiki');
    }

    if (action !== 'configure') {
      closeDeepWikiMenu();
    }
  }

  function handleWindowClick(event) {
    if (!showDeepWikiMenu) return;
    if (event.target.closest('.deepwiki-menu') || event.target.closest('.deepwiki-button')) {
      return;
    }
    closeDeepWikiMenu();
  }
  function handleTerminalButton(event) {
    if (isMetaClick(event)) {
      openSettingsTab('terminal');
      return;
    }
    handleTerminalClick();
  }

  function handleBrowserButton(event) {
    if (isMetaClick(event)) {
      openSettingsTab('browser');
      return;
    }
    handleBrowserClick();
  }

  async function handleDeepWikiButton(event) {
    if (isMetaClick(event)) {
      openSettingsTab('deepwiki');
      return;
    }
    await handleDeepWikiClick();
  }

  function handleSettingsButton(event) {
    if (isMetaClick(event)) {
      openSettingsTab('deepwiki');
      return;
    }
    openSettingsTab(null);
  }

  function findPaneById(layout, paneId) {
    if (!layout) return null;
    if (layout.type === 'pane') {
      return layout.id === paneId ? layout : null;
    }
    const leftResult = findPaneById(layout.left, paneId);
    if (leftResult) return leftResult;
    return findPaneById(layout.right, paneId);
  }

  $: settingsActive = (() => {
    if (!editorState) {
      return false;
    }
    const pane = findPaneById(editorState.layout, editorState.activePaneId);
    if (!pane) return false;
    const activeTab = pane.tabs.find((t) => t.id === pane.activeTabId);
    return activeTab?.type === 'settings';
  })();
</script>

<svelte:window on:click={handleWindowClick} />

<div class="activity-bar">
  <div class="activity-stack">
    <button
      class="activity-button"
      class:active={activePanel === 'explorer'}
      on:click={handleExplorerButton}
      title="Explorer — Cmd+Click for settings"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
        />
      </svg>
    </button>

    <button
      class="activity-button"
      on:click={handleBrowserButton}
      title="New Browser — Cmd+Click for settings"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
        />
      </svg>
    </button>
    
    <button
      class="activity-button"
      on:click={handleTerminalButton}
      title="New Terminal — Cmd+Click for settings"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
        />
      </svg>
    </button>

    <button
      class="activity-button deepwiki-button"
      class:active={deepWikiRunning}
      class:loading={deepWikiStarting}
      on:click={handleDeepWikiButton}
      on:contextmenu={handleDeepWikiContextMenu}
      title={`DeepWiki — ${deepWikiStatus.message || 'Launch plugin'}. Cmd+Click for settings.`}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path
          stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        d="M4 19.5V5a2 2 0 012-2h9.5a.5.5 0 01.5.5V7h3a1 1 0 011 1v12.5a.5.5 0 01-.5.5H8a4 4 0 00-4 4"
      />
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        d="M8 7h8"
      />
      </svg>
      <span class={`activity-indicator ${deepWikiIndicatorState}`} aria-hidden="true">
        {#if deepWikiIndicatorState === 'error'}×{/if}
      </span>
    </button>
  </div>

  <button
    class="activity-button settings-button"
    class:active={settingsActive}
    on:click={handleSettingsButton}
    title="Global Settings"
  >
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.573-1.065z"
      />
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  </button>
</div>

{#if showDeepWikiMenu}
  <div class="deepwiki-menu" style={`top: ${deepWikiMenuTop}px`}>
    <div class="menu-section">
      <p class="menu-title">DeepWiki</p>
      <p class="menu-status">{deepWikiStatus.message}</p>
    </div>
    <button class="menu-item" on:click={() => handleDeepWikiMenuAction('open')}>
      Open / Focus Pane
    </button>
    <button class="menu-item" on:click={() => handleDeepWikiMenuAction('regenerate')} disabled={!deepWikiRunning}>
      Regenerate Workspace
    </button>
    <button class="menu-item" on:click={() => handleDeepWikiMenuAction(deepWikiRunning ? 'stop' : 'start')}>
      {deepWikiRunning ? 'Stop Services' : 'Start Services'}
    </button>
    <button class="menu-item" on:click={() => handleDeepWikiMenuAction('configure')}>
      Configure…
    </button>
    {#if deepWikiStatus.state === 'error'}
      <p class="menu-error">{deepWikiStatus.error || deepWikiStatus.message}</p>
    {/if}
  </div>
{/if}
<style>
  .activity-bar {
    width: 48px;
    height: 100%;
    background-color: var(--color-surface-secondary);
    border-right: 1px solid var(--color-border);
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: var(--spacing-xs) 0;
    gap: var(--spacing-xs);
  }

  .activity-stack {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
    flex: 1;
  }

  .activity-button {
    width: 48px;
    height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-text-secondary);
    transition: all var(--transition-fast);
    position: relative;
  }

  .activity-button::before {
    content: '';
    position: absolute;
    left: 0;
    top: 50%;
    transform: translateY(-50%);
    width: 2px;
    height: 0;
    background-color: var(--color-accent);
    transition: height var(--transition-fast);
  }

  .activity-button:hover {
    color: var(--color-text-primary);
  }

  .activity-button.active {
    color: var(--color-text-primary);
  }

  .activity-button.loading {
    color: var(--color-accent);
  }

  .activity-button.active::before {
    height: 24px;
  }

  .activity-button svg {
    width: 24px;
    height: 24px;
  }

  .activity-indicator {
    position: absolute;
    bottom: 6px;
    right: 8px;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    pointer-events: none;
    font-size: 8px;
    font-weight: 600;
    line-height: 1;
    text-align: center;
    opacity: 0;
  }

  .activity-indicator.loading,
  .activity-indicator.running,
  .activity-indicator.idle,
  .activity-indicator.error {
    opacity: 1;
  }

  .activity-indicator.loading {
    background-color: currentColor;
    animation: activity-pulse 1s ease-in-out infinite;
  }

  .activity-indicator.running {
    background-color: currentColor;
    animation: none;
  }

  .activity-indicator.idle {
    border: 1px solid currentColor;
    background: transparent;
    animation: none;
  }

  .activity-indicator.error {
    width: 8px;
    height: 8px;
    border-radius: 2px;
    bottom: 5px;
    right: 6px;
    background: transparent;
    color: var(--color-danger, #ff4d4f);
    animation: none;
  }

  @keyframes activity-pulse {
    0% {
      transform: scale(0.7);
      opacity: 0.4;
    }
    50% {
      transform: scale(1);
      opacity: 1;
    }
    100% {
      transform: scale(0.7);
      opacity: 0.4;
    }
  }

  .deepwiki-menu {
    position: absolute;
    left: 56px;
    width: 220px;
    background-color: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.2);
    padding: var(--spacing-sm);
    z-index: var(--z-popover, 1000);
  }

  .menu-section {
    margin-bottom: var(--spacing-sm);
  }

  .menu-title {
    margin: 0;
    font-weight: var(--font-weight-semibold);
  }

  .menu-status {
    margin: 0;
    font-size: var(--font-size-xs);
    color: var(--color-text-secondary);
  }

  .menu-item {
    width: 100%;
    text-align: left;
    padding: 6px 8px;
    border-radius: var(--radius-sm);
    background: transparent;
    border: none;
    color: var(--color-text-primary);
    font-size: var(--font-size-sm);
  }

  .menu-item:hover:enabled {
    background-color: var(--color-surface-hover);
  }

  .menu-item:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .menu-error {
    margin: var(--spacing-xs) 0 0;
    font-size: var(--font-size-xs);
    color: var(--color-danger, #ff3b30);
  }

  .settings-button {
    margin-top: auto;
  }
</style>

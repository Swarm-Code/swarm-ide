<script>
  import { appStore } from '../stores/appStore.js';
  import { editorStore } from '../stores/editorStore.js';
  import { browserStore } from '../stores/browserStore.js';
  import { terminalStore } from '../stores/terminalStore.js';
  import { workspaceStore, activeWorkspacePath } from '../stores/workspaceStore.js';
  import { canvasStore } from '../stores/canvasStore.js';

  let activePanel = 'explorer';
  let activeWorkspaceId = null;
  let currentWorkspacePath = null;

  appStore.subscribe((state) => {
    activePanel = state.activePanel;
  });

  workspaceStore.subscribe((state) => {
    activeWorkspaceId = state.activeWorkspaceId;
  });

  activeWorkspacePath.subscribe((path) => {
    currentWorkspacePath = path;
  });

  function handlePanelClick(panel) {
    appStore.setActivePanel(panel);
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

  function handleMindClick() {
    // Switch to or create Mind canvas
    canvasStore.getOrCreateMindCanvas();
  }

  function handleGitClick() {
    // Switch to or create Git canvas
    canvasStore.getOrCreateGitCanvas();
  }

  export let outputVisible = false;
  function handleOutputClick() {
    outputVisible = !outputVisible;
  }
</script>

<div class="activity-bar">
  <button
    class="activity-button"
    class:active={activePanel === 'explorer'}
    on:click={() => handlePanelClick('explorer')}
    title="Explorer"
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
    on:click={handleBrowserClick}
    title="New Browser"
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
    on:click={handleTerminalClick}
    title="New Terminal"
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
    class="activity-button"
    on:click={handleMindClick}
    title="Mind Space"
  >
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
      />
    </svg>
  </button>

  <button
    class="activity-button"
    class:active={activePanel === 'git'}
    on:click={handleGitClick}
    title="Source Control"
  >
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        d="M9 11l3-3m0 0l3 3m-3-3v8m0-13a9 9 0 110 18 9 9 0 010-18z"
      />
    </svg>
  </button>

  <div class="activity-spacer"></div>

  <button
    class="activity-button"
    class:active={outputVisible}
    on:click={handleOutputClick}
    title="Output"
  >
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
      />
    </svg>
  </button>
</div>

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

  .activity-button.active::before {
    height: 24px;
  }

  .activity-button svg {
    width: 24px;
    height: 24px;
  }

  .activity-spacer {
    flex: 1;
  }
</style>

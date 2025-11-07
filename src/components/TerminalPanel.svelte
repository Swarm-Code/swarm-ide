<script>
  import { terminalStore } from '../stores/terminalStore.js';
  import { editorStore } from '../stores/editorStore.js';
  import { workspaceStore, activeWorkspacePath } from '../stores/workspaceStore.js';
  import Terminal from './Terminal.svelte';

  let allTerminals = [];
  let activeTerminalId = null;
  let currentWorkspacePath = null;
  let activeWorkspaceId = null;
  let editorLayout = null;

  terminalStore.subscribe((state) => {
    allTerminals = state.terminals;
    activeTerminalId = state.activeTerminalId;
  });

  activeWorkspacePath.subscribe((path) => {
    currentWorkspacePath = path;
  });

  workspaceStore.subscribe((state) => {
    activeWorkspaceId = state.activeWorkspaceId;
  });

  editorStore.subscribe((state) => {
    editorLayout = state.layout;
  });

  // Get all terminal IDs that are in the editor canvas
  function getTerminalsInCanvas(layout) {
    const terminalIds = [];
    
    function traverse(node) {
      if (node.type === 'pane' && node.paneType === 'terminal' && node.terminalIds) {
        terminalIds.push(...node.terminalIds);
      } else if (node.type === 'split') {
        traverse(node.left);
        traverse(node.right);
      }
    }
    
    if (layout) traverse(layout);
    return new Set(terminalIds);
  }

  // Filter terminals for TABS only (not content rendering)
  $: terminalsInCanvas = getTerminalsInCanvas(editorLayout);
  $: visibleTerminals = allTerminals.filter(t => 
    t.workspaceId === activeWorkspaceId && !terminalsInCanvas.has(t.id)
  );

  function handleNewTerminal() {
    const terminalId = `terminal-${Date.now()}`;
    const workspaceId = activeWorkspaceId;
    terminalStore.addTerminal(terminalId, workspaceId);
  }

  function handleCloseTerminal(id) {
    terminalStore.removeTerminal(id);
  }

  function handleSelectTerminal(id) {
    terminalStore.setActiveTerminal(id);
  }

  function handleDragStart(event, terminalId) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('application/x-terminal-tab', JSON.stringify({ terminalId }));
  }

  function handleDragOver(event) {
    event.preventDefault();
  }

  function handleDrop(event) {
    event.preventDefault();
    
    const data = event.dataTransfer.getData('application/x-terminal-tab');
    if (!data) return;

    const { terminalId } = JSON.parse(data);
    
    // Remove terminal from canvas (if it's there)
    editorStore.removeTerminal(terminalId);
    // Make it active in the bottom panel
    terminalStore.setActiveTerminal(terminalId);
  }

  // Check if terminal should be visible in content area
  function isTerminalVisible(terminal) {
    // Hide if in canvas
    if (terminalsInCanvas.has(terminal.id)) return false;
    // Hide if wrong workspace
    if (terminal.workspaceId !== activeWorkspaceId) return false;
    // Hide if not active
    if (terminal.id !== activeTerminalId) return false;
    return true;
  }

  $: activeTerminal = visibleTerminals.find((t) => t.id === activeTerminalId);
</script>

<div class="terminal-panel" on:dragover={handleDragOver} on:drop={handleDrop} role="region" aria-label="Terminal panel">
  <div class="terminal-header">
    <div class="terminal-tabs">
      {#each visibleTerminals as terminal (terminal.id)}
        <button
          class="terminal-tab"
          class:active={terminal.id === activeTerminalId}
          draggable="true"
          on:dragstart={(e) => handleDragStart(e, terminal.id)}
          on:click={() => handleSelectTerminal(terminal.id)}
        >
          <span class="terminal-tab-title">{terminal.title}</span>
          <button
            class="terminal-tab-close"
            on:click|stopPropagation={() => handleCloseTerminal(terminal.id)}
            aria-label="Close terminal"
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
    <div class="terminal-actions">
      <button
        class="terminal-action-button"
        on:click={handleNewTerminal}
        title="New Terminal"
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

  <div class="terminal-content" data-terminal-location="bottom-panel" data-active-terminal={activeTerminalId}>
    <!-- Terminals render globally in IDEWindow, this is just the display area -->
    
    <!-- Show empty state only when there are truly no visible terminals in current workspace -->
    {#if visibleTerminals.length === 0}
      <div class="terminal-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
        <p>No terminal open</p>
        <button class="terminal-create-button" on:click={handleNewTerminal}>
          Create Terminal
        </button>
      </div>
    {/if}
  </div>
</div>

<style>
  .terminal-panel {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    background-color: var(--color-background);
  }

  .terminal-header {
    display: flex;
    align-items: center;
    height: 36px;
    background-color: var(--color-surface-secondary);
    border-bottom: 1px solid var(--color-border);
  }

  .terminal-tabs {
    display: flex;
    flex: 1;
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: none;
  }

  .terminal-tabs::-webkit-scrollbar {
    display: none;
  }

  .terminal-tab {
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
  }

  .terminal-tab:active {
    cursor: grabbing;
  }

  .terminal-tab:hover {
    background-color: var(--color-surface-hover);
  }

  .terminal-tab.active {
    background-color: var(--color-background);
    border-bottom: 2px solid var(--color-accent);
  }

  .terminal-tab-title {
    font-size: var(--font-size-sm);
    color: var(--color-text-primary);
    white-space: nowrap;
  }

  .terminal-tab:not(.active) .terminal-tab-title {
    color: var(--color-text-secondary);
  }

  .terminal-tab-close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border-radius: var(--radius-sm);
    opacity: 0;
    transition: all var(--transition-fast);
    color: var(--color-text-tertiary);
  }

  .terminal-tab:hover .terminal-tab-close,
  .terminal-tab.active .terminal-tab-close {
    opacity: 1;
  }

  .terminal-tab-close:hover {
    background-color: var(--color-surface-hover);
    color: var(--color-text-primary);
  }

  .terminal-tab-close svg {
    width: 12px;
    height: 12px;
  }

  .terminal-actions {
    display: flex;
    align-items: center;
    padding: 0 var(--spacing-xs);
    border-left: 1px solid var(--color-border);
  }

  .terminal-action-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border-radius: var(--radius-sm);
    color: var(--color-text-tertiary);
    transition: all var(--transition-fast);
  }

  .terminal-action-button:hover {
    background-color: var(--color-surface-hover);
    color: var(--color-text-primary);
  }

  .terminal-action-button svg {
    width: 14px;
    height: 14px;
  }

  .terminal-content {
    flex: 1;
    overflow: hidden;
    position: relative;
  }

  .terminal-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: var(--spacing-md);
    color: var(--color-text-tertiary);
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
  }

  .terminal-empty svg {
    width: 48px;
    height: 48px;
  }

  .terminal-empty p {
    font-size: var(--font-size-base);
  }

  .terminal-create-button {
    padding: var(--spacing-sm) var(--spacing-md);
    background-color: var(--color-accent);
    color: white;
    border-radius: var(--radius-sm);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    transition: all var(--transition-fast);
  }

  .terminal-create-button:hover {
    background-color: var(--color-accent-hover);
  }
</style>

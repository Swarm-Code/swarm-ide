<script>
  import { editorStore } from '../stores/editorStore.js';
  import { terminalStore } from '../stores/terminalStore.js';
  import { workspaceStore, activeWorkspacePath } from '../stores/workspaceStore.js';
  import Terminal from './Terminal.svelte';

  export let pane;
  export let isActive = false;

  let currentWorkspacePath = null;
  let allTerminals = [];
  let workspaces = [];

  activeWorkspacePath.subscribe((path) => {
    currentWorkspacePath = path;
  });

  terminalStore.subscribe((state) => {
    allTerminals = state.terminals;
  });

  workspaceStore.subscribe((state) => {
    workspaces = state.workspaces;
  });

  // Get terminal objects for this pane
  $: paneTerminals = pane.terminalIds
    .map(id => allTerminals.find(t => t.id === id))
    .filter(Boolean);

  function handlePaneClick() {
    editorStore.setActivePane(pane.id);
  }

  function handleSelectTerminal(terminalId) {
    editorStore.setActiveTerminalInPane(pane.id, terminalId);
  }

  function handleCloseTerminal(terminalId) {
    // Remove from pane and kill the terminal completely
    editorStore.closeTerminalTab(pane.id, terminalId);
    terminalStore.removeTerminal(terminalId);
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
    
    // Add terminal to this pane
    editorStore.addTerminal(terminalId);
  }

  // Check if a terminal should be visible
  function isTerminalVisible(terminalId) {
    // Show only if it's in this pane's terminalIds AND it's the active terminal in this pane
    const isInPane = pane.terminalIds.includes(terminalId);
    const isActive = terminalId === pane.activeTerminalId;
    const visible = isInPane && isActive;
    console.log(`[TerminalPane ${pane.id}] isVisible(${terminalId}): inPane=${isInPane}, isActive=${isActive}, visible=${visible}`);
    return visible;
  }
</script>

<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
<div
  class="terminal-pane"
  class:active={isActive}
  data-pane-id={pane.id}
  on:click={handlePaneClick}
  on:dragover={handleDragOver}
  on:drop={handleDrop}
  role="region"
  aria-label="Terminal pane"
>
  <div class="terminal-header">
    <div class="terminal-tabs">
      {#each paneTerminals as terminal (terminal.id)}
        <button
          class="terminal-tab"
          class:active={terminal.id === pane.activeTerminalId}
          draggable="true"
          on:dragstart={(e) => handleDragStart(e, terminal.id)}
          on:click={() => handleSelectTerminal(terminal.id)}
        >
          <span class="terminal-tab-icon">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="1.5"
                d="M2 4l4 4-4 4m6 0h6"
              />
            </svg>
          </span>
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
  </div>

  <div class="terminal-content" data-terminal-location="canvas-pane" data-pane-id={pane.id} data-active-terminal={pane.activeTerminalId}>
    <!-- Terminals render globally in IDEWindow, this is just the display area -->
  </div>
</div>

<style>
  .terminal-pane {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    background-color: var(--color-background);
    border: 2px solid transparent;
    transition: border-color var(--transition-fast);
  }

  .terminal-pane.active {
    border-color: var(--color-accent);
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

  .terminal-tab-icon svg {
    width: 14px;
    height: 14px;
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

  .terminal-content {
    flex: 1;
    overflow: hidden;
    position: relative;
  }
</style>

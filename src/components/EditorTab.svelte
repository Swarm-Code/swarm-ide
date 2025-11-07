<script>
  import { createEventDispatcher } from 'svelte';

  export let tab;
  export let isActive = false;
  export let paneId;

  const dispatch = createEventDispatcher();

  let isDragging = false;

  function handleClick() {
    dispatch('select', { tabId: tab.id });
  }

  function handleClose(event) {
    event.stopPropagation();
    dispatch('close', { tabId: tab.id });
  }

  function handleDragStart(event) {
    isDragging = true;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('application/x-editor-tab', JSON.stringify({
      tabId: tab.id,
      paneId,
    }));
  }

  function handleDragEnd() {
    isDragging = false;
  }
</script>

<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div
  class="editor-tab"
  class:active={isActive}
  class:dragging={isDragging}
  draggable="true"
  on:click={handleClick}
  on:dragstart={handleDragStart}
  on:dragend={handleDragEnd}
  role="tab"
  aria-selected={isActive}
  tabindex="0"
>
  <div class="tab-content">
    <span class="tab-name">
      {tab.name}
    </span>
    {#if tab.isDirty}
      <span class="dirty-indicator" title="Unsaved changes">●</span>
    {/if}
  </div>
  <button
    class="tab-close"
    on:click={handleClose}
    aria-label="Close {tab.name}"
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
</div>

<style>
  .editor-tab {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
    padding: 0 var(--spacing-md);
    height: 36px;
    background-color: transparent;
    border-right: 1px solid var(--color-border);
    cursor: pointer;
    transition: all var(--transition-fast);
    user-select: none;
    position: relative;
  }

  .editor-tab:hover {
    background-color: var(--color-surface-hover);
  }

  .editor-tab.active {
    background-color: var(--color-background);
    border-bottom: 2px solid var(--color-accent);
  }

  .editor-tab.dragging {
    opacity: 0.5;
  }

  .tab-content {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
    flex: 1;
    min-width: 0;
  }

  .tab-name {
    font-size: var(--font-size-sm);
    color: var(--color-text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .editor-tab:not(.active) .tab-name {
    color: var(--color-text-secondary);
  }

  .dirty-indicator {
    font-size: 10px;
    color: var(--color-accent);
    line-height: 1;
  }

  .tab-close {
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

  .editor-tab:hover .tab-close {
    opacity: 1;
  }

  .tab-close:hover {
    background-color: var(--color-surface-hover);
    color: var(--color-text-primary);
  }

  .tab-close svg {
    width: 12px;
    height: 12px;
  }

  .editor-tab.active .tab-close {
    opacity: 1;
  }
</style>

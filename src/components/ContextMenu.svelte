<script>
  import { createEventDispatcher } from 'svelte';

  export let x = 0;
  export let y = 0;
  export let visible = false;
  export let items = [];

  const dispatch = createEventDispatcher();

  function handleItemClick(item) {
    if (item.action) {
      item.action();
    }
    dispatch('close');
  }

  function handleClickOutside(event) {
    if (visible && !event.target.closest('.context-menu')) {
      dispatch('close');
    }
  }
</script>

<svelte:window on:click={handleClickOutside} on:contextmenu={handleClickOutside} />

{#if visible}
  <div class="context-menu" style="left: {x}px; top: {y}px">
    {#each items as item}
      {#if item.separator}
        <div class="separator"></div>
      {:else}
        <button
          class="menu-item"
          class:danger={item.danger}
          on:click={() => handleItemClick(item)}
          disabled={item.disabled}
        >
          {#if item.icon}
            <span class="menu-icon">
              {@html item.icon}
            </span>
          {/if}
          <span class="menu-label">{item.label}</span>
        </button>
      {/if}
    {/each}
  </div>
{/if}

<style>
  .context-menu {
    position: fixed;
    background-color: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-xl);
    padding: var(--spacing-xs);
    min-width: 200px;
    z-index: 10000;
  }

  .menu-item {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    width: 100%;
    padding: var(--spacing-xs) var(--spacing-sm);
    background-color: transparent;
    color: var(--color-text-primary);
    font-size: var(--font-size-sm);
    border-radius: var(--radius-sm);
    transition: all var(--transition-fast);
    text-align: left;
  }

  .menu-item:hover:not(:disabled) {
    background-color: var(--color-surface-hover);
  }

  .menu-item:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .menu-item.danger {
    color: #FF3B30;
  }

  .menu-item.danger:hover:not(:disabled) {
    background-color: rgba(255, 59, 48, 0.1);
  }

  .menu-icon {
    width: 16px;
    height: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .menu-icon :global(svg) {
    width: 16px;
    height: 16px;
    stroke: currentColor;
  }

  .menu-label {
    flex: 1;
  }

  .separator {
    height: 1px;
    background-color: var(--color-border);
    margin: var(--spacing-xs) 0;
  }
</style>

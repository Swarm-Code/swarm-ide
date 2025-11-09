<script>
  import { createEventDispatcher, onMount } from 'svelte';

  export let x = 0;
  export let y = 0;
  export let visible = false;
  export let items = [];

  const dispatch = createEventDispatcher();
  let menuId = Math.random().toString(36);
  let isAnimating = false;
  let isClosing = false;
  let autoCloseTimeout = null;

  // Track currently open context menu globally
  if (typeof window !== 'undefined') {
    if (!window.__activeContextMenu) {
      window.__activeContextMenu = null;
    }
  }

  $: if (visible) {
    // Close any other open context menu
    if (window.__activeContextMenu && window.__activeContextMenu !== menuId) {
      window.dispatchEvent(new CustomEvent('close-context-menu', { 
        detail: { except: menuId } 
      }));
    }
    window.__activeContextMenu = menuId;
    isAnimating = true;
    isClosing = false;
    
    // Auto-close after 8 seconds
    clearTimeout(autoCloseTimeout);
    autoCloseTimeout = setTimeout(() => {
      closeWithAnimation();
    }, 8000);
  } else {
    if (window.__activeContextMenu === menuId) {
      window.__activeContextMenu = null;
    }
    clearTimeout(autoCloseTimeout);
  }

  function closeWithAnimation() {
    isClosing = true;
    setTimeout(() => {
      dispatch('close');
    }, 200); // Match animation duration
  }

  function handleItemClick(item) {
    if (item.action) {
      item.action();
    }
    closeWithAnimation();
  }

  function handleClickOutside(event) {
    if (visible && !event.target.closest('.context-menu')) {
      closeWithAnimation();
    }
  }

  function handleGlobalClose(event) {
    if (event.detail.except !== menuId) {
      closeWithAnimation();
    }
  }

  onMount(() => {
    window.addEventListener('close-context-menu', handleGlobalClose);
    return () => {
      window.removeEventListener('close-context-menu', handleGlobalClose);
      clearTimeout(autoCloseTimeout);
      if (window.__activeContextMenu === menuId) {
        window.__activeContextMenu = null;
      }
    };
  });
</script>

<svelte:window on:click={handleClickOutside} on:contextmenu={handleClickOutside} />

{#if visible}
  <div class="context-menu" class:closing={isClosing} style="left: {x}px; top: {y}px">
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
    opacity: 0;
    transform: scale(0.92) translateY(-8px);
    animation: contextMenuFadeIn 0.2s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
  }

  .context-menu.closing {
    animation: contextMenuFadeOut 0.2s cubic-bezier(0.4, 0, 1, 1) forwards;
  }

  @keyframes contextMenuFadeIn {
    to {
      opacity: 1;
      transform: scale(1) translateY(0);
    }
  }

  @keyframes contextMenuFadeOut {
    from {
      opacity: 1;
      transform: scale(1) translateY(0);
    }
    to {
      opacity: 0;
      transform: scale(0.92) translateY(-8px);
    }
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

<script>
  import { createEventDispatcher } from 'svelte';
  import { canvasStore, activeCanvas } from '../stores/canvasStore.js';
  
  const dispatch = createEventDispatcher();
  
  let currentCanvas = null;
  
  activeCanvas.subscribe((canvas) => {
    currentCanvas = canvas;
  });
  
  $: isBrowserMode = currentCanvas?.type === 'browser';
  
  function switchToEditor() {
    // Find first editor canvas or create one
    canvasStore.subscribe((state) => {
      const editorCanvas = state.canvases.find(c => c.type === 'editor');
      if (editorCanvas) {
        canvasStore.setActiveCanvas(editorCanvas.id);
      }
    })();
  }
  
  function switchToBrowser() {
    canvasStore.getOrCreateBrowserCanvas();
  }
</script>

<div class="mode-switcher">
  <div class="mode-buttons">
    <button 
      class="mode-button"
      class:active={!isBrowserMode}
      on:click={switchToEditor}
      title="Editor Mode"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
      </svg>
      <span>Editor</span>
    </button>
    
    <button 
      class="mode-button"
      class:active={isBrowserMode}
      on:click={switchToBrowser}
      title="Browser Mode"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/>
        <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
      </svg>
      <span>Browser</span>
    </button>
  </div>
</div>

<style>
  .mode-switcher {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .mode-buttons {
    display: flex;
    gap: 2px;
    background-color: var(--color-surface-hover);
    padding: 2px;
    border-radius: 6px;
  }

  .mode-button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-xs);
    padding: 4px 12px;
    background-color: transparent;
    border: none;
    border-radius: 4px;
    color: var(--color-text-secondary);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all var(--transition-fast);
    white-space: nowrap;
    user-select: none;
  }

  .mode-button:hover {
    color: var(--color-text-primary);
    background-color: var(--color-surface);
  }

  .mode-button.active {
    background-color: var(--color-accent);
    color: white;
  }

  .mode-button svg {
    width: 14px;
    height: 14px;
  }

  .mode-button span {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }
</style>

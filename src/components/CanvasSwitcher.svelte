<script>
  import { canvasStore, activeCanvas } from '../stores/canvasStore.js';

  let canvases = [];
  let activeCanvasId = null;
  let editingCanvasId = null;
  let editingName = '';
  let colorPickerCanvasId = null;

  canvasStore.subscribe((state) => {
    canvases = state.canvases;
    activeCanvasId = state.activeCanvasId;
  });

  function handleCanvasSwitch(canvasId) {
    canvasStore.setActiveCanvas(canvasId);
  }

  function handleAddCanvas() {
    const colors = ['#0071e3', '#34c759', '#ff9500', '#ff3b30', '#af52de', '#5ac8fa'];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];
    canvasStore.addCanvas(`Canvas ${canvases.length + 1}`, randomColor);
  }

  function handleRemoveCanvas(canvasId, event) {
    event.stopPropagation();
    if (canvases.length > 1) {
      canvasStore.removeCanvas(canvasId);
    }
  }

  function startEditing(canvas, event) {
    event.stopPropagation();
    editingCanvasId = canvas.id;
    editingName = canvas.name;
    colorPickerCanvasId = null;
  }

  function finishEditing() {
    if (editingCanvasId && editingName.trim()) {
      canvasStore.renameCanvas(editingCanvasId, editingName.trim());
    }
    editingCanvasId = null;
    editingName = '';
  }

  function handleKeydown(event) {
    if (event.key === 'Enter') {
      finishEditing();
    } else if (event.key === 'Escape') {
      editingCanvasId = null;
      editingName = '';
    }
  }

  function toggleColorPicker(canvasId, event) {
    event.stopPropagation();
    if (colorPickerCanvasId === canvasId) {
      colorPickerCanvasId = null;
    } else {
      colorPickerCanvasId = canvasId;
      editingCanvasId = null;
    }
  }

  function selectColor(canvasId, color, event) {
    event.stopPropagation();
    canvasStore.updateCanvasColor(canvasId, color);
    colorPickerCanvasId = null;
  }

  const colorPalette = [
    '#0071e3', '#34c759', '#ff9500', '#ff3b30', '#af52de', '#5ac8fa',
    '#64d2ff', '#ffd60a', '#ff375f', '#bf5af2', '#30d158', '#0a84ff'
  ];

  function handleClickOutside(event) {
    if (!event.target.closest('.canvas-tabs')) {
      colorPickerCanvasId = null;
      if (editingCanvasId) {
        finishEditing();
      }
    }
  }
</script>

<svelte:window on:click={handleClickOutside} />

<div class="canvas-tabs">
  {#each canvases as canvas (canvas.id)}
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <div 
      class="canvas-tab" 
      class:active={canvas.id === activeCanvasId}
      role="button"
      tabindex="0"
      on:click={() => handleCanvasSwitch(canvas.id)}
      on:dblclick={(e) => startEditing(canvas, e)}
      on:keydown={(e) => { if (e.key === 'Enter') handleCanvasSwitch(canvas.id); }}
    >
      <button 
        class="canvas-color-btn" 
        style="background-color: {canvas.color}"
        on:click={(e) => toggleColorPicker(canvas.id, e)}
        title="Change color"
      ></button>
      
      {#if colorPickerCanvasId === canvas.id}
        <div class="color-picker-popup">
          {#each colorPalette as color}
            <button
              class="color-option"
              style="background-color: {color}"
              on:click={(e) => selectColor(canvas.id, color, e)}
              title={color}
            ></button>
          {/each}
        </div>
      {/if}
      
      {#if editingCanvasId === canvas.id}
        <input
          type="text"
          class="canvas-name-input"
          bind:value={editingName}
          on:keydown={handleKeydown}
          on:blur={finishEditing}
          on:click={(e) => e.stopPropagation()}
        />
      {:else}
        <span class="canvas-tab-name">{canvas.name}</span>
      {/if}
      
      {#if canvases.length > 1}
        <button 
          class="canvas-close-btn" 
          on:click={(e) => handleRemoveCanvas(canvas.id, e)}
          title="Close canvas"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      {/if}
    </div>
  {/each}
  
  <button class="canvas-add-btn" on:click={handleAddCanvas} title="New canvas">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
    </svg>
  </button>
</div>

<style>
  .canvas-tabs {
    display: flex;
    align-items: center;
    gap: 4px;
    height: 100%;
  }

  .canvas-tab {
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    padding: var(--spacing-xs) var(--spacing-md);
    background-color: var(--color-surface-hover);
    border: 1px solid transparent;
    border-radius: var(--radius-md) var(--radius-md) 0 0;
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    cursor: pointer;
    transition: all var(--transition-fast);
    min-width: 140px;
    max-width: 220px;
    user-select: none;
    height: 32px;
  }

  .canvas-tab:hover {
    background-color: var(--color-surface-secondary);
    border-color: var(--color-border);
  }

  .canvas-tab.active {
    background-color: var(--color-surface);
    color: var(--color-text-primary);
    border: 1px solid var(--color-border);
    border-bottom-color: transparent;
    box-shadow: var(--shadow-sm);
    z-index: 2;
    height: 34px;
    margin-bottom: -1px;
  }

  .canvas-color-btn {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    border: 2px solid rgba(255, 255, 255, 0.25);
    cursor: pointer;
    transition: all var(--transition-fast);
    flex-shrink: 0;
  }

  .canvas-color-btn:hover {
    border-color: rgba(255, 255, 255, 0.5);
    transform: scale(1.15);
    box-shadow: 0 0 8px rgba(0, 0, 0, 0.2);
  }

  .canvas-tab.active .canvas-color-btn {
    border-color: rgba(0, 0, 0, 0.15);
  }

  .color-picker-popup {
    position: absolute;
    top: calc(100% + 8px);
    left: 0;
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: var(--spacing-sm);
    padding: var(--spacing-md);
    background-color: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
    z-index: var(--z-popover);
    animation: colorPickerFadeIn 150ms ease-out;
    backdrop-filter: blur(10px);
  }

  @keyframes colorPickerFadeIn {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .color-option {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    border: 2px solid var(--color-border);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .color-option:hover {
    border-color: var(--color-text-primary);
    transform: scale(1.15);
    box-shadow: var(--shadow-md);
  }

  .canvas-tab-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .canvas-name-input {
    flex: 1;
    padding: 2px var(--spacing-xs);
    background-color: var(--color-surface-secondary);
    border: 1px solid var(--color-accent);
    border-radius: var(--radius-sm);
    color: var(--color-text-primary);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    outline: none;
    transition: all var(--transition-fast);
  }

  .canvas-name-input:focus {
    background-color: var(--color-surface);
    box-shadow: 0 0 0 3px rgba(0, 113, 227, 0.15);
  }

  .canvas-close-btn {
    width: 20px;
    height: 20px;
    padding: 3px;
    background: transparent;
    border: none;
    border-radius: var(--radius-sm);
    color: var(--color-text-secondary);
    cursor: pointer;
    opacity: 0;
    transition: all var(--transition-fast);
    flex-shrink: 0;
  }

  .canvas-tab:hover .canvas-close-btn {
    opacity: 1;
  }

  .canvas-close-btn:hover {
    background-color: rgba(255, 59, 48, 0.15);
    color: var(--color-error);
  }

  .canvas-close-btn svg {
    width: 100%;
    height: 100%;
    stroke-width: 2.5;
  }

  .canvas-add-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    background-color: transparent;
    border: 1px solid transparent;
    border-radius: var(--radius-md);
    color: var(--color-text-secondary);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .canvas-add-btn:hover {
    background-color: var(--color-surface-hover);
    border-color: var(--color-border);
    color: var(--color-accent);
  }

  .canvas-add-btn svg {
    width: 16px;
    height: 16px;
    stroke-width: 2.5;
  }
</style>

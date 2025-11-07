<script>
  import { editorStore } from '../stores/editorStore.js';
  import UnifiedPane from './UnifiedPane.svelte';
  import TerminalPane from './TerminalPane.svelte';

  export let layout;
  export let activePaneId;

  let splitContainer;
  let isResizing = false;
  let splitRatio = layout.splitRatio || 0.5;

  function handleMouseDown(event) {
    event.preventDefault();
    isResizing = true;
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }

  function handleMouseMove(event) {
    if (!isResizing || !splitContainer) return;

    const rect = splitContainer.getBoundingClientRect();
    let ratio;

    if (layout.direction === 'horizontal') {
      const relativeY = event.clientY - rect.top;
      ratio = relativeY / rect.height;
    } else {
      const relativeX = event.clientX - rect.left;
      ratio = relativeX / rect.width;
    }

    // Clamp ratio between 0.1 and 0.9
    splitRatio = Math.max(0.1, Math.min(0.9, ratio));
    editorStore.updateSplitRatio(layout, splitRatio);
  }

  function handleMouseUp() {
    isResizing = false;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  }

  function renderLayout(node) {
    if (node.type === 'pane') {
      // Choose component based on pane type
      let component = node.paneType === 'terminal' ? TerminalPane : UnifiedPane;
      
      return {
        type: 'pane',
        component,
        props: { pane: node, isActive: node.id === activePaneId },
      };
    }

    return {
      type: 'split',
      direction: node.direction,
      left: renderLayout(node.left),
      right: renderLayout(node.right),
    };
  }

  $: renderedLayout = renderLayout(layout);
</script>

{#if renderedLayout.type === 'pane'}
  <svelte:component
    this={renderedLayout.component}
    {...renderedLayout.props}
  />
{:else}
  <div
    class="split-container"
    class:horizontal={renderedLayout.direction === 'horizontal'}
    class:vertical={renderedLayout.direction === 'vertical'}
    class:resizing={isResizing}
    bind:this={splitContainer}
  >
    <div
      class="split-pane left"
      style={renderedLayout.direction === 'horizontal'
        ? `height: ${splitRatio * 100}%`
        : `width: ${splitRatio * 100}%`}
    >
      <svelte:self layout={layout.left} {activePaneId} />
    </div>

    <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
    <!-- svelte-ignore a11y-no-noninteractive-tabindex -->
    <div
      class="split-divider"
      class:horizontal={renderedLayout.direction === 'horizontal'}
      class:vertical={renderedLayout.direction === 'vertical'}
      on:mousedown={handleMouseDown}
      on:keydown={(e) => {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault();
          const step = 0.05;
          if (layout.direction === 'horizontal') {
            if (e.key === 'ArrowUp') splitRatio = Math.max(0.1, splitRatio - step);
            if (e.key === 'ArrowDown') splitRatio = Math.min(0.9, splitRatio + step);
          } else {
            if (e.key === 'ArrowLeft') splitRatio = Math.max(0.1, splitRatio - step);
            if (e.key === 'ArrowRight') splitRatio = Math.min(0.9, splitRatio + step);
          }
          editorStore.updateSplitRatio(layout, splitRatio);
        }
      }}
      role="separator"
      aria-orientation={renderedLayout.direction === 'horizontal' ? 'horizontal' : 'vertical'}
      aria-valuenow={Math.round(splitRatio * 100)}
      aria-valuemin="10"
      aria-valuemax="90"
      aria-label="Resize split panes"
      tabindex="0"
    >
      <span class="divider-handle">
        <span class="divider-grip"></span>
      </span>
    </div>

    <div class="split-pane right">
      <svelte:self layout={layout.right} {activePaneId} />
    </div>
  </div>
{/if}

<style>
  .split-container {
    display: flex;
    width: 100%;
    height: 100%;
    position: relative;
  }

  .split-container.horizontal {
    flex-direction: column;
  }

  .split-container.vertical {
    flex-direction: row;
  }

  .split-pane {
    overflow: hidden;
    position: relative;
  }

  .split-pane.left {
    flex-shrink: 0;
  }

  .split-pane.right {
    flex: 1;
    min-width: 0;
    min-height: 0;
  }

  .split-divider {
    background-color: var(--color-border);
    position: relative;
    flex-shrink: 0;
    z-index: var(--z-base);
  }

  .split-divider.horizontal {
    width: 100%;
    height: 4px;
    cursor: row-resize;
  }

  .split-divider.vertical {
    width: 4px;
    height: 100%;
    cursor: col-resize;
  }

  .split-divider:hover,
  .split-container.resizing .split-divider {
    background-color: var(--color-accent);
  }

  .divider-handle {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .horizontal .divider-handle {
    width: 40px;
    height: 100%;
  }

  .vertical .divider-handle {
    width: 100%;
    height: 40px;
  }

  .divider-grip {
    background-color: var(--color-text-tertiary);
    border-radius: var(--radius-full);
    opacity: 0;
    transition: opacity var(--transition-fast);
  }

  .horizontal .divider-grip {
    width: 20px;
    height: 2px;
  }

  .vertical .divider-grip {
    width: 2px;
    height: 20px;
  }

  .split-divider:hover .divider-grip,
  .split-container.resizing .divider-grip {
    opacity: 1;
    background-color: var(--color-background);
  }
</style>

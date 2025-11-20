<script>
  import { editorStore } from '../stores/editorStore.js';
  import { fileExplorerStore } from '../stores/fileExplorerStore.js';
  import { canvasStore, activeCanvas } from '../stores/canvasStore.js';
  import { activeWorkspacePath } from '../stores/workspaceStore.js';
  import EditorSplitView from './EditorSplitView.svelte';
  import MindCanvas from './MindCanvas.svelte';
  import GitCanvas from './GitCanvas.svelte';
  import BrowserCanvas from './BrowserCanvas.svelte';

  let layout = null;
  let activePaneId = null;
  let currentCanvas = null;
  let workspacePath = null;

  editorStore.subscribe((state) => {
    layout = state.layout;
    activePaneId = state.activePaneId;
  });

  activeCanvas.subscribe((canvas) => {
    currentCanvas = canvas;
  });

  activeWorkspacePath.subscribe((path) => {
    workspacePath = path;
  });

  // Listen for file selection in explorer
  fileExplorerStore.subscribe((state) => {
    if (state.selectedFile && !state.selectedFile.isDirectory) {
      console.log('[EditorCanvas] File selected:', {
        path: state.selectedFile.path,
        name: state.selectedFile.name
      });
      console.log('[EditorCanvas] Calling editorStore.openFile...');
      
      // Open file in active pane
      editorStore.openFile(state.selectedFile.path, state.selectedFile.name);
      
      console.log('[EditorCanvas] editorStore.openFile returned');
    }
  });
</script>

<div class="editor-canvas">
  {#if currentCanvas?.type === 'git'}
    <!-- Git canvas shows full git interface -->
    <GitCanvas />
  {:else if currentCanvas?.type === 'mind'}
    <!-- Mind canvas shows TipTap editor for notes -->
    <MindCanvas />
  {:else if currentCanvas?.type === 'browser'}
    <!-- Browser canvas shows full browser experience -->
    <BrowserCanvas />
  {:else if layout}
    <!-- Regular editor canvas shows split view -->
    <EditorSplitView {layout} {activePaneId} />
  {:else}
    <div class="empty-editor">
      <div class="empty-content">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
          />
        </svg>
        <h2>Welcome to SwarmIDE</h2>
        <p>Select a file from the explorer to start editing</p>
      </div>
    </div>
  {/if}
</div>

<style>
  .editor-canvas {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    background-color: var(--color-background);
    overflow: hidden;
  }

  .empty-editor {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .empty-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--spacing-md);
    padding: var(--spacing-3xl);
    text-align: center;
  }

  .empty-content svg {
    width: 64px;
    height: 64px;
    color: var(--color-text-tertiary);
  }

  .empty-content h2 {
    font-size: var(--font-size-2xl);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-primary);
  }

  .empty-content p {
    font-size: var(--font-size-base);
    color: var(--color-text-secondary);
  }
</style>

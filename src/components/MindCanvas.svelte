<script>
  import { onMount } from 'svelte';
  import { editorStore } from '../stores/editorStore.js';
  import { activeWorkspacePath } from '../stores/workspaceStore.js';
  import TipTapEditor from './TipTapEditor.svelte';

  let activeTab = null;
  let currentWorkspacePath = null;
  let editorState = null;

  editorStore.subscribe((state) => {
    editorState = state;
    if (state.layout) {
      const activePane = findActivePane(state.layout);
      if (activePane) {
        activeTab = activePane.tabs.find(t => t.id === activePane.activeTabId);
      }
    }
  });

  activeWorkspacePath.subscribe((path) => {
    currentWorkspacePath = path;
  });

  function findActivePane(layout) {
    if (!layout) return null;
    if (layout.type === 'pane') {
      if (layout.id === editorState.activePaneId) {
        return layout;
      }
    }
    if (layout.type === 'split') {
      const leftFound = findActivePane(layout.left);
      if (leftFound) return leftFound;
      const rightFound = findActivePane(layout.right);
      if (rightFound) return rightFound;
    }
    return null;
  }

  $: isMindTab = activeTab?.type === 'mind';
  $: mindFilePath = activeTab?.type === 'mind' ? activeTab.filePath : null;
  $: mindContent = activeTab?.type === 'mind' ? activeTab.content : '';

  $: {
    console.log('[MindCanvas] State:', {
      hasActiveTab: !!activeTab,
      tabType: activeTab?.type,
      tabName: activeTab?.name,
      contentLength: mindContent?.length
    });
  }

  async function handleContentChange(html) {
    if (!activeTab || activeTab.type !== 'mind') return;
    
    console.log('[MindCanvas] Content changed for:', activeTab.name);
    
    // Update tab content in store
    editorStore.updateTabContent(activeTab.id, html);
  }
</script>

<div class="mind-canvas">
  {#if isMindTab}
    <TipTapEditor 
      content={mindContent}
      filePath={mindFilePath}
      onContentChange={handleContentChange}
    />
  {:else}
    <div class="empty-state">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
        />
      </svg>
      <h3>No note open</h3>
      <p>Select a note from the sidebar to start editing</p>
    </div>
  {/if}
</div>

<style>
  .mind-canvas {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    background-color: var(--color-background);
    overflow: hidden;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: var(--spacing-md);
    color: var(--color-text-tertiary);
  }

  .empty-state svg {
    width: 64px;
    height: 64px;
    opacity: 0.4;
  }

  .empty-state h3 {
    font-size: var(--font-size-xl);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-secondary);
    margin: 0;
  }

  .empty-state p {
    font-size: var(--font-size-base);
    margin: 0;
  }
</style>

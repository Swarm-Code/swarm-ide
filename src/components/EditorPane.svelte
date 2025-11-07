<script>
  import { editorStore } from '../stores/editorStore.js';
  import EditorTab from './EditorTab.svelte';
  import MonacoEditor from './MonacoEditor.svelte';

  export let pane;
  export let isActive = false;

  let dragOverIndex = null;

  function handleTabSelect(event) {
    editorStore.setActiveTab(pane.id, event.detail.tabId);
  }

  function handleTabClose(event) {
    editorStore.closeTab(pane.id, event.detail.tabId);
  }

  function handleSplitHorizontal() {
    editorStore.splitPane(pane.id, 'horizontal');
  }

  function handleSplitVertical() {
    editorStore.splitPane(pane.id, 'vertical');
  }

  function handleClosePane() {
    editorStore.closePane(pane.id);
  }

  function handlePaneClick() {
    editorStore.setActivePane(pane.id);
  }

  function handleDragOver(event, index) {
    event.preventDefault();
    dragOverIndex = index;
  }

  function handleDragLeave() {
    dragOverIndex = null;
  }

  function handleDrop(event, toIndex) {
    event.preventDefault();
    dragOverIndex = null;

    // Check for editor tab
    const editorData = event.dataTransfer.getData('application/x-editor-tab');
    if (editorData) {
      const { tabId, paneId: fromPaneId } = JSON.parse(editorData);

      if (fromPaneId === pane.id) {
        // Reorder within same pane
        const fromIndex = pane.tabs.findIndex((t) => t.id === tabId);
        if (fromIndex !== -1 && fromIndex !== toIndex) {
          editorStore.reorderTabs(pane.id, fromIndex, toIndex);
        }
      } else {
        // Move from different pane
        editorStore.moveTab(fromPaneId, pane.id, tabId, toIndex);
      }
      return;
    }

    // Check for terminal tab
    const terminalData = event.dataTransfer.getData('application/x-terminal-tab');
    if (terminalData) {
      const { terminalId } = JSON.parse(terminalData);
      // Add terminal to editor canvas (will split or convert pane)
      editorStore.addTerminal(terminalId);
    }
  }

  function handleTabBarDrop(event) {
    event.preventDefault();
    dragOverIndex = null;

    // Check for editor tab
    const editorData = event.dataTransfer.getData('application/x-editor-tab');
    if (editorData) {
      const { tabId, paneId: fromPaneId } = JSON.parse(editorData);

      if (fromPaneId !== pane.id) {
        // Move to end of this pane
        editorStore.moveTab(fromPaneId, pane.id, tabId);
      }
      return;
    }

    // Check for terminal tab
    const terminalData = event.dataTransfer.getData('application/x-terminal-tab');
    if (terminalData) {
      const { terminalId } = JSON.parse(terminalData);
      // Add terminal to editor canvas (will split or convert pane)
      editorStore.addTerminal(terminalId);
    }
  }

  $: activeTab = pane.tabs.find((t) => t.id === pane.activeTabId);

  // Get language from file extension
  function getLanguageFromFilename(filename) {
    const ext = filename?.split('.').pop()?.toLowerCase() || '';
    const languageMap = {
      js: 'javascript',
      jsx: 'javascript',
      ts: 'typescript',
      tsx: 'typescript',
      json: 'json',
      html: 'html',
      css: 'css',
      scss: 'scss',
      md: 'markdown',
      py: 'python',
      rb: 'ruby',
      php: 'php',
      java: 'java',
      cpp: 'cpp',
      c: 'c',
      cs: 'csharp',
      go: 'go',
      rs: 'rust',
      sh: 'shell',
      bash: 'shell',
      yaml: 'yaml',
      yml: 'yaml',
      xml: 'xml',
      sql: 'sql',
      cjs: 'javascript',
      mjs: 'javascript',
      svelte: 'html',
    };
    return languageMap[ext] || 'plaintext';
  }

  function handleEditorChange(newContent) {
    if (activeTab) {
      editorStore.setTabDirty(pane.id, activeTab.id, true);
      // TODO: Update tab content in store
    }
  }
</script>

<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div
  class="editor-pane"
  class:active={isActive}
  on:click={handlePaneClick}
  role="tabpanel"
  tabindex="-1"
>
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="tab-bar" on:dragover={(e) => e.preventDefault()} on:drop={handleTabBarDrop} role="toolbar" tabindex="-1">
    <div class="tab-list" role="tablist">
      {#each pane.tabs as tab, index (tab.id)}
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <div
          class="tab-wrapper"
          class:drag-over={dragOverIndex === index}
          on:dragover={(e) => handleDragOver(e, index)}
          on:dragleave={handleDragLeave}
          on:drop={(e) => handleDrop(e, index)}
          role="presentation"
        >
          <EditorTab
            {tab}
            paneId={pane.id}
            isActive={tab.id === pane.activeTabId}
            on:select={handleTabSelect}
            on:close={handleTabClose}
          />
        </div>
      {/each}
    </div>
    <div class="tab-actions">
      <button
        class="action-button"
        on:click={handleSplitHorizontal}
        title="Split horizontally"
      >
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor">
          <rect x="2" y="2" width="12" height="12" stroke-width="1.5" />
          <line x1="2" y1="8" x2="14" y2="8" stroke-width="1.5" />
        </svg>
      </button>
      <button
        class="action-button"
        on:click={handleSplitVertical}
        title="Split vertically"
      >
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor">
          <rect x="2" y="2" width="12" height="12" stroke-width="1.5" />
          <line x1="8" y1="2" x2="8" y2="14" stroke-width="1.5" />
        </svg>
      </button>
      <button
        class="action-button"
        on:click={handleClosePane}
        title="Close pane"
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
  </div>

  <div class="editor-content">
    {#if activeTab}
      {#key activeTab.id}
        <MonacoEditor
          content={activeTab.content || ''}
          language={getLanguageFromFilename(activeTab.name)}
          onChange={handleEditorChange}
          readOnly={false}
        />
      {/key}
    {:else}
      <div class="empty-pane">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
        <p>No file open</p>
      </div>
    {/if}
  </div>
</div>

<style>
  .editor-pane {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    background-color: var(--color-background);
    border: 2px solid transparent;
    transition: border-color var(--transition-fast);
  }

  .editor-pane.active {
    border-color: var(--color-accent);
  }

  .tab-bar {
    display: flex;
    align-items: center;
    height: 36px;
    background-color: var(--color-surface-secondary);
    border-bottom: 1px solid var(--color-border);
  }

  .tab-list {
    display: flex;
    flex: 1;
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: none;
  }

  .tab-list::-webkit-scrollbar {
    display: none;
  }

  .tab-wrapper {
    position: relative;
  }

  .tab-wrapper.drag-over::before {
    content: '';
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 2px;
    background-color: var(--color-accent);
    z-index: var(--z-base);
  }

  .tab-actions {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 0 var(--spacing-xs);
    border-left: 1px solid var(--color-border);
  }

  .action-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border-radius: var(--radius-sm);
    color: var(--color-text-tertiary);
    transition: all var(--transition-fast);
  }

  .action-button:hover {
    background-color: var(--color-surface-hover);
    color: var(--color-text-primary);
  }

  .action-button svg {
    width: 14px;
    height: 14px;
  }

  .editor-content {
    flex: 1;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .empty-pane {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--spacing-md);
    color: var(--color-text-tertiary);
  }

  .empty-pane svg {
    width: 48px;
    height: 48px;
  }

  .empty-pane p {
    font-size: var(--font-size-base);
  }
</style>

<script>
  import { onMount, onDestroy } from 'svelte';
  import * as monaco from 'monaco-editor';
  import { gitStore } from '../stores/gitStore.js';

  export let originalContent = '';
  export let modifiedContent = '';
  export let language = 'javascript';
  export let filePath = '';
  export let readOnly = true;

  let editorContainer;
  let diffEditor;
  let isStaged = false;

  // Determine if file is staged or unstaged
  $: {
    // This will be set by parent component
  }

  async function handleStage() {
    await gitStore.stageFile(filePath);
  }

  async function handleUnstage() {
    await gitStore.unstageFile(filePath);
  }

  async function handleDiscard() {
    if (confirm('Discard changes to this file? This cannot be undone.')) {
      // TODO: Implement discard
      console.log('Discard changes:', filePath);
    }
  }

  onMount(() => {
    // Create Monaco diff editor
    diffEditor = monaco.editor.createDiffEditor(editorContainer, {
      theme: window.matchMedia('(prefers-color-scheme: dark)').matches ? 'vs-dark' : 'vs',
      automaticLayout: true,
      minimap: { enabled: false },
      fontSize: 14,
      fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Courier New', monospace",
      lineNumbers: 'on',
      readOnly: readOnly,
      scrollBeyondLastLine: false,
      wordWrap: 'off',
      tabSize: 2,
      insertSpaces: true,
      renderSideBySide: true,
      ignoreTrimWhitespace: false,
      renderIndicators: true,
      diffWordWrap: 'off',
    });

    // Set the diff model
    const originalModel = monaco.editor.createModel(originalContent, language);
    const modifiedModel = monaco.editor.createModel(modifiedContent, language);

    diffEditor.setModel({
      original: originalModel,
      modified: modifiedModel,
    });

    // Listen for theme changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleThemeChange = (e) => {
      monaco.editor.setTheme(e.matches ? 'vs-dark' : 'vs');
    };
    mediaQuery.addEventListener('change', handleThemeChange);

    return () => {
      mediaQuery.removeEventListener('change', handleThemeChange);
    };
  });

  onDestroy(() => {
    if (diffEditor) {
      diffEditor.dispose();
    }
  });

  // Update diff when content changes
  $: if (diffEditor) {
    const model = diffEditor.getModel();
    if (model) {
      model.original.setValue(originalContent);
      model.modified.setValue(modifiedContent);
    }
  }
</script>

<div class="diff-editor-container">
  <div class="diff-toolbar">
    <div class="file-path">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/>
      </svg>
      <span>{filePath}</span>
    </div>
    <div class="diff-actions">
      {#if isStaged}
        <button class="action-button" on:click={handleUnstage} title="Unstage Changes">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4"/>
          </svg>
          <span>Unstage</span>
        </button>
      {:else}
        <button class="action-button" on:click={handleStage} title="Stage Changes">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
          </svg>
          <span>Stage</span>
        </button>
      {/if}
      <button class="action-button discard" on:click={handleDiscard} title="Discard Changes">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
        </svg>
        <span>Discard</span>
      </button>
    </div>
  </div>
  <div class="diff-editor" bind:this={editorContainer}></div>
</div>

<style>
  .diff-editor-container {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    background-color: var(--color-background);
  }

  .diff-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--spacing-sm) var(--spacing-md);
    background-color: var(--color-surface-secondary);
    border-bottom: 1px solid var(--color-border);
    height: 40px;
    flex-shrink: 0;
  }

  .file-path {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    color: var(--color-text-primary);
    font-size: var(--font-size-sm);
    font-family: var(--font-family-mono);
  }

  .file-path svg {
    width: 16px;
    height: 16px;
    color: var(--color-text-secondary);
  }

  .diff-actions {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
  }

  .action-button {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
    padding: var(--spacing-xs) var(--spacing-sm);
    background-color: transparent;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    color: var(--color-text-primary);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-medium);
    cursor: pointer;
    transition: all 150ms ease;
  }

  .action-button:hover {
    background-color: var(--color-surface-hover);
    border-color: var(--color-text-secondary);
  }

  .action-button.discard {
    color: var(--color-error);
    border-color: var(--color-error);
  }

  .action-button.discard:hover {
    background-color: rgba(var(--color-error-rgb, 255, 59, 48), 0.1);
  }

  .action-button svg {
    width: 14px;
    height: 14px;
  }

  .diff-editor {
    flex: 1;
    overflow: hidden;
  }
</style>

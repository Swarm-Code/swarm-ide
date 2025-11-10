<script>
  import { onMount } from 'svelte';
  import { editorStore } from '../stores/editorStore.js';

  export let workspacePath = '';

  let mindFiles = [];
  let viewMode = 'grid';
  let selectedFile = null;
  let showCreateModal = false;
  let newFileName = '';
  let createInput;

  onMount(async () => {
    await loadMindFiles();
  });

  async function loadMindFiles() {
    if (!workspacePath || !window.electronAPI) return;

    const result = await window.electronAPI.mindList(workspacePath);
    if (result.success) {
      mindFiles = result.files;
    }
  }

  async function handleCreateFile() {
    if (!newFileName.trim()) return;

    const filename = newFileName.trim();
    
    await window.electronAPI.mindWrite({
      workspacePath,
      filename,
      content: '<p>Start writing...</p>',
    });

    await loadMindFiles();
    showCreateModal = false;
    newFileName = '';
    
    handleOpenFile({ name: filename, path: `${workspacePath}/.swarm/mind/${filename}.html` });
  }

  async function handleOpenFile(file) {
    const result = await window.electronAPI.mindRead({
      workspacePath,
      filename: file.name,
    });

    if (result.success) {
      editorStore.openMindFile(file.name, result.content, workspacePath);
    }
  }

  async function handleDeleteFile(file, event) {
    event.stopPropagation();

    await window.electronAPI.mindDelete({
      workspacePath,
      filename: file.name,
    });

    await loadMindFiles();
  }

  function handleModalKeydown(event) {
    if (event.key === 'Enter') {
      handleCreateFile();
    } else if (event.key === 'Escape') {
      showCreateModal = false;
      newFileName = '';
    }
  }

  function openCreateModal() {
    showCreateModal = true;
    setTimeout(() => createInput?.focus(), 50);
  }

  $: if (workspacePath) {
    loadMindFiles();
  }
</script>

<div class="mind-browser">
  <div class="mind-header">
    <h2>Mind</h2>
    <div class="header-actions">
      <button
        class="view-toggle"
        class:active={viewMode === 'grid'}
        on:click={() => viewMode = 'grid'}
        aria-label="Grid view"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
      </button>
      <button
        class="view-toggle"
        class:active={viewMode === 'list'}
        on:click={() => viewMode = 'list'}
        aria-label="List view"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="4" y1="6" x2="20" y2="6" stroke-linecap="round" />
          <line x1="4" y1="12" x2="20" y2="12" stroke-linecap="round" />
          <line x1="4" y1="18" x2="20" y2="18" stroke-linecap="round" />
        </svg>
      </button>
      <button class="create-button" on:click={openCreateModal}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path stroke-linecap="round" d="M12 5v14m7-7H5" />
        </svg>
        <span>New Note</span>
      </button>
    </div>
  </div>

  <div class="mind-content">
    {#if mindFiles.length === 0}
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
        <h3>No notes yet</h3>
        <p>Create your first note to get started</p>
        <button class="create-button-large" on:click={openCreateModal}>
          Create Note
        </button>
      </div>
    {:else if viewMode === 'grid'}
      <div class="grid-view">
        {#each mindFiles as file (file.name)}
          <div class="file-card" on:click={() => handleOpenFile(file)}>
            <div class="file-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            </div>
            <div class="file-name">{file.name}</div>
            <button class="file-delete" on:click={(e) => handleDeleteFile(file, e)} aria-label="Delete {file.name}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        {/each}
      </div>
    {:else}
      <div class="list-view">
        {#each mindFiles as file (file.name)}
          <div class="file-row" on:click={() => handleOpenFile(file)}>
            <div class="file-row-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            </div>
            <div class="file-row-name">{file.name}</div>
            <button class="file-delete" on:click={(e) => handleDeleteFile(file, e)} aria-label="Delete {file.name}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>

{#if showCreateModal}
  <div class="modal-overlay" on:click={() => showCreateModal = false}>
    <div class="modal" on:click={(e) => e.stopPropagation()} role="dialog" aria-labelledby="modal-title" aria-modal="true">
      <h3 id="modal-title">Create New Note</h3>
      <input
        type="text"
        class="note-name-input"
        bind:value={newFileName}
        bind:this={createInput}
        on:keydown={handleModalKeydown}
        placeholder="Note name"
        autocomplete="off"
      />
      <div class="modal-actions">
        <button class="secondary-button" on:click={() => showCreateModal = false}>
          Cancel
        </button>
        <button class="primary-button" on:click={handleCreateFile} disabled={!newFileName.trim()}>
          Create
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .mind-browser {
    display: flex;
    flex-direction: column;
    height: 100%;
    background-color: var(--color-background);
  }

  .mind-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--spacing-lg) var(--spacing-xl);
    border-bottom: 1px solid var(--color-border);
    background-color: var(--color-background);
  }

  .mind-header h2 {
    font-size: var(--font-size-2xl);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-primary);
    margin: 0;
    letter-spacing: -0.5px;
  }

  .header-actions {
    display: flex;
    gap: var(--spacing-sm);
    align-items: center;
  }

  .view-toggle {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: transparent;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    color: var(--color-text-secondary);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .view-toggle:hover {
    background-color: var(--color-surface-hover);
    border-color: var(--color-border);
  }

  .view-toggle.active {
    background-color: var(--color-accent);
    border-color: var(--color-accent);
    color: white;
  }

  .view-toggle svg {
    width: 16px;
    height: 16px;
  }

  .create-button {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
    padding: 0 var(--spacing-md);
    height: 32px;
    background-color: var(--color-accent);
    color: white;
    border: none;
    border-radius: var(--radius-sm);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .create-button:hover {
    background-color: var(--color-accent-hover);
  }

  .create-button:active {
    transform: scale(0.98);
  }

  .create-button svg {
    width: 14px;
    height: 14px;
  }

  .mind-content {
    flex: 1;
    overflow-y: auto;
    padding: var(--spacing-xl);
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

  .create-button-large {
    margin-top: var(--spacing-sm);
    padding: var(--spacing-sm) var(--spacing-lg);
    background-color: var(--color-accent);
    color: white;
    border: none;
    border-radius: var(--radius-md);
    font-size: var(--font-size-base);
    font-weight: var(--font-weight-medium);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .create-button-large:hover {
    background-color: var(--color-accent-hover);
  }

  .create-button-large:active {
    transform: scale(0.98);
  }

  .grid-view {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: var(--spacing-md);
  }

  @media (min-width: 1440px) {
    .grid-view {
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: var(--spacing-lg);
    }
  }

  .file-card {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--spacing-sm);
    padding: var(--spacing-lg);
    background-color: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .file-card:hover {
    background-color: var(--color-surface-hover);
    border-color: var(--color-accent);
    box-shadow: var(--shadow-sm);
    transform: translateY(-1px);
  }

  .file-card:active {
    transform: translateY(0);
  }

  .file-icon {
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-accent);
  }

  .file-icon svg {
    width: 100%;
    height: 100%;
  }

  .file-name {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    color: var(--color-text-primary);
    text-align: center;
    word-break: break-word;
    line-height: var(--line-height-normal);
  }

  .file-delete {
    position: absolute;
    top: var(--spacing-xs);
    right: var(--spacing-xs);
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: transparent;
    border: none;
    border-radius: var(--radius-sm);
    color: var(--color-text-tertiary);
    opacity: 0;
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .file-card:hover .file-delete,
  .file-row:hover .file-delete {
    opacity: 1;
  }

  .file-delete:hover {
    background-color: var(--color-error);
    color: white;
  }

  .file-delete svg {
    width: 12px;
    height: 12px;
  }

  .list-view {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .file-row {
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--spacing-md);
    padding: var(--spacing-sm) var(--spacing-md);
    background-color: var(--color-surface);
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .file-row:hover {
    background-color: var(--color-surface-hover);
  }

  .file-row-icon {
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-accent);
    flex-shrink: 0;
  }

  .file-row-icon svg {
    width: 100%;
    height: 100%;
  }

  .file-row-name {
    flex: 1;
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    color: var(--color-text-primary);
  }

  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(0, 0, 0, 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: var(--z-modal);
    backdrop-filter: blur(8px);
    animation: overlayFadeIn 200ms cubic-bezier(0.4, 0, 0.2, 1);
  }

  @keyframes overlayFadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  .modal {
    background-color: var(--color-surface);
    border-radius: var(--radius-lg);
    padding: var(--spacing-lg);
    min-width: 400px;
    max-width: 500px;
    box-shadow: var(--shadow-xl);
    border: 1px solid var(--color-border);
    animation: modalSlideIn 250ms cubic-bezier(0.4, 0, 0.2, 1);
  }

  @keyframes modalSlideIn {
    from {
      opacity: 0;
      transform: scale(0.96) translateY(8px);
    }
    to {
      opacity: 1;
      transform: scale(1) translateY(0);
    }
  }

  .modal h3 {
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-primary);
    margin: 0 0 var(--spacing-md) 0;
  }

  .note-name-input {
    width: 100%;
    padding: var(--spacing-sm) var(--spacing-md);
    background-color: var(--color-background-secondary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    color: var(--color-text-primary);
    font-size: var(--font-size-base);
    font-family: var(--font-family-base);
    margin-bottom: var(--spacing-md);
    outline: none;
    transition: all var(--transition-fast);
  }

  .note-name-input:focus {
    border-color: var(--color-accent);
    background-color: var(--color-surface);
    box-shadow: 0 0 0 3px rgba(0, 113, 227, 0.1);
  }

  .note-name-input::placeholder {
    color: var(--color-text-tertiary);
  }

  .modal-actions {
    display: flex;
    gap: var(--spacing-sm);
    justify-content: flex-end;
  }

  .secondary-button,
  .primary-button {
    padding: var(--spacing-sm) var(--spacing-lg);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    font-family: var(--font-family-base);
    border-radius: var(--radius-md);
    transition: all var(--transition-fast);
    cursor: pointer;
    border: none;
  }

  .secondary-button {
    background-color: var(--color-surface-secondary);
    color: var(--color-text-primary);
  }

  .secondary-button:hover {
    background-color: var(--color-surface-hover);
  }

  .primary-button {
    background-color: var(--color-accent);
    color: white;
  }

  .primary-button:hover:not(:disabled) {
    background-color: var(--color-accent-hover);
  }

  .primary-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .secondary-button:active,
  .primary-button:active:not(:disabled) {
    transform: scale(0.98);
  }

  @media (prefers-reduced-motion: reduce) {
    .modal-overlay,
    .modal,
    .file-card,
    .file-row,
    * {
      animation: none !important;
      transition: none !important;
    }
  }
</style>

<script>
  import { onMount } from 'svelte';
  import { activeWorkspacePath } from '../stores/workspaceStore.js';
  import { editorStore } from '../stores/editorStore.js';

  let viewMode = 'project'; // 'project' or 'global'
  let searchQuery = '';
  let mindFiles = [];
  let folders = [];
  let expandedFolders = new Set();
  let currentWorkspacePath = null;
  let showCreateModal = false;
  let createMode = 'note'; // 'note' or 'folder'
  let newItemName = '';
  let selectedFolder = null;
  let createInput;

  activeWorkspacePath.subscribe((path) => {
    currentWorkspacePath = path;
    if (path) {
      loadMindFiles();
    }
  });

  onMount(() => {
    if (currentWorkspacePath) {
      loadMindFiles();
    }
  });

  async function loadMindFiles() {
    if (!window.electronAPI || !currentWorkspacePath) return;

    console.log('[MindSidebar] loadMindFiles() called, workspacePath:', currentWorkspacePath);
    const result = await window.electronAPI.mindList(currentWorkspacePath);
    console.log('[MindSidebar] mindList result:', result);
    if (result.success) {
      organizeFiles(result.files);
    }
  }

  function organizeFiles(files) {
    console.log('[MindSidebar] organizeFiles() called with:', files);
    const folderMap = new Map();
    const rootFiles = [];

    files.forEach(file => {
      console.log('[MindSidebar] Processing file:', file);
      if (file.name.includes('/')) {
        const parts = file.name.split('/');
        const folderName = parts[0];
        const fileName = parts.slice(1).join('/');

        if (!folderMap.has(folderName)) {
          folderMap.set(folderName, []);
        }
        folderMap.get(folderName).push({
          name: fileName,
          fullName: file.name,
          path: file.path,
        });
      } else {
        rootFiles.push(file);
      }
    });

    folders = Array.from(folderMap.entries()).map(([name, files]) => ({
      name,
      files,
    }));

    mindFiles = rootFiles;
    console.log('[MindSidebar] Organized into folders:', folders, 'rootFiles:', rootFiles);
  }

  async function handleCreateItem() {
    if (!newItemName.trim() || !currentWorkspacePath) return;

    const name = newItemName.trim();
    
    if (createMode === 'folder') {
      // Just create the folder structure, no actual file
      showCreateModal = false;
      newItemName = '';
      selectedFolder = name;
      return;
    }

    // Create note
    const fullName = selectedFolder ? `${selectedFolder}/${name}` : name;
    
    console.log('[MindSidebar] Creating note:', { name: fullName, workspacePath: currentWorkspacePath });
    
    const result = await window.electronAPI.mindWrite({
      workspacePath: currentWorkspacePath,
      name: fullName,
      content: '<h1>' + name + '</h1><p>Start writing...</p>',
    });

    console.log('[MindSidebar] Create result:', result);

    await loadMindFiles();
    showCreateModal = false;
    newItemName = '';
    selectedFolder = null;
    
    handleOpenNote({ name: fullName, path: `${currentWorkspacePath}/.swarm/mind/${fullName}.html` });
  }

  async function handleOpenNote(file) {
    if (!currentWorkspacePath) return;
    
    console.log('[MindSidebar] handleOpenNote() called with file:', file);
    const noteName = file.fullName || file.name;
    console.log('[MindSidebar] Opening note:', { name: noteName, workspacePath: currentWorkspacePath });
    
    const result = await window.electronAPI.mindRead({
      workspacePath: currentWorkspacePath,
      name: noteName,
    });

    console.log('[MindSidebar] Read result:', result);

    if (result.success) {
      console.log('[MindSidebar] Calling editorStore.openMindFile with:', { noteName, contentLength: result.content.length, currentWorkspacePath });
      editorStore.openMindFile(noteName, result.content, currentWorkspacePath);
    }
  }

  async function handleDeleteNote(file, event) {
    event.stopPropagation();

    const noteName = file.fullName || file.name;
    console.log('[MindSidebar] Deleting note:', { name: noteName, workspacePath: currentWorkspacePath });

    await window.electronAPI.mindDelete({
      workspacePath: currentWorkspacePath,
      name: noteName,
    });

    await loadMindFiles();
  }

  function openCreateModal(mode = 'note', folder = null) {
    createMode = mode;
    selectedFolder = folder;
    showCreateModal = true;
    setTimeout(() => createInput?.focus(), 50);
  }

  function handleModalKeydown(event) {
    if (event.key === 'Enter') {
      handleCreateItem();
    } else if (event.key === 'Escape') {
      showCreateModal = false;
      newItemName = '';
      selectedFolder = null;
    }
  }

  function toggleFolder(folderName) {
    if (expandedFolders.has(folderName)) {
      expandedFolders.delete(folderName);
    } else {
      expandedFolders.add(folderName);
    }
    expandedFolders = expandedFolders;
  }

  $: filteredFiles = mindFiles.filter(file =>
    file.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  $: filteredFolders = folders
    .map(folder => ({
      ...folder,
      files: folder.files.filter(file =>
        file.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        folder.name.toLowerCase().includes(searchQuery.toLowerCase())
      ),
    }))
    .filter(folder => folder.files.length > 0 || folder.name.toLowerCase().includes(searchQuery.toLowerCase()));
</script>

<div class="mind-sidebar">
  <div class="sidebar-header">
    <div class="view-toggle-group">
      <button
        class="view-toggle-btn"
        class:active={viewMode === 'project'}
        on:click={() => viewMode = 'project'}
      >
        Project
      </button>
      <button
        class="view-toggle-btn"
        class:active={viewMode === 'global'}
        on:click={() => viewMode = 'global'}
      >
        Global
      </button>
    </div>
    
    <div class="header-actions">
      <button class="new-item-btn" on:click={() => openCreateModal('folder')} title="New folder">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
        </svg>
      </button>
      <button class="new-item-btn" on:click={() => openCreateModal('note')} title="New note">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path stroke-linecap="round" d="M12 5v14m7-7H5" />
        </svg>
      </button>
    </div>
  </div>

  <div class="search-container">
    <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="11" cy="11" r="8" />
      <path stroke-linecap="round" d="m21 21-4.35-4.35" />
    </svg>
    <input
      type="text"
      class="search-input"
      placeholder="Search notes..."
      bind:value={searchQuery}
    />
  </div>

  <div class="notes-list">
    {#if filteredFolders.length === 0 && filteredFiles.length === 0}
      <div class="empty-state">
        {#if searchQuery}
          <p>No notes found</p>
        {:else}
          <p>No notes yet</p>
          <button class="create-first-btn" on:click={() => openCreateModal('note')}>
            Create your first note
          </button>
        {/if}
      </div>
    {:else}
      <!-- Folders -->
      {#each filteredFolders as folder (folder.name)}
        <div class="folder-container">
          <!-- svelte-ignore a11y-click-events-have-key-events -->
          <div class="folder-item" on:click={() => toggleFolder(folder.name)} on:keydown={(e) => { if (e.key === 'Enter') toggleFolder(folder.name); }} role="button" tabindex="0">
            <div class="folder-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class:expanded={expandedFolders.has(folder.name)}>
                <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </div>
            <div class="folder-icon-main">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
            </div>
            <div class="folder-name">{folder.name}</div>
            <button class="folder-add" on:click={(e) => { e.stopPropagation(); openCreateModal('note', folder.name); }} title="Add note to folder">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path stroke-linecap="round" d="M12 5v14m7-7H5" />
              </svg>
            </button>
          </div>
          
          {#if expandedFolders.has(folder.name)}
            <div class="folder-contents">
              {#each folder.files as file (file.fullName)}
                <!-- svelte-ignore a11y-click-events-have-key-events -->
                <div class="note-item nested" on:click={() => handleOpenNote(file)} on:keydown={(e) => { if (e.key === 'Enter') handleOpenNote(file); }} role="button" tabindex="0">
                  <div class="note-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <div class="note-name">{file.name}</div>
                  <button class="note-delete" on:click={(e) => handleDeleteNote(file, e)} aria-label="Delete {file.name}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path stroke-linecap="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      {/each}

      <!-- Root files -->
      {#each filteredFiles as file (file.name)}
        <!-- svelte-ignore a11y-click-events-have-key-events -->
        <div class="note-item" on:click={() => handleOpenNote(file)} on:keydown={(e) => { if (e.key === 'Enter') handleOpenNote(file); }} role="button" tabindex="0">
          <div class="note-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div class="note-name">{file.name}</div>
          <button class="note-delete" on:click={(e) => handleDeleteNote(file, e)} aria-label="Delete {file.name}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      {/each}
    {/if}
  </div>
</div>

{#if showCreateModal}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <div class="modal-overlay" on:click={() => { showCreateModal = false; newItemName = ''; selectedFolder = null; }} role="presentation">
    <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
    <div class="modal" on:click={(e) => e.stopPropagation()} role="dialog" aria-labelledby="modal-title" aria-modal="true">
      <h3 id="modal-title">
        {createMode === 'folder' ? 'New Folder' : selectedFolder ? `New Note in ${selectedFolder}` : 'New Note'}
      </h3>
      <input
        type="text"
        class="note-name-input"
        bind:value={newItemName}
        bind:this={createInput}
        on:keydown={handleModalKeydown}
        placeholder={createMode === 'folder' ? 'Folder name' : 'Note name'}
        autocomplete="off"
      />
      <div class="modal-actions">
        <button class="secondary-button" on:click={() => { showCreateModal = false; newItemName = ''; selectedFolder = null; }}>
          Cancel
        </button>
        <button class="primary-button" on:click={handleCreateItem} disabled={!newItemName.trim()}>
          Create
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .mind-sidebar {
    display: flex;
    flex-direction: column;
    height: 100%;
    background-color: var(--color-background);
    border-right: 1px solid var(--color-border);
  }

  .sidebar-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--spacing-md);
    border-bottom: 1px solid var(--color-border);
  }

  .header-actions {
    display: flex;
    gap: var(--spacing-xs);
  }

  .view-toggle-group {
    display: flex;
    gap: 2px;
    background-color: var(--color-surface-secondary);
    border-radius: var(--radius-sm);
    padding: 2px;
  }

  .view-toggle-btn {
    padding: var(--spacing-xs) var(--spacing-md);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-medium);
    font-family: var(--font-family-base);
    color: var(--color-text-secondary);
    background-color: transparent;
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .view-toggle-btn:hover {
    color: var(--color-text-primary);
  }

  .view-toggle-btn.active {
    background-color: var(--color-surface);
    color: var(--color-text-primary);
    box-shadow: var(--shadow-sm);
  }

  .new-item-btn {
    width: 28px;
    height: 28px;
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

  .new-item-btn:hover {
    background-color: var(--color-accent);
    border-color: var(--color-accent);
    color: white;
  }

  .new-item-btn svg {
    width: 14px;
    height: 14px;
  }

  .search-container {
    position: relative;
    padding: var(--spacing-md);
    border-bottom: 1px solid var(--color-border);
  }

  .search-icon {
    position: absolute;
    left: calc(var(--spacing-md) + var(--spacing-sm));
    top: 50%;
    transform: translateY(-50%);
    width: 14px;
    height: 14px;
    color: var(--color-text-tertiary);
    pointer-events: none;
  }

  .search-input {
    width: 100%;
    padding: var(--spacing-xs) var(--spacing-sm);
    padding-left: calc(var(--spacing-xl) + var(--spacing-xs));
    background-color: var(--color-surface-secondary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    color: var(--color-text-primary);
    font-size: var(--font-size-sm);
    font-family: var(--font-family-base);
    outline: none;
    transition: all var(--transition-fast);
  }

  .search-input:focus {
    border-color: var(--color-accent);
    background-color: var(--color-surface);
    box-shadow: 0 0 0 3px rgba(0, 113, 227, 0.1);
  }

  .search-input::placeholder {
    color: var(--color-text-tertiary);
  }

  .notes-list {
    flex: 1;
    overflow-y: auto;
    padding: var(--spacing-xs);
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--spacing-2xl) var(--spacing-md);
    text-align: center;
  }

  .empty-state p {
    font-size: var(--font-size-sm);
    color: var(--color-text-tertiary);
    margin: 0 0 var(--spacing-md) 0;
  }

  .create-first-btn {
    padding: var(--spacing-xs) var(--spacing-md);
    background-color: var(--color-accent);
    color: white;
    border: none;
    border-radius: var(--radius-sm);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .create-first-btn:hover {
    background-color: var(--color-accent-hover);
  }

  .folder-container {
    margin-bottom: var(--spacing-xs);
  }

  .folder-item {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
    padding: var(--spacing-xs) var(--spacing-sm);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: all var(--transition-fast);
    position: relative;
  }

  .folder-item:hover {
    background-color: var(--color-surface-hover);
  }

  .folder-icon {
    width: 12px;
    height: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-text-tertiary);
    flex-shrink: 0;
    transition: transform var(--transition-fast);
  }

  .folder-icon svg {
    width: 100%;
    height: 100%;
  }

  .folder-icon svg.expanded {
    transform: rotate(90deg);
  }

  .folder-icon-main {
    width: 16px;
    height: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-accent);
    flex-shrink: 0;
  }

  .folder-icon-main svg {
    width: 100%;
    height: 100%;
  }

  .folder-name {
    flex: 1;
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .folder-add {
    width: 20px;
    height: 20px;
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

  .folder-item:hover .folder-add {
    opacity: 1;
  }

  .folder-add:hover {
    background-color: var(--color-accent);
    color: white;
  }

  .folder-add svg {
    width: 12px;
    height: 12px;
  }

  .folder-contents {
    padding-left: calc(var(--spacing-md) + var(--spacing-sm));
    margin-top: var(--spacing-xs);
  }

  .note-item {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    padding: var(--spacing-xs) var(--spacing-sm);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: all var(--transition-fast);
    position: relative;
  }

  .note-item.nested {
    margin-bottom: 2px;
  }

  .note-item:hover {
    background-color: var(--color-surface-hover);
  }

  .note-icon {
    width: 16px;
    height: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-accent);
    flex-shrink: 0;
  }

  .note-icon svg {
    width: 100%;
    height: 100%;
  }

  .note-name {
    flex: 1;
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    color: var(--color-text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .note-delete {
    width: 20px;
    height: 20px;
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

  .note-item:hover .note-delete {
    opacity: 1;
  }

  .note-delete:hover {
    background-color: var(--color-error);
    color: white;
  }

  .note-delete svg {
    width: 12px;
    height: 12px;
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
    * {
      animation: none !important;
      transition: none !important;
    }
  }
</style>

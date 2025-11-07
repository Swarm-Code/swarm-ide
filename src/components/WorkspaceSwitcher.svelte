<script>
  import { workspaceStore } from '../stores/workspaceStore.js';

  let workspaces = [];
  let activeWorkspaceId = null;
  let showDropdown = false;
  let showCreateModal = false;
  let newWorkspaceName = '';

  workspaceStore.subscribe((state) => {
    workspaces = state.workspaces;
    activeWorkspaceId = state.activeWorkspaceId;
  });

  $: activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId);
  
  // Get folder name from path
  function getFolderName(path) {
    if (!path) return 'Unknown';
    const parts = path.split(/[\\/]/);
    return parts[parts.length - 1] || 'Unknown';
  }

  async function handleSwitchWorkspace(workspaceId) {
    workspaceStore.setActiveWorkspace(workspaceId);
    if (window.electronAPI) {
      await window.electronAPI.workspaceSetActive(workspaceId);
    }
    showDropdown = false;
  }

  async function handleCreateWorkspace() {
    if (window.electronAPI) {
      const folder = await window.electronAPI.openFolder();
      if (!folder) return;

      const workspace = {
        id: Date.now().toString(),
        path: folder.path,
        color: getRandomColor(),
      };

      workspaceStore.addWorkspace(workspace);
      workspaceStore.setActiveWorkspace(workspace.id);

      const allWorkspaces = [...workspaces, workspace];
      await window.electronAPI.workspaceSave(allWorkspaces);
      await window.electronAPI.workspaceSetActive(workspace.id);

      newWorkspaceName = '';
      showCreateModal = false;
      showDropdown = false;
    }
  }

  async function handleDeleteWorkspace(workspaceId, event) {
    event.stopPropagation();
    if (workspaces.length === 1) {
      alert('Cannot delete the last workspace');
      return;
    }

    if (confirm('Are you sure you want to delete this workspace?')) {
      workspaceStore.removeWorkspace(workspaceId);
      
      if (window.electronAPI) {
        const updatedWorkspaces = workspaces.filter((w) => w.id !== workspaceId);
        await window.electronAPI.workspaceSave(updatedWorkspaces);
      }
    }
  }

  function getRandomColor() {
    const colors = ['#0071e3', '#34C759', '#FF9500', '#FF3B30', '#AF52DE', '#5856D6'];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  function toggleDropdown() {
    showDropdown = !showDropdown;
  }

  function handleClickOutside(event) {
    if (!event.target.closest('.workspace-switcher')) {
      showDropdown = false;
    }
  }
</script>

<svelte:window on:click={handleClickOutside} />

<div class="workspace-switcher">
  <button class="workspace-button" on:click|stopPropagation={toggleDropdown}>
    {#if activeWorkspace}
      <span 
        class="workspace-color" 
        style="background-color: {activeWorkspace.color}"
      ></span>
      <span class="workspace-name">{getFolderName(activeWorkspace.path)}</span>
    {:else}
      <span class="workspace-name">No Workspace</span>
    {/if}
    <svg class="chevron" class:open={showDropdown} viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        d="M19 9l-7 7-7-7"
      />
    </svg>
  </button>

  {#if showDropdown}
    <div class="dropdown">
      <div class="dropdown-header">
        <span class="dropdown-title">Workspaces</span>
      </div>
      
      <div class="workspace-list">
        {#each workspaces as workspace}
          <button
            class="workspace-item"
            class:active={workspace.id === activeWorkspaceId}
            on:click={() => handleSwitchWorkspace(workspace.id)}
          >
            <span 
              class="workspace-color-small" 
              style="background-color: {workspace.color}"
            ></span>
            <div class="workspace-info">
              <span class="workspace-item-name">{getFolderName(workspace.path)}</span>
              <span class="workspace-path">{workspace.path}</span>
            </div>
            <button
              class="delete-button"
              on:click={(e) => handleDeleteWorkspace(workspace.id, e)}
              title="Delete workspace"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </button>
        {/each}
      </div>

      <div class="dropdown-footer">
        <button class="add-workspace-button" on:click={() => showCreateModal = true}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 4v16m8-8H4"
            />
          </svg>
          Add Workspace
        </button>
      </div>
    </div>
  {/if}
</div>

{#if showCreateModal}
  <button
    class="modal-overlay" 
    on:click={() => showCreateModal = false}
    aria-label="Close modal"
  >
    <div 
      class="modal" 
      role="dialog"
      aria-labelledby="modal-title"
      aria-modal="true"
    >
      <h2 id="modal-title">Add Workspace</h2>
      <p class="modal-description">Select a folder to add as a workspace</p>
      <div class="modal-actions">
        <button class="secondary-button" on:click={() => showCreateModal = false}>
          Cancel
        </button>
        <button class="primary-button" on:click={handleCreateWorkspace}>
          Select Folder
        </button>
      </div>
    </div>
  </button>
{/if}

<style>
  .workspace-switcher {
    position: relative;
  }

  .workspace-button {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    padding: var(--spacing-xs) var(--spacing-md);
    background-color: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    transition: all var(--transition-fast);
    min-width: 200px;
    height: 32px;
  }

  .workspace-button:hover {
    background-color: var(--color-surface-hover);
    border-color: var(--color-border-secondary);
  }

  .workspace-color {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .workspace-name {
    flex: 1;
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    color: var(--color-text-primary);
    text-align: left;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .chevron {
    width: 16px;
    height: 16px;
    color: var(--color-text-secondary);
    transition: transform var(--transition-fast);
    flex-shrink: 0;
  }

  .chevron.open {
    transform: rotate(180deg);
  }

  .dropdown {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    min-width: 320px;
    background-color: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
    z-index: 1000;
    overflow: hidden;
  }

  .dropdown-header {
    padding: var(--spacing-sm) var(--spacing-md);
    border-bottom: 1px solid var(--color-border);
  }

  .dropdown-title {
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .workspace-list {
    max-height: 300px;
    overflow-y: auto;
  }

  .workspace-item {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    padding: var(--spacing-sm) var(--spacing-md);
    width: 100%;
    transition: all var(--transition-fast);
    text-align: left;
  }

  .workspace-item:hover {
    background-color: var(--color-surface-hover);
  }

  .workspace-item.active {
    background-color: var(--color-accent);
  }

  .workspace-item.active .workspace-item-name,
  .workspace-item.active .workspace-path {
    color: white;
  }

  .workspace-color-small {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .workspace-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .workspace-item-name {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    color: var(--color-text-primary);
  }

  .workspace-path {
    font-size: var(--font-size-xs);
    color: var(--color-text-tertiary);
    font-family: var(--font-family-mono);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .delete-button {
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-sm);
    color: var(--color-text-secondary);
    opacity: 0;
    transition: all var(--transition-fast);
    flex-shrink: 0;
  }

  .workspace-item:hover .delete-button {
    opacity: 1;
  }

  .delete-button:hover {
    background-color: rgba(255, 59, 48, 0.1);
    color: #FF3B30;
  }

  .workspace-item.active .delete-button {
    color: white;
  }

  .workspace-item.active .delete-button:hover {
    background-color: rgba(255, 255, 255, 0.2);
  }

  .delete-button svg {
    width: 14px;
    height: 14px;
  }

  .dropdown-footer {
    padding: var(--spacing-xs);
    border-top: 1px solid var(--color-border);
  }

  .add-workspace-button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-xs);
    width: 100%;
    padding: var(--spacing-sm);
    background-color: var(--color-accent);
    color: white;
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    border-radius: var(--radius-md);
    transition: all var(--transition-fast);
  }

  .add-workspace-button:hover {
    background-color: var(--color-accent-hover);
  }

  .add-workspace-button svg {
    width: 16px;
    height: 16px;
  }

  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2000;
    border: none;
    padding: 0;
    text-align: left;
  }

  .modal {
    background-color: var(--color-surface);
    border-radius: var(--radius-lg);
    padding: var(--spacing-xl);
    min-width: 400px;
    box-shadow: var(--shadow-xl);
  }

  .modal h2 {
    font-size: var(--font-size-xl);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-primary);
    margin-bottom: var(--spacing-xs);
  }

  .modal-description {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    margin-bottom: var(--spacing-lg);
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
    border-radius: var(--radius-md);
    transition: all var(--transition-fast);
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

  .primary-button:hover {
    background-color: var(--color-accent-hover);
  }
</style>

<script>
  import { onMount } from 'svelte';
  import { sshStore } from '../stores/sshStore.js';
  import SSHConnectionDialog from './SSHConnectionDialog.svelte';

  export let onConnect;

  let showDialog = false;
  let showDropdown = false;
  let savedConnections = [];
  let editingConnection = null;

  $: savedConnections = $sshStore.connections;

  async function handleQuickConnect(connection) {
    showDropdown = false;
    
    let credentials = connection.credentials;
    
    // If no saved credentials, prompt for them
    if (!credentials || (!credentials.password && !credentials.privateKey)) {
      // Could show a minimal password prompt here
      // For now, just open the full dialog
      showDialog = true;
      return;
    }
    
    // Dispatch the connection event with saved credentials
    if (onConnect) {
      onConnect({
        detail: {
          connection,
          tempCredentials: undefined
        }
      });
    }
  }

  function handleNewConnection() {
    showDropdown = false;
    editingConnection = null;
    showDialog = true;
  }

  function handleEditConnection(connection, event) {
    event.stopPropagation();
    showDropdown = false;
    editingConnection = connection;
    showDialog = true;
  }

  async function handleRemoveConnection(id, event) {
    event.stopPropagation();
    if (!confirm('Delete this SSH connection?')) return;
    
    if (window.electronAPI) {
      await window.electronAPI.sshRemoveConnection(id);
    }
    sshStore.removeConnection(id);
  }

  function handleConnect(event) {
    showDialog = false;
    editingConnection = null;
    if (onConnect) {
      onConnect(event);
    }
  }

  function handleDialogClose() {
    showDialog = false;
    editingConnection = null;
  }

  async function handleClearAll() {
    if (!confirm('Are you sure you want to delete all saved SSH connections? This cannot be undone.')) {
      return;
    }

    showDropdown = false;

    if (window.electronAPI) {
      await window.electronAPI.sshClearAllConnections();
    }

    // Clear from store
    sshStore.setConnections([]);
  }
</script>

<div class="ssh-launcher">
  <button 
    class="launcher-btn" 
    on:click={() => showDropdown = !showDropdown}
    title="SSH Connections"
  >
    <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
        d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
    <span class="label">SSH</span>
  </button>

  {#if showDropdown}
    <div class="dropdown">
      <div class="dropdown-header">
        <span>SSH Connections</span>
        <button class="close-dropdown" on:click={() => showDropdown = false}>×</button>
      </div>

      {#if savedConnections.length > 0}
        <div class="connections-list">
          {#each savedConnections as connection}
            <button 
              class="connection-item"
              on:click={() => handleQuickConnect(connection)}
            >
              <div class="connection-info">
                <div class="connection-name">{connection.name}</div>
                <div class="connection-details">
                  {connection.username}@{connection.host}:{connection.port}
                </div>
              </div>
              <div class="connection-actions">
                <button 
                  class="edit-btn"
                  on:click={(e) => handleEditConnection(connection, e)}
                  title="Edit connection"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
                <button 
                  class="remove-btn"
                  on:click={(e) => handleRemoveConnection(connection.id, e)}
                  title="Delete connection"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </button>
          {/each}
        </div>
        <div class="dropdown-divider"></div>
      {/if}

      <button class="new-connection-btn" on:click={handleNewConnection}>
        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
            d="M12 4v16m8-8H4" />
        </svg>
        New Connection
      </button>

      {#if savedConnections.length > 0}
        <div class="dropdown-divider"></div>
        <button class="clear-all-btn" on:click={handleClearAll}>
          <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
          Clear All Connections
        </button>
      {/if}
    </div>
  {/if}
</div>

<SSHConnectionDialog 
  bind:show={showDialog}
  editConnection={editingConnection}
  on:connect={handleConnect}
  on:update={handleConnect}
  on:close={handleDialogClose}
/>

<style>
  .ssh-launcher {
    position: relative;
  }

  .launcher-btn {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
    padding: var(--spacing-xs) var(--spacing-sm);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    color: var(--color-text-primary);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .launcher-btn:hover {
    background: var(--color-surface-hover);
    border-color: var(--color-border-secondary);
  }

  .launcher-btn .icon {
    width: 16px;
    height: 16px;
  }

  .dropdown {
    position: absolute;
    top: calc(100% + var(--spacing-xs));
    right: 0;
    width: 320px;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
    z-index: 1000;
    overflow: hidden;
  }

  .dropdown-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--spacing-sm) var(--spacing-md);
    background: var(--color-background);
    border-bottom: 1px solid var(--color-border);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-secondary);
  }

  .close-dropdown {
    background: none;
    border: none;
    color: var(--color-text-secondary);
    font-size: 20px;
    cursor: pointer;
    padding: 0;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-sm);
    transition: all var(--transition-fast);
  }

  .close-dropdown:hover {
    background: var(--color-surface-hover);
    color: var(--color-text-primary);
  }

  .connections-list {
    max-height: 300px;
    overflow-y: auto;
  }

  .connection-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: var(--spacing-sm) var(--spacing-md);
    background: none;
    border: none;
    text-align: left;
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .connection-item:hover {
    background: var(--color-surface-hover);
  }

  .connection-info {
    flex: 1;
    min-width: 0;
  }

  .connection-name {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    color: var(--color-text-primary);
    margin-bottom: 2px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .connection-details {
    font-size: var(--font-size-xs);
    color: var(--color-text-tertiary);
    font-family: var(--font-family-mono);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .connection-actions {
    display: flex;
    gap: 4px;
    flex-shrink: 0;
  }

  .edit-btn,
  .remove-btn {
    flex-shrink: 0;
    width: 24px;
    height: 24px;
    padding: 0;
    background: none;
    border: none;
    border-radius: var(--radius-sm);
    color: var(--color-text-tertiary);
    cursor: pointer;
    transition: all var(--transition-fast);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .edit-btn:hover {
    background: rgba(0, 113, 227, 0.1);
    color: var(--color-accent);
  }

  .remove-btn:hover {
    background: rgba(255, 59, 48, 0.1);
    color: #ff3b30;
  }

  .edit-btn svg,
  .remove-btn svg {
    width: 14px;
    height: 14px;
  }

  .dropdown-divider {
    height: 1px;
    background: var(--color-border);
    margin: var(--spacing-xs) 0;
  }

  .new-connection-btn {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
    width: 100%;
    padding: var(--spacing-sm) var(--spacing-md);
    background: none;
    border: none;
    color: var(--color-accent);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .new-connection-btn:hover {
    background: var(--color-surface-hover);
  }

  .new-connection-btn .icon {
    width: 16px;
    height: 16px;
  }

  .clear-all-btn {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
    width: 100%;
    padding: var(--spacing-sm) var(--spacing-md);
    background: none;
    border: none;
    color: #ff3b30;
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .clear-all-btn:hover {
    background: rgba(255, 59, 48, 0.1);
  }

  .clear-all-btn .icon {
    width: 16px;
    height: 16px;
  }
</style>

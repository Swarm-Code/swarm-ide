<script>
  import { onMount, onDestroy } from 'svelte';
  import { workspaceStore } from '../stores/workspaceStore.js';
  import { editorStore } from '../stores/editorStore.js';

  export let filePath = null;
  export let onSelectEntry = null;
  export let onClose = null;

  let entries = [];
  let loading = false;
  let selectedEntryId = null;
  let workspacePath = null;

  // Get workspace path
  workspaceStore.subscribe(state => {
    const workspace = state.workspaces.find(w => w.id === state.activeWorkspaceId);
    if (workspace && !workspace.isSSH) {
      workspacePath = workspace.path;
    }
  });

  async function loadEntries() {
    if (!filePath || !workspacePath || !window.electronAPI) return;
    
    loading = true;
    try {
      const result = await window.electronAPI.timelineGetEntries({
        workspacePath,
        filePath
      });
      
      if (result.success) {
        entries = result.entries;
      }
    } catch (error) {
      console.error('[Timeline] Error loading entries:', error);
    }
    loading = false;
  }

  async function handleEntryClick(entry) {
    selectedEntryId = entry.id;
    
    if (onSelectEntry && window.electronAPI) {
      const result = await window.electronAPI.timelineGetSnapshot({
        workspacePath,
        filePath,
        snapshotId: entry.id
      });
      
      if (result.success) {
        onSelectEntry(entry, result.content);
      }
    }
  }

  async function handleRestore(entry) {
    if (!window.electronAPI) return;
    
    const confirmed = confirm(`Restore file to version from ${formatDate(entry.timestamp)}?`);
    if (!confirmed) return;
    
    const result = await window.electronAPI.timelineRestoreSnapshot({
      workspacePath,
      filePath,
      snapshotId: entry.id
    });
    
    if (result.success) {
      // Reload the file in editor
      const content = await window.electronAPI.readFile(filePath);
      if (content && content.content) {
        // Update editor content - this will trigger a re-render
        window.dispatchEvent(new CustomEvent('timeline:restored', { 
          detail: { filePath, content: content.content } 
        }));
      }
    }
  }

  function formatDate(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString(undefined, { 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function formatTime(timestamp) {
    return new Date(timestamp).toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  function getSourceIcon(source) {
    switch (source) {
      case 'user': return '👤';
      case 'agent': return '🤖';
      case 'external': return '📁';
      case 'auto': return '⏱️';
      default: return '📝';
    }
  }

  function getSourceLabel(source) {
    switch (source) {
      case 'user': return 'User Save';
      case 'agent': return 'Agent Edit';
      case 'external': return 'External';
      case 'auto': return 'Auto-save';
      default: return source;
    }
  }

  // Reload when file changes
  $: if (filePath) {
    loadEntries();
  }

  onMount(() => {
    loadEntries();
    
    // Set up file watcher for external changes
    if (filePath && workspacePath && window.electronAPI) {
      window.electronAPI.timelineWatchFile({ workspacePath, filePath });
      
      // Listen for file changes
      window.electronAPI.onTimelineFileChanged(async (data) => {
        if (data.filePath === filePath) {
          // Save snapshot for external change
          await window.electronAPI.timelineSaveSnapshot({
            workspacePath,
            filePath,
            content: data.content,
            source: 'external'
          });
          loadEntries();
        }
      });
    }
  });

  onDestroy(() => {
    if (filePath && workspacePath && window.electronAPI) {
      window.electronAPI.timelineUnwatchFile({ workspacePath, filePath });
    }
  });
</script>

<div class="timeline-panel">
  <div class="timeline-header">
    <h3>Timeline</h3>
    {#if onClose}
      <button class="close-btn" on:click={onClose} title="Close">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor">
          <path stroke-linecap="round" stroke-width="1.5" d="M4 4l8 8m0-8l-8 8" />
        </svg>
      </button>
    {/if}
  </div>
  
  {#if !filePath}
    <div class="empty-state">
      <p>Select a file to view its history</p>
    </div>
  {:else if loading}
    <div class="loading">Loading history...</div>
  {:else if entries.length === 0}
    <div class="empty-state">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <p>No history yet</p>
      <span>Save the file to create a snapshot</span>
    </div>
  {:else}
    <div class="entries-list">
      {#each entries as entry (entry.id)}
        <div 
          class="entry" 
          class:selected={selectedEntryId === entry.id}
          on:click={() => handleEntryClick(entry)}
          on:keydown={(e) => e.key === 'Enter' && handleEntryClick(entry)}
          role="button"
          tabindex="0"
        >
          <div class="entry-icon">{getSourceIcon(entry.source)}</div>
          <div class="entry-content">
            <div class="entry-time">{formatDate(entry.timestamp)}</div>
            <div class="entry-source">{getSourceLabel(entry.source)}</div>
            <div class="entry-timestamp">{formatTime(entry.timestamp)}</div>
          </div>
          <button 
            class="restore-btn" 
            on:click|stopPropagation={() => handleRestore(entry)}
            title="Restore this version"
          >
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
                d="M2 8a6 6 0 1112 0A6 6 0 012 8z" />
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
                d="M8 5v3l2 2" />
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
                d="M4 2v3h3" />
            </svg>
          </button>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .timeline-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--color-surface);
    border-left: 1px solid var(--color-border);
    font-size: var(--font-size-sm);
  }

  .timeline-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--spacing-sm) var(--spacing-md);
    border-bottom: 1px solid var(--color-border);
    background: var(--color-surface-secondary);
  }

  .timeline-header h3 {
    margin: 0;
    font-size: var(--font-size-sm);
    font-weight: 600;
    color: var(--color-text-primary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .close-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    padding: 0;
    border: none;
    background: none;
    color: var(--color-text-tertiary);
    cursor: pointer;
    border-radius: var(--radius-sm);
  }

  .close-btn:hover {
    background: var(--color-surface-hover);
    color: var(--color-text-primary);
  }

  .close-btn svg {
    width: 12px;
    height: 12px;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--spacing-xl);
    color: var(--color-text-tertiary);
    text-align: center;
    flex: 1;
  }

  .empty-state svg {
    width: 32px;
    height: 32px;
    margin-bottom: var(--spacing-sm);
    opacity: 0.5;
  }

  .empty-state p {
    margin: 0 0 var(--spacing-xs);
    font-weight: 500;
  }

  .empty-state span {
    font-size: var(--font-size-xs);
    opacity: 0.7;
  }

  .loading {
    padding: var(--spacing-md);
    color: var(--color-text-tertiary);
    text-align: center;
  }

  .entries-list {
    flex: 1;
    overflow-y: auto;
    padding: var(--spacing-xs);
  }

  .entry {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    padding: var(--spacing-sm);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: background var(--transition-fast);
  }

  .entry:hover {
    background: var(--color-surface-hover);
  }

  .entry.selected {
    background: var(--color-accent-subtle);
  }

  .entry-icon {
    font-size: 14px;
    flex-shrink: 0;
  }

  .entry-content {
    flex: 1;
    min-width: 0;
  }

  .entry-time {
    font-weight: 500;
    color: var(--color-text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .entry-source {
    font-size: var(--font-size-xs);
    color: var(--color-text-secondary);
  }

  .entry-timestamp {
    font-size: 10px;
    color: var(--color-text-tertiary);
    font-family: var(--font-mono);
  }

  .restore-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    padding: 0;
    border: none;
    background: none;
    color: var(--color-text-tertiary);
    cursor: pointer;
    border-radius: var(--radius-sm);
    opacity: 0;
    transition: all var(--transition-fast);
  }

  .entry:hover .restore-btn {
    opacity: 1;
  }

  .restore-btn:hover {
    background: var(--color-accent);
    color: white;
  }

  .restore-btn svg {
    width: 14px;
    height: 14px;
  }
</style>

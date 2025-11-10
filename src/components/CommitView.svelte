<script>
  import { onMount } from 'svelte';
  import { gitStore, currentGitData } from '../stores/gitStore.js';
  import { editorStore } from '../stores/editorStore.js';

  let gitData = null;
  let commitMessage = '';
  let commitDescription = '';
  let isCommitting = false;

  const unsubscribe = currentGitData.subscribe((data) => {
    gitData = data;
  });

  $: stagedFiles = gitData?.status?.files?.filter(f => f.index && f.index !== ' ' && f.index !== '?') || [];
  $: canCommit = stagedFiles.length > 0 && commitMessage.trim().length > 0;

  function getStatusIcon(file) {
    const status = file.index;
    switch (status) {
      case 'M': return '●'; // Modified
      case 'A': return '+'; // Added
      case 'D': return '−'; // Deleted
      case 'R': return '→'; // Renamed
      default: return '●';
    }
  }

  function getStatusColor(file) {
    const status = file.index;
    switch (status) {
      case 'M': return 'var(--color-warning)';
      case 'A': return 'var(--color-success)';
      case 'D': return 'var(--color-error)';
      case 'R': return 'var(--color-info)';
      default: return 'var(--color-text-primary)';
    }
  }

  async function handleCommit() {
    if (!canCommit || isCommitting) return;

    isCommitting = true;
    try {
      const fullMessage = commitDescription.trim() 
        ? `${commitMessage}\n\n${commitDescription}`
        : commitMessage;
      
      await gitStore.commit(fullMessage);
      
      // Clear form
      commitMessage = '';
      commitDescription = '';
      
      // Show success (you could add a toast notification)
      console.log('Commit successful!');
    } catch (error) {
      console.error('Commit failed:', error);
      alert('Commit failed: ' + error.message);
    } finally {
      isCommitting = false;
    }
  }

  async function handleUnstageFile(file) {
    await gitStore.unstageFile(file.path);
  }

  async function handleUnstageAll() {
    await gitStore.unstageAll();
  }

  function handleFileClick(file) {
    // Open diff view for this file
    editorStore.openGitDiff(file.path, false); // false = not staged initially
  }

  onMount(() => {
    return unsubscribe;
  });
</script>

<div class="commit-view">
  <div class="commit-form">
    <div class="form-header">
      <h3>Commit Changes</h3>
      <div class="file-count">
        {stagedFiles.length} {stagedFiles.length === 1 ? 'file' : 'files'} staged
      </div>
    </div>

    <div class="message-input">
      <input
        type="text"
        bind:value={commitMessage}
        placeholder="Commit message (required)"
        class="commit-title"
        maxlength="72"
      />
      <div class="char-count" class:warning={commitMessage.length > 50}>
        {commitMessage.length}/72
      </div>
    </div>

    <textarea
      bind:value={commitDescription}
      placeholder="Extended description (optional)"
      class="commit-description"
      rows="5"
    ></textarea>

    <div class="commit-actions">
      <button 
        class="commit-button" 
        on:click={handleCommit}
        disabled={!canCommit || isCommitting}
      >
        {#if isCommitting}
          <span class="spinner"></span>
          Committing...
        {:else}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
          </svg>
          Commit
        {/if}
      </button>
    </div>
  </div>

  <div class="staged-files">
    <div class="section-header">
      <h4>Staged Changes ({stagedFiles.length})</h4>
      {#if stagedFiles.length > 0}
        <button class="text-button" on:click={handleUnstageAll}>
          Unstage All
        </button>
      {/if}
    </div>

    <div class="file-list">
      {#if stagedFiles.length === 0}
        <div class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
          </svg>
          <p>No changes staged</p>
          <span>Stage changes from the source control panel</span>
        </div>
      {:else}
        {#each stagedFiles as file}
          <div class="file-item">
            <button class="file-info" on:click={() => handleFileClick(file)}>
              <span class="status-icon" style="color: {getStatusColor(file)}">{getStatusIcon(file)}</span>
              <span class="file-path">{file.path}</span>
            </button>
            <button class="unstage-button" on:click={() => handleUnstageFile(file)} title="Unstage">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4"/>
              </svg>
            </button>
          </div>
        {/each}
      {/if}
    </div>
  </div>
</div>

<style>
  .commit-view {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    background-color: var(--color-background);
    overflow: hidden;
  }

  .commit-form {
    padding: var(--spacing-lg);
    background-color: var(--color-surface-secondary);
    border-bottom: 1px solid var(--color-border);
    flex-shrink: 0;
  }

  .form-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--spacing-md);
  }

  .form-header h3 {
    margin: 0;
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-primary);
  }

  .file-count {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    background-color: var(--color-surface-hover);
    padding: var(--spacing-xs) var(--spacing-sm);
    border-radius: var(--radius-sm);
  }

  .message-input {
    position: relative;
    margin-bottom: var(--spacing-sm);
  }

  .commit-title {
    width: 100%;
    padding: var(--spacing-sm);
    padding-right: 60px;
    background-color: var(--color-background);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    color: var(--color-text-primary);
    font-size: var(--font-size-md);
    font-weight: var(--font-weight-medium);
    font-family: var(--font-family-mono);
  }

  .commit-title:focus {
    outline: none;
    border-color: var(--color-accent);
  }

  .char-count {
    position: absolute;
    right: var(--spacing-sm);
    top: 50%;
    transform: translateY(-50%);
    font-size: var(--font-size-xs);
    color: var(--color-text-secondary);
    font-family: var(--font-family-mono);
  }

  .char-count.warning {
    color: var(--color-warning);
  }

  .commit-description {
    width: 100%;
    padding: var(--spacing-sm);
    background-color: var(--color-background);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    color: var(--color-text-primary);
    font-size: var(--font-size-sm);
    font-family: var(--font-family-mono);
    resize: vertical;
    min-height: 80px;
    margin-bottom: var(--spacing-md);
  }

  .commit-description:focus {
    outline: none;
    border-color: var(--color-accent);
  }

  .commit-actions {
    display: flex;
    gap: var(--spacing-sm);
  }

  .commit-button {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    padding: var(--spacing-sm) var(--spacing-lg);
    background-color: var(--color-accent);
    border: none;
    border-radius: var(--radius-sm);
    color: white;
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
    cursor: pointer;
    transition: all 150ms ease;
  }

  .commit-button:hover:not(:disabled) {
    opacity: 0.9;
    transform: translateY(-1px);
  }

  .commit-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .commit-button svg {
    width: 16px;
    height: 16px;
  }

  .spinner {
    width: 14px;
    height: 14px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .staged-files {
    flex: 1;
    overflow-y: auto;
    padding: var(--spacing-md);
  }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--spacing-sm);
  }

  .section-header h4 {
    margin: 0;
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .text-button {
    background: transparent;
    border: none;
    color: var(--color-accent);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-medium);
    cursor: pointer;
    padding: var(--spacing-xs);
    border-radius: var(--radius-sm);
    transition: all 150ms ease;
  }

  .text-button:hover {
    background-color: rgba(var(--color-accent-rgb, 0, 113, 227), 0.1);
  }

  .file-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--spacing-xl) var(--spacing-md);
    color: var(--color-text-secondary);
    text-align: center;
  }

  .empty-state svg {
    width: 48px;
    height: 48px;
    margin-bottom: var(--spacing-md);
    opacity: 0.5;
  }

  .empty-state p {
    margin: 0 0 var(--spacing-xs) 0;
    font-size: var(--font-size-md);
    font-weight: var(--font-weight-medium);
    color: var(--color-text-primary);
  }

  .empty-state span {
    font-size: var(--font-size-sm);
  }

  .file-item {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
    border-radius: var(--radius-sm);
    transition: all 150ms ease;
  }

  .file-item:hover {
    background-color: var(--color-surface-hover);
  }

  .file-info {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    flex: 1;
    padding: var(--spacing-xs) var(--spacing-sm);
    background: transparent;
    border: none;
    color: var(--color-text-primary);
    font-size: var(--font-size-sm);
    cursor: pointer;
    text-align: left;
    border-radius: var(--radius-sm);
    transition: all 150ms ease;
  }

  .status-icon {
    font-weight: bold;
    font-size: var(--font-size-md);
  }

  .file-path {
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-family: var(--font-family-mono);
  }

  .unstage-button {
    width: 20px;
    height: 20px;
    padding: 2px;
    background: transparent;
    border: none;
    border-radius: var(--radius-sm);
    color: var(--color-text-secondary);
    cursor: pointer;
    opacity: 0;
    transition: all 150ms ease;
  }

  .file-item:hover .unstage-button {
    opacity: 1;
  }

  .unstage-button:hover {
    background-color: var(--color-surface-hover);
    color: var(--color-text-primary);
  }

  .unstage-button svg {
    width: 100%;
    height: 100%;
  }
</style>
